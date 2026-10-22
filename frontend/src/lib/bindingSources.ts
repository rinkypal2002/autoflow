/**
 * Binding source catalogue.
 *
 * Turns the live workflow (nodes, connections, variables) plus whatever the
 * last run produced into the grouped, searchable list of tokens the Properties
 * Panel offers. Everything the user can bind to comes from here, so the picker,
 * the expression editor and the executor can never drift apart.
 *
 * Upstream nodes are computed from the connection graph, so the picker only
 * offers values that will actually exist by the time the node runs. When the
 * graph is cyclic or a node is not yet connected the catalogue degrades
 * gracefully to "every other node", which keeps the panel useful while a
 * workflow is still being wired up.
 *
 * ── Business first ────────────────────────────────────────────────────────
 * The default picker offers *business* values only: the record a step actually
 * produced, with its transport wrapper removed (see `lib/carryForward`). A
 * step that returned
 *
 *   { success: true, statusCode: 200, message: 'Success',
 *     data: { employeeId: 'E101', name: 'Umesh', department: 'IT' } }
 *
 * offers `{{steps.Read Employee Excel.employeeId}}`, `…name` and
 * `…department` — not `success`, `statusCode`, `message` or `data.*`.
 *
 * Nothing is lost: every wrapper field, execution status and duration is still
 * bindable and still listed, in the **Technical Details** group at the end of
 * the catalogue (flagged `isTechnical` / `defaultCollapsed`), so an advanced
 * user can lift `{{steps.Read Employee Excel.statusCode}}` when they need it.
 */

import type {
  BindingSource,
  BindingSourceGroup,
  Connection,
  ExecutionSnapshot,
  NodeOutputRecord,
  WorkflowAction,
  WorkflowVariable,
} from '../types/workflow';
import { describeType, isPlainObject, summarizeValue, toStepKey } from './objectUtils';
import {
  humanizeFieldLabel,
  previousToken,
  projectBusinessData,
  stepToken,
  type BusinessField,
  type TechnicalField,
} from './carryForward';

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

/**
 * Alias kept for readability at call sites. The `isTechnical` and
 * `defaultCollapsed` flags now live on the canonical `BindingSourceGroup`
 * contract in `types/workflow`, so no cast is needed anywhere.
 */
export type EnrichedBindingGroup = BindingSourceGroup;

/* -------------------------------------------------------------------------- */
/*                                GRAPH HELPERS                               */
/* -------------------------------------------------------------------------- */

/** Node ids that can execute before `targetId`, nearest ancestor first. */
export function collectUpstreamNodeIds(targetId: string, connections: Connection[]): string[] {
  const incoming = new Map<string, string[]>();
  connections.forEach((connection) => {
    if (connection.isDisabled) return;
    const list = incoming.get(connection.targetId) ?? [];
    list.push(connection.sourceId);
    incoming.set(connection.targetId, list);
  });

  const ordered: string[] = [];
  const seen = new Set<string>([targetId]);
  let frontier = incoming.get(targetId) ?? [];
  let depth = 0;

  while (frontier.length > 0 && depth < 100) {
    const next: string[] = [];
    frontier.forEach((nodeId) => {
      if (seen.has(nodeId)) return;
      seen.add(nodeId);
      ordered.push(nodeId);
      next.push(...(incoming.get(nodeId) ?? []));
    });
    frontier = next;
    depth += 1;
  }

  return ordered;
}

/* -------------------------------------------------------------------------- */
/*                              SOURCE EXTRACTION                             */
/* -------------------------------------------------------------------------- */

/** Business leaves offered per node. Deliberately small — a picker, not a dump. */
const MAX_BUSINESS_LEAVES = 20;
/** Technical leaves offered per node inside Technical Details. */
const MAX_TECHNICAL_LEAVES = 10;

/** Project one payload into the business fields a picker should offer. */
function businessFieldsOf(payload: any): BusinessField[] {
  if (payload === undefined || payload === null) return [];
  return projectBusinessData(payload, { maxFields: MAX_BUSINESS_LEAVES }).fields;
}

/** Project one payload into the technical fields Technical Details should offer. */
function technicalFieldsOf(payload: any): TechnicalField[] {
  if (payload === undefined || payload === null) return [];
  return projectBusinessData(payload, { maxTechnical: MAX_TECHNICAL_LEAVES }).technical.slice(
    0,
    MAX_TECHNICAL_LEAVES
  );
}

/**
 * Turn business fields into binding sources under a namespace. `buildToken`
 * decides whether they read as `{{previous.x}}` or `{{steps.Read Excel.x}}`.
 */
function sourcesFromFields(
  fields: BusinessField[],
  buildToken: (path: string) => string,
  namespace: string,
  ownerLabel: string
): BindingSource[] {
  return fields.map((field) => ({
    token: buildToken(field.path),
    path: `${namespace}.${field.path}`,
    label: field.label || field.key,
    valueType: field.valueType,
    preview: field.preview,
    description: `${ownerLabel} → ${field.path}`,
  }));
}

/**
 * Fields a node is *expected* to produce, used before the workflow has ever
 * run. Read from the action's declared output hints so a freshly built
 * workflow can still be wired up without guessing.
 */
function declaredOutputKeys(action: WorkflowAction): string[] {
  const hints = action.aiHints?.expectedOutput;
  if (Array.isArray(hints) && hints.length > 0) {
    return hints.map((hint) => String(hint)).filter(Boolean);
  }
  const mapping = action.outputMapping;
  if (isPlainObject(mapping)) return Object.keys(mapping);
  return [];
}

/** The name a token should use for a node: its real name whenever that is safe. */
function tokenNameFor(
  action: WorkflowAction | undefined,
  record: NodeOutputRecord | undefined
): string {
  return (
    record?.nodeName ||
    action?.name ||
    record?.stepKey ||
    (action ? toStepKey(action.name || action.id) || action.id : '') ||
    record?.nodeId ||
    ''
  );
}

/* -------------------------------------------------------------------------- */
/*                                   BUILDER                                  */
/* -------------------------------------------------------------------------- */

export interface BindingCatalogueInput {
  /** The node being edited. */
  action: WorkflowAction | null;
  actions: WorkflowAction[];
  connections: Connection[];
  variables: WorkflowVariable[];
  /** Outputs recorded by the current or most recent run, if any. */
  records?: NodeOutputRecord[];
  /** Snapshot fallback when no live run is in memory. */
  snapshot?: ExecutionSnapshot | null;
  /**
   * Include the Technical Details group. Default true — the group is emitted
   * last and flagged `defaultCollapsed`, so it costs the default picker
   * nothing. Pass false for a strictly business-only catalogue.
   */
  includeTechnical?: boolean;
}

/**
 * Build the grouped catalogue shown by the binding picker:
 *
 *   Variables · Previous Step · Workflow Steps · Runtime · Technical Details
 *
 * Groups with no sources are omitted, so the picker never shows dead tabs.
 */
export function buildBindingCatalogue(input: BindingCatalogueInput): EnrichedBindingGroup[] {
  const { action, actions, connections, variables, includeTechnical = true } = input;

  const records = input.records?.length
    ? input.records
    : ((input.snapshot?.outputs ?? []) as NodeOutputRecord[]);
  const recordsByNodeId = new Map<string, NodeOutputRecord>();
  records.forEach((record) => recordsByNodeId.set(record.nodeId, record));

  const groups: EnrichedBindingGroup[] = [];
  const technicalSources: BindingSource[] = [];

  /* ------------------------------ variables ------------------------------ */

  // Namespaced (`{{variables.X}}`) rather than bare (`{{X}}`): a bare token can
  // be shadowed by a node's own property of the same name, the namespaced form
  // never can. Bare tokens already saved in workflows keep resolving exactly as
  // before — this only changes what the picker *writes* for new bindings.
  const variableSources: BindingSource[] = variables.map((variable) => ({
    token: `{{variables.${variable.name}}}`,
    path: `variables.${variable.name}`,
    label: variable.name,
    valueType: variable.type ?? describeType(variable.value),
    preview: variable.isSecret
      ? '••••••••'
      : summarizeValue(variable.value ?? variable.defaultValue),
    description: variable.description ?? 'Workflow variable',
    isSecret: Boolean(variable.isSecret),
  }));

  if (variableSources.length > 0) {
    groups.push({
      id: 'variables',
      label: 'Variables',
      icon: 'Variable',
      description: 'Workflow-wide values, readable and writable from every node.',
      sources: variableSources,
    });
  }

  /* --------------------------- upstream nodes ---------------------------- */

  const upstreamIds = action ? collectUpstreamNodeIds(action.id, connections) : [];
  const candidateIds =
    upstreamIds.length > 0
      ? upstreamIds
      : actions.filter((candidate) => candidate.id !== action?.id).map((candidate) => candidate.id);

  const actionsById = new Map(actions.map((candidate) => [candidate.id, candidate]));

  /* ---------------------------- previous step ---------------------------- */

  const previousId = upstreamIds[0];
  const previousAction = previousId ? actionsById.get(previousId) : undefined;
  const previousRecord = previousId ? recordsByNodeId.get(previousId) : undefined;
  const previousLabel = previousAction?.name ?? 'Previous step';

  if (previousAction) {
    const previousFields = businessFieldsOf(previousRecord?.output);

    const previousSources: BindingSource[] = [
      {
        token: previousToken(),
        path: 'previous',
        label: 'Entire previous output',
        valueType: 'object',
        preview: summarizeValue(previousRecord?.output),
        description: `Output of "${previousLabel}"`,
      },
      ...sourcesFromFields(previousFields, (path) => previousToken(path), 'previous', previousLabel),
    ];

    if (previousFields.length === 0) {
      declaredOutputKeys(previousAction).forEach((key) => {
        previousSources.push({
          token: previousToken(key),
          path: `previous.${key}`,
          label: humanizeFieldLabel(key) || key,
          valueType: 'unknown',
          preview: 'not run yet',
          description: `Declared output of "${previousLabel}"`,
        });
      });
    }

    groups.push({
      id: 'previous',
      label: 'Previous Step',
      icon: 'CornerUpLeft',
      description: `Immediately upstream: ${previousLabel}`,
      sources: previousSources,
    });

    technicalFieldsOf(previousRecord?.output).forEach((field) => {
      technicalSources.push({
        token: previousToken(field.path),
        path: `previous.${field.path}`,
        label: `${previousLabel} → ${field.label || field.key}`,
        valueType: field.valueType,
        preview: field.preview,
        description: 'Transport detail from the previous step',
      });
    });
  }

  /* ----------------------------- workflow steps -------------------------- */

  const stepSources: BindingSource[] = [];

  candidateIds.forEach((nodeId) => {
    const candidate = actionsById.get(nodeId);
    if (!candidate) return;

    const record = recordsByNodeId.get(nodeId);
    const stepKey = record?.stepKey || toStepKey(candidate.name || candidate.id) || candidate.id;
    const tokenName = tokenNameFor(candidate, record);
    const namespace = `steps.${stepKey}`;

    stepSources.push({
      token: stepToken(tokenName, 'output'),
      path: `${namespace}.output`,
      label: `${candidate.name} — entire output`,
      valueType: 'object',
      preview: summarizeValue(record?.output),
      description: candidate.type,
    });

    const fields = businessFieldsOf(record?.output);

    if (fields.length > 0) {
      sourcesFromFields(
        fields,
        (path) => stepToken(tokenName, path),
        namespace,
        candidate.name
      ).forEach((source) => {
        stepSources.push({ ...source, label: `${candidate.name} → ${source.label}` });
      });
    } else {
      declaredOutputKeys(candidate).forEach((key) => {
        stepSources.push({
          token: stepToken(tokenName, key),
          path: `${namespace}.${key}`,
          label: `${candidate.name} → ${humanizeFieldLabel(key) || key}`,
          valueType: 'unknown',
          preview: 'not run yet',
          description: 'Declared output field',
        });
      });
    }

    /* ------- technical detail for this step (collapsed by default) -------- */

    // `$status` (not `status`) so the token always means the node's EXECUTION
    // status and can never be shadowed by a payload field of the same name.
    technicalSources.push({
      token: stepToken(tokenName, '$status'),
      path: `${namespace}.$status`,
      label: `${candidate.name} — execution status`,
      valueType: 'string',
      preview: record?.status ?? 'not run yet',
      description: 'Engine status for this step',
    });

    if (record) {
      technicalSources.push({
        token: stepToken(tokenName, '$durationMs'),
        path: `${namespace}.$durationMs`,
        label: `${candidate.name} — duration (ms)`,
        valueType: 'number',
        preview: summarizeValue(record.durationMs),
        description: 'How long this step took',
      });
    }

    if (record?.error) {
      technicalSources.push({
        token: stepToken(tokenName, '$error'),
        path: `${namespace}.$error`,
        label: `${candidate.name} — error`,
        valueType: 'object',
        preview: summarizeValue(record.error.message),
        description: 'Failure detail for this step',
      });
    }

    technicalFieldsOf(record?.output).forEach((field) => {
      technicalSources.push({
        token: stepToken(tokenName, field.path),
        path: `${namespace}.${field.path}`,
        label: `${candidate.name} → ${field.label || field.key}`,
        valueType: field.valueType,
        preview: field.preview,
        description: 'Transport detail',
      });
    });
  });

  if (stepSources.length > 0) {
    groups.push({
      id: 'steps',
      label: 'Workflow Steps',
      icon: 'Workflow',
      description:
        'Every step that runs before this one. Values stay available for the whole run.',
      sources: stepSources,
    });
  }

  /* ------------------------------ loop context --------------------------- */

  // Loop bindings are design-time primitives, not observed plugin output. Keep
  // them visible even before a run so a user can wire the body of a For Each /
  // While / Repeat Until without first executing a half-built workflow. Outside
  // an active loop they simply resolve as missing; inside nested loops the bare
  // aliases always refer to the innermost frame and `loop.parent.*` addresses
  // the immediate outer frame.
  const loopSources: BindingSource[] = [
    {
      token: '{{currentItem}}',
      path: 'currentItem',
      label: 'Current item',
      valueType: 'any',
      description: 'Current For Each item (innermost active loop).',
    },
    {
      token: '{{currentIndex}}',
      path: 'currentIndex',
      label: 'Current index',
      valueType: 'number',
      description: 'Zero-based index of the current loop iteration.',
    },
    {
      token: '{{currentKey}}',
      path: 'currentKey',
      label: 'Current key',
      valueType: 'any',
      description: 'Object key when For Each iterates an object collection.',
    },
    {
      token: '{{iteration}}',
      path: 'iteration',
      label: 'Iteration',
      valueType: 'number',
      description: 'One-based iteration counter for the innermost active loop.',
    },
    {
      token: '{{loop.currentItem}}',
      path: 'loop.currentItem',
      label: 'Loop → current item',
      valueType: 'any',
      description: 'Namespaced current item for the innermost active loop.',
    },
    {
      token: '{{loop.currentIndex}}',
      path: 'loop.currentIndex',
      label: 'Loop → current index',
      valueType: 'number',
    },
    {
      token: '{{loop.iteration}}',
      path: 'loop.iteration',
      label: 'Loop → iteration',
      valueType: 'number',
    },
    {
      token: '{{loop.parent.currentItem}}',
      path: 'loop.parent.currentItem',
      label: 'Parent loop → current item',
      valueType: 'any',
      description: 'Current item from the immediate outer loop in a nested loop.',
    },
    {
      token: '{{loop.parent.currentIndex}}',
      path: 'loop.parent.currentIndex',
      label: 'Parent loop → current index',
      valueType: 'number',
    },
    {
      token: '{{loop.parent.iteration}}',
      path: 'loop.parent.iteration',
      label: 'Parent loop → iteration',
      valueType: 'number',
    },
  ];

  const hasLoopControls = actions.some((candidate) => {
    const type = String(candidate.type ?? '').trim().toLowerCase();
    return (
      type === 'workflow-for-each' ||
      type === 'workflow-while' ||
      type === 'workflow-repeat-until'
    );
  });
  if (hasLoopControls) {
    groups.push({
      id: 'loop-context',
      label: 'Loop Context',
      icon: 'Repeat2',
      description: 'Current item/index/iteration plus the immediate parent loop for nested execution.',
      sources: loopSources,
    });
  }

  /* ------------------------- runtime & run metadata ---------------------- */

  const runtimeSources: BindingSource[] = [
    {
      token: '{{run.id}}',
      path: 'run.id',
      label: 'Run id',
      valueType: 'string',
      description: 'Unique identifier for the current execution.',
    },
    {
      token: '{{run.startedAt}}',
      path: 'run.startedAt',
      label: 'Run started at',
      valueType: 'string',
      description: 'ISO timestamp of when the run began.',
    },
    {
      token: '{{workflow.name}}',
      path: 'workflow.name',
      label: 'Workflow name',
      valueType: 'string',
    },
    {
      token: '{{workflow.id}}',
      path: 'workflow.id',
      label: 'Workflow id',
      valueType: 'string',
    },
    {
      token: '{{now}}',
      path: 'now',
      label: 'Current timestamp (ISO)',
      valueType: 'string',
    },
    {
      token: '{{timestamp}}',
      path: 'timestamp',
      label: 'Current timestamp (epoch ms)',
      valueType: 'number',
    },
  ];

  const snapshotRuntime = input.snapshot?.runtime ?? {};
  Object.entries(snapshotRuntime).forEach(([key, value]) => {
    runtimeSources.push({
      token: `{{runtime.${key}}}`,
      path: `runtime.${key}`,
      label: humanizeFieldLabel(key) || key,
      valueType: describeType(value),
      preview: summarizeValue(value),
      description: 'Runtime scratch value',
    });
  });

  groups.push({
    id: 'runtime',
    label: 'Runtime',
    icon: 'Clock',
    description: 'Run metadata and scratch values held for the duration of the execution.',
    sources: runtimeSources,
  });

  /* --------------------------- technical details ------------------------- */

  if (includeTechnical && technicalSources.length > 0) {
    groups.push({
      id: 'technical',
      label: 'Technical Details',
      icon: 'Wrench',
      description:
        'Status codes, headers, wrappers and timings. Still bindable, kept out of the default picker.',
      sources: technicalSources,
      isTechnical: true,
      defaultCollapsed: true,
    });
  }

  return groups;
}

/* -------------------------------------------------------------------------- */
/*                              CATALOGUE HELPERS                             */
/* -------------------------------------------------------------------------- */

/** Flatten a catalogue into a single searchable list. */
export function flattenCatalogue(groups: BindingSourceGroup[]): BindingSource[] {
  return groups.flatMap((group) => group.sources);
}

/** The business-only view of a catalogue, with Technical Details removed. */
export function businessGroupsOnly<T extends EnrichedBindingGroup>(groups: T[]): T[] {
  return groups.filter((group) => !group.isTechnical && group.id !== 'technical');
}

/**
 * Case-insensitive filter across token, label, preview and description.
 * Generic, so a caller keeps whatever group type it passed in.
 */
export function filterCatalogue<T extends BindingSourceGroup>(groups: T[], term: string): T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return groups;

  return groups
    .map((group) => ({
      ...group,
      sources: group.sources.filter((source) =>
        [source.token, source.label, source.description, source.valueType, source.preview]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      ),
    }))
    .filter((group) => group.sources.length > 0);
}
