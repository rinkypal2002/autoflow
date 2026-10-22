/**
 * Named output ports — logical branches a step can route from.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 *
 * Before this module, every node had exactly one logical output. The executor's
 * routing loop pushed the *same* value down every outgoing edge:
 *
 *     executionQueue.push({ nodeId: connection.targetId, inputData: actionOutput });
 *
 * `Connection.sourcePort` existed in the schema and in the Connection modal, but
 * nothing read it. So a Filter step that genuinely produced two results —
 * `data` (kept rows) and `unmatchedData` (rejected rows) — handed the whole
 * envelope to both downstream branches, and each branch had to *know* to bind
 * `{{previous.unmatchedData}}` rather than `{{previous.data}}`. Get that wrong
 * and the exception report silently reports on the matched rows. Nothing warns
 * you, because both bindings resolve.
 *
 * That is the gap between a node editor and a process engine. In a process
 * engine a branch is a declared thing: the step says "I have a matched path and
 * an unmatched path", the canvas draws two ports, and whatever you connect to
 * the unmatched port receives the unmatched rows *as its input* — not the whole
 * envelope with a naming convention you have to remember.
 *
 * ── The compatibility rule, stated once ───────────────────────────────────
 *
 * **A connection with no `sourcePort` behaves exactly as it does today: it
 * receives the node's entire output.**
 *
 * This is the whole backward-compatibility story and it is deliberately blunt.
 * Every saved workflow on disk has `sourcePort` unset, so every saved workflow
 * keeps its current data flow byte for byte — including the `{{previous.data}}`
 * bindings already written against the full envelope. Ports change behaviour
 * only for edges a user explicitly draws from a named port, which cannot exist
 * in a file written before this feature.
 *
 * The alternative — making the default port implicit, so an unported edge on a
 * Filter node starts receiving only the matched slice — would be cleaner in the
 * abstract and would break every existing Filter workflow, because
 * `{{previous.data}}` would resolve to `undefined` once `previous` *is* the
 * rows. Ports are opt-in per edge for that reason.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * Ports do not hide data. The full upstream output stays addressable from any
 * later step through `{{steps.<Name>.…}}` regardless of which port an edge
 * used. A port narrows what a branch *receives by default*; it never deletes a
 * value from the run context. "Do not discard unmatched rows" is enforced by
 * construction, not by convention.
 *
 * Pure and framework-free: no React, no DOM, no side effects.
 */

import type { Connection, WorkflowAction } from '../types/workflow';
import type { OutputPort } from '../types/pluginContract';
import { unwrapEnvelope } from './carryForward';
import { isPlainObject } from './objectUtils';
import { extractDataSetView } from './dataset';

/* -------------------------------------------------------------------------- */
/*                              PORT DISCOVERY                                */
/* -------------------------------------------------------------------------- */

/**
 * The ports a step declares, or `[]` when it declares none.
 *
 * An empty result is meaningful: it marks a single-output step, whose edges all
 * carry the full output. Callers must not substitute a synthetic default port —
 * that would quietly convert legacy nodes to port semantics.
 */
export function getOutputPorts(action: Pick<WorkflowAction, 'outputPorts'> | null | undefined): OutputPort[] {
  const ports = action?.outputPorts;
  if (!Array.isArray(ports) || ports.length === 0) return [];
  return ports.filter((port): port is OutputPort => Boolean(port && typeof port.id === 'string' && port.id));
}

/** True when the step routes through named branches rather than a single output. */
export function hasDeclaredPorts(action: Pick<WorkflowAction, 'outputPorts'> | null | undefined): boolean {
  return getOutputPorts(action).length > 0;
}

/** Look up one declared port by id. */
export function findPort(
  action: Pick<WorkflowAction, 'outputPorts'> | null | undefined,
  portId: string | null | undefined
): OutputPort | undefined {
  if (!portId) return undefined;
  return getOutputPorts(action).find((port) => port.id === portId);
}

/**
 * The port a step treats as its main path — the one carrying the business
 * happy-path result. Used for auto-assignment when a user drags from the node
 * body rather than from a specific port handle, and for ordering in the UI.
 */
export function getPrimaryPort(
  action: Pick<WorkflowAction, 'outputPorts'> | null | undefined
): OutputPort | undefined {
  const ports = getOutputPorts(action);
  if (ports.length === 0) return undefined;
  return ports.find((port) => port.isDefault) ?? ports[0];
}

/**
 * Resolve which port an edge routes through.
 *
 * Returns `undefined` for a legacy edge — one with no `sourcePort` — and that
 * `undefined` is the signal to deliver the whole output. It is returned rather
 * than defaulted precisely so the caller cannot lose the distinction.
 *
 * A `sourcePort` naming a port the step does not declare also returns
 * `undefined`: an edge left over from a renamed port must keep delivering data
 * rather than silently delivering nothing. `validatePortWiring` reports it.
 */
export function resolveConnectionPort(
  action: Pick<WorkflowAction, 'outputPorts'> | null | undefined,
  connection: Pick<Connection, 'sourcePort'> | null | undefined
): OutputPort | undefined {
  const portId = connection?.sourcePort?.trim();
  if (!portId) return undefined;
  return findPort(action, portId);
}

/* -------------------------------------------------------------------------- */
/*                             PAYLOAD SELECTION                              */
/* -------------------------------------------------------------------------- */

/** Read a dotted path against a value, tolerating a missing intermediate. */
function readPath(source: any, path: string): any {
  if (!path) return source;
  let cursor = source;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/**
 * Pull one port's slice out of a step's raw output.
 *
 * Port paths are declared relative to the *business* payload, matching how
 * `OutputSchema.fields` are declared, so a plugin that wraps its result in
 * `{ success, message, data: { … } }` declares `payloadPath: 'rows'` and not
 * `'data.rows'`. The wrapper is stripped here with the same `unwrapEnvelope`
 * the carry-forward layer uses, so the two agree by construction.
 *
 * The raw output is tried as a fallback. Some plugins return the branch key at
 * the top level and others inside the envelope; trying both means a port
 * declaration does not have to encode which, and a plugin that later gains or
 * loses a wrapper does not break its ports.
 */
export function selectPortPayload(output: any, port: OutputPort | null | undefined): any {
  if (!port) return output;
  const path = port.payloadPath?.trim();
  if (!path) return output;

  const { payload } = unwrapEnvelope(output);
  const fromBusiness = readPath(payload, path);
  if (fromBusiness !== undefined) return fromBusiness;

  const fromRaw = readPath(output, path);
  if (fromRaw !== undefined) return fromRaw;

  return undefined;
}

/**
 * How many business records a port's slice carries, or `null` when the value is
 * not countable.
 *
 * `null` and `0` mean different things to the routing rule below and must not
 * be collapsed: `null` is "this branch does not carry rows, so emptiness is not
 * a concept that applies", while `0` is "this branch carries rows and there are
 * none". Only the second may suppress a branch.
 */
export function countPortRecords(value: any): number | null {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;

  const view = extractDataSetView(value);
  if (view) {
    if (typeof view.rowCount === 'number') return view.rowCount;
    if (Array.isArray(view.rows)) return view.rows.length;
  }

  if (isPlainObject(value)) {
    const rows = (value as any).rows ?? (value as any).data;
    if (Array.isArray(rows)) return rows.length;
    if (typeof (value as any).rowCount === 'number') return (value as any).rowCount;
    return null;
  }

  return null;
}

/** The outcome of deciding whether one edge carries data this run. */
export interface PortRouting {
  /** The resolved port, or `undefined` for a legacy full-output edge. */
  port?: OutputPort;
  /** What the downstream step receives as its input. */
  payload: any;
  /** Records on this branch, or `null` when not countable. */
  recordCount: number | null;
  /** True when the branch is suppressed because it carried no records. */
  skipped: boolean;
  /** Human-readable reason, suitable for the run log. */
  reason: string;
}

/**
 * Decide what a single outgoing edge carries.
 *
 * The empty-branch rule earns its complexity. An exception branch that fires
 * with zero rows is how a workflow emails "0 validation failures attached" to a
 * reviewer every night until they filter the sender — the classic complaint
 * against generated process automation. So a port may declare `skipWhenEmpty`,
 * and when its slice carries zero records the branch is not taken and the run
 * log says so explicitly.
 *
 * Three guards keep that from being surprising:
 *
 *   1. It is opt-in per port, never inferred.
 *   2. It applies only to countable slices. A branch carrying a scalar or an
 *      object is never suppressed, because "empty" is not defined for it.
 *   3. A single edge can override it with `metadata.routeWhenEmpty`, for the
 *      genuine "always send the report, even if it says zero" case.
 */
export function routeConnection(
  action: Pick<WorkflowAction, 'outputPorts'> | null | undefined,
  connection: Pick<Connection, 'sourcePort' | 'metadata'> | null | undefined,
  output: any
): PortRouting {
  const port = resolveConnectionPort(action, connection);

  if (!port) {
    return {
      port: undefined,
      payload: output,
      recordCount: null,
      skipped: false,
      reason: 'full output (no port)',
    };
  }

  const payload = selectPortPayload(output, port);
  const recordCount = countPortRecords(payload);
  const forceRoute = (connection as any)?.metadata?.routeWhenEmpty === true;

  const skipped =
    port.skipWhenEmpty === true && recordCount === 0 && !forceRoute;

  return {
    port,
    payload,
    recordCount,
    skipped,
    reason: skipped
      ? `${port.label} carried 0 records — branch not taken`
      : recordCount === null
        ? `${port.label}`
        : `${port.label} (${recordCount} record${recordCount === 1 ? '' : 's'})`,
  };
}

/* -------------------------------------------------------------------------- */
/*                            EXECUTION SUMMARY                               */
/* -------------------------------------------------------------------------- */

/** One branch's result, for the Execution Results panel. */
export interface PortSummary {
  id: string;
  label: string;
  tone: OutputPort['tone'];
  recordCount: number | null;
  /** True when the port produced no value at all (not merely zero records). */
  absent: boolean;
  description?: string;
}

/**
 * Describe every branch a step produced, so the Execution Results panel can
 * report "1,180 matched / 68 unmatched" instead of making a business user open
 * raw JSON to find out whether anything was rejected.
 */
export function summarisePorts(
  action: Pick<WorkflowAction, 'outputPorts'> | null | undefined,
  output: any
): PortSummary[] {
  return getOutputPorts(action).map((port) => {
    const payload = selectPortPayload(output, port);
    return {
      id: port.id,
      label: port.label,
      tone: port.tone,
      recordCount: countPortRecords(payload),
      absent: payload === undefined,
      description: port.description,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*                              WIRING VALIDATION                             */
/* -------------------------------------------------------------------------- */

export type PortIssueSeverity = 'error' | 'warning' | 'info';

export interface PortIssue {
  severity: PortIssueSeverity;
  nodeId: string;
  nodeName: string;
  portId?: string;
  message: string;
}

/**
 * Check how a workflow's branches are wired.
 *
 * Everything here is advisory. The executor never consults it, and no result
 * blocks a run — a half-wired workflow is a normal intermediate state while
 * someone is building, and a tool that refuses to run one is a tool people work
 * around. These surface in the canvas as badges instead.
 */
export function validatePortWiring(
  actions: WorkflowAction[],
  connections: Connection[]
): PortIssue[] {
  const issues: PortIssue[] = [];
  const byId = new Map(actions.map((action) => [action.id, action]));

  const outgoing = new Map<string, Connection[]>();
  for (const connection of connections) {
    if (!outgoing.has(connection.sourceId)) outgoing.set(connection.sourceId, []);
    outgoing.get(connection.sourceId)!.push(connection);
  }

  for (const action of actions) {
    const ports = getOutputPorts(action);
    if (ports.length === 0) continue;

    const edges = (outgoing.get(action.id) ?? []).filter((edge) => !edge.isDisabled);
    const name = action.name || action.type || 'Untitled step';

    // An edge naming a port the step no longer declares. It still carries the
    // full output, so this is a correctness warning rather than a break.
    for (const edge of edges) {
      const declared = edge.sourcePort?.trim();
      if (declared && !ports.some((port) => port.id === declared)) {
        issues.push({
          severity: 'error',
          nodeId: action.id,
          nodeName: name,
          portId: declared,
          message:
            `Connection routes from a "${declared}" output that "${name}" no longer has. ` +
            `It is currently carrying the step's full output. Re-point it at one of: ` +
            ports.map((port) => port.label).join(', ') + '.',
        });
      }
    }

    // A step with branches whose edges are all unported is the pre-upgrade
    // shape. It works, but the author is probably not getting what they think.
    const ported = edges.filter((edge) => edge.sourcePort?.trim());
    if (edges.length > 0 && ported.length === 0) {
      issues.push({
        severity: 'info',
        nodeId: action.id,
        nodeName: name,
        message:
          `"${name}" has ${ports.length} outputs (${ports.map((p) => p.label).join(', ')}) ` +
          `but its connections do not specify one, so each receives the full result. ` +
          `That still works. Assign an output to each connection to have every branch ` +
          `receive only its own rows.`,
      });
    }

    for (const port of ports) {
      const connected = edges.filter((edge) => edge.sourcePort?.trim() === port.id);

      if (connected.length === 0 && ported.length > 0 && !port.optional) {
        issues.push({
          severity: 'warning',
          nodeId: action.id,
          nodeName: name,
          portId: port.id,
          message:
            `"${port.label}" on "${name}" is not connected to anything. ` +
            (port.tone === 'exception'
              ? 'Rows leaving by this path are being dropped without review.'
              : 'This branch produces no downstream effect.'),
        });
      }

      // Both branches into one step is occasionally deliberate (a single audit
      // log) and usually a mis-drag, so it is a warning rather than an error.
      const targets = connected.map((edge) => edge.targetId);
      for (const other of ports) {
        if (other.id === port.id) continue;
        const otherTargets = edges
          .filter((edge) => edge.sourcePort?.trim() === other.id)
          .map((edge) => edge.targetId);
        const shared = targets.filter((target) => otherTargets.includes(target));
        for (const target of shared) {
          if (port.id > other.id) continue; // report the pair once
          issues.push({
            severity: 'warning',
            nodeId: action.id,
            nodeName: name,
            portId: port.id,
            message:
              `"${port.label}" and "${other.label}" both route into ` +
              `"${byId.get(target)?.name ?? target}". That step will run twice, ` +
              `once per branch. Use separate steps unless this is intentional.`,
          });
        }
      }
    }
  }

  return issues;
}
