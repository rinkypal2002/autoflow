/**
 * Workflow execution context — the shared store that makes workflow-wide data
 * carry-forward possible.
 *
 * Before this existed the executor threw every node's result away: the run loop
 * handed the output to the *immediately connected* node as `inputData`, and
 * `executeAction` ignored that argument entirely. Anything a node produced was
 * therefore invisible to every other node.
 *
 * The context fixes that by holding, for the whole duration of a run:
 *   • workflow variables (readable and writable from any node)
 *   • every node's output, keyed by node id AND by a binding-safe step key
 *   • the previous node's output
 *   • runtime scratch values, file references, API responses, database
 *     results, extracted text and computed values
 *
 * `buildScope()` projects all of that into the single layered object the
 * expression resolver reads, so `{{employeeId}}`, `{{previous.employeeId}}`
 * and `{{steps.ReadEmployeeExcel.employeeId}}` all resolve from one source of
 * truth, from any node, at any point in the workflow.
 *
 * ── Business layer ────────────────────────────────────────────────────────
 * Node outputs usually arrive wrapped in transport noise:
 *
 *   { success: true, statusCode: 200, message: 'Success',
 *     data: { employeeId: 'E101', name: 'Umesh', department: 'IT' } }
 *
 * `buildScope` therefore layers the *unwrapped* payload into every node view
 * (see `lib/carryForward`), so `{{previous.employeeId}}` and
 * `{{steps.Read Employee.employeeId}}` resolve directly against the business
 * record. The raw payload is layered on top of it, so a node's own response
 * always wins a name collision and no existing plugin changes behaviour —
 * `{{previous.data.employeeId}}`, `{{steps.X.statusCode}}` and every token
 * that worked before still works. Nothing is removed from the runtime; the
 * wrapper is only demoted out of the *default* view, and stays addressable
 * through `{{steps.X.$technical}}` and the Technical Details group in the UI.
 */

import type {
  ActionStatus,
  ExecutionScope,
  ExecutionSnapshot,
  NodeOutputRecord,
  OutputBucket,
  WorkflowAction,
  WorkflowVariable,
} from '../types/workflow';
import {
  deepClone,
  flattenObject,
  isPlainObject,
  toStepKey,
  truncateForStorage,
} from './objectUtils';
import { businessValues, technicalValues, unwrapEnvelope } from './carryForward';
import { compactForCarryForward, extractDataSetView } from './dataset';
import { summarisePorts } from './ports';

/* -------------------------------------------------------------------------- */
/*                              OUTPUT CLASSIFIER                             */
/* -------------------------------------------------------------------------- */

/**
 * Sort a node's output into the bucket that best describes it. Buckets are an
 * addressing convenience — the raw output is always available under
 * `steps.<Name>` regardless of which bucket it also lands in.
 */
/**
 * Bounds applied whenever a node output is indexed into dot paths.
 *
 * Previously `recordNodeOutput` called `flattenObject(output)` with no options
 * at all, so a large tabular payload produced one entry per leaf — roughly four
 * million of them for a 200,000-row sheet — and `buildScope()` then re-spread
 * that index into a fresh object on every property resolution of every later
 * step, several times per node. These bounds make the index proportional to the
 * shape of a payload rather than to its size, which is what a `{{key}}`
 * shorthand lookup actually needs: nobody binds `rows.148372.amount`.
 */
const FLATTEN_BOUNDS = { maxDepth: 4, maxArrayItems: 10 } as const;

/** Hard ceiling on flattened entries, applied whatever the bounds produce. */
const MAX_FLATTENED_ENTRIES = 5000;

/** Flattens a value for `{{key}}` lookups without letting the index grow unbounded. */
function flattenBounded(value: any): Record<string, any> {
  if (!isPlainObject(value) && !Array.isArray(value)) return {};

  const flat = flattenObject(value, FLATTEN_BOUNDS);
  const keys = Object.keys(flat);
  if (keys.length <= MAX_FLATTENED_ENTRIES) return flat;

  const capped: Record<string, any> = {};
  for (let index = 0; index < MAX_FLATTENED_ENTRIES; index += 1) {
    capped[keys[index]] = flat[keys[index]];
  }
  return capped;
}

/**
 * What actually gets stored for a node.
 *
 * A DataSet payload is compacted first: the run record keeps the schema, the
 * statistics, the handle and a preview of the rows rather than every row of
 * every step for the whole run. Nothing becomes unreachable — the rows stay on
 * the server behind the handle and `fetchDatasetPage` retrieves them on demand.
 */
function storableOutput(output: any): any {
  const view = extractDataSetView(output);
  if (!view) return output;

  const compacted = compactForCarryForward(view);
  if (compacted === view) return output;

  // Preserve the transport envelope the payload arrived in, so every token that
  // resolved before — `{{steps.X.data.rows}}`, `{{steps.X.success}}` — still does.
  if (isPlainObject(output) && (output as any).data === view) {
    return { ...output, data: compacted };
  }
  return compacted;
}

/**
 * The raw output minus the envelope key that was unwrapped out of it.
 *
 * Spreading the whole raw output over the business layer is what lets a node's
 * own response win a name collision, and that behaviour is kept. But the
 * envelope key is not part of the response — it is the wrapper the response
 * arrived in, and the business layer already holds its contents. Putting it
 * back is what makes `previous.data` mean the wrapper rather than the rows.
 */
function withoutEnvelopeHead(output: any, envelopePath?: string): Record<string, any> {
  if (!isPlainObject(output)) return {};
  const head = String(envelopePath ?? '').split('.')[0];
  if (!head) return output;

  const rest: Record<string, any> = {};
  Object.entries(output).forEach(([key, value]) => {
    if (key !== head) rest[key] = value;
  });
  return rest;
}

export function classifyOutput(output: any): OutputBucket {
  if (!isPlainObject(output)) {
    return typeof output === 'string' ? 'extractedText' : 'generic';
  }

  const keys = Object.keys(output).map((key) => key.toLowerCase());
  const has = (...candidates: string[]) => candidates.some((candidate) => keys.includes(candidate));

  if (has('rows', 'recordset', 'records', 'resultset', 'affectedrows', 'rowcount')) {
    return 'databaseResult';
  }
  if (has('file', 'filename', 'filepath', 'files', 'contentbase64', 'downloadurl')) {
    return 'fileReference';
  }
  if (has('text', 'extractedtext', 'content', 'ocrtext', 'transcript')) {
    return 'extractedText';
  }
  if (has('status', 'statuscode', 'headers', 'data', 'body', 'response')) {
    return 'apiResponse';
  }
  return 'computed';
}

/* -------------------------------------------------------------------------- */
/*                                  OPTIONS                                   */
/* -------------------------------------------------------------------------- */

export interface ExecutionContextInit {
  workflowId: string;
  workflowName?: string;
  runId: string;
  variables?: WorkflowVariable[];
  env?: Record<string, any>;
  triggeredBy?: string;
}

export interface RecordOutputOptions {
  input?: any;
  startedAt?: string;
  durationMs?: number;
  status?: ActionStatus;
}

/** Cached business/technical split of one node's output. */
interface NodeProjection {
  /** Output reference this projection was built from (cache key). */
  source: any;
  /** Where the payload sat inside the raw output (`''` when already unwrapped). */
  envelopePath: string;
  /** The payload with its transport wrapper removed. */
  payload: any;
  /** Top-level business values, layered into the node's scope view. */
  business: Record<string, any>;
  /** Business values flattened to bare keys, for `{{employeeId}}` lookups. */
  flatBusiness: Record<string, any>;
  /** Transport / diagnostic values, reachable via `{{steps.X.$technical}}`. */
  technical: Record<string, any>;
}

/* -------------------------------------------------------------------------- */
/*                            EXECUTION CONTEXT                               */
/* -------------------------------------------------------------------------- */

export class WorkflowExecutionContext {
  readonly runId: string;
  readonly workflowId: string;
  readonly workflowName: string;
  readonly startedAt: string;
  readonly triggeredBy: string;

  /** Workflow-wide variables. Globally readable and writable. */
  private variables: Record<string, any> = {};
  /** Original definitions, so secrets stay masked in snapshots and previews. */
  private variableDefs = new Map<string, WorkflowVariable>();

  /** Outputs keyed by canvas node id. */
  private outputsById = new Map<string, NodeOutputRecord>();
  /** Execution order of node ids. */
  private order: string[] = [];
  /** Binding key -> node id. Holds the step key, the raw name and the id. */
  private stepIndex = new Map<string, string>();

  private previousNodeId: string | null = null;

  /** Scratch buckets. All are addressable from bindings. */
  private runtime: Record<string, any> = {};
  private files: Record<string, any> = {};
  private apiResponses: Record<string, any> = {};
  private databaseResults: Record<string, any> = {};
  private extractedText: Record<string, any> = {};
  private computed: Record<string, any> = {};
  private env: Record<string, any> = {};

  private sequenceCounter = 0;

  /**
   * Scheduler execution identity per node. Outside loops this is the node id;
   * inside loops it includes the active loop/iteration path. Retries keep the
   * same identity, while the next loop iteration receives a new one. This keeps
   * `record.attempt` meaning "retry attempt" instead of accidentally counting
   * loop iterations as retries.
   */
  private executionInstanceByNode = new Map<string, string>();

  /**
   * Physical execution history kept alongside the logical `outputsById` view.
   * The logical map intentionally remains one record per canvas node so
   * bindings, Preview Data and the normal Execution Panel keep their existing
   * clean behaviour. This history is persistence/diagnostic detail only.
   */
  private executionInstanceRecords = new Map<string, NodeOutputRecord>();
  private executionInstanceOrder: string[] = [];
  private executionInstanceSequenceByKey = new Map<string, number>();
  private executionInstanceSequenceCounter = 0;

  /**
   * Memoised business/technical split per node. `buildScope()` runs several
   * times per node (properties, URL, headers, body), so the unwrapping is
   * cached against the output reference and recomputed only when a node
   * records a new result.
   */
  private projectionCache = new Map<string, NodeProjection>();

  constructor(init: ExecutionContextInit) {
    this.runId = init.runId;
    this.workflowId = init.workflowId;
    this.workflowName = init.workflowName ?? '';
    this.startedAt = new Date().toISOString();
    this.triggeredBy = init.triggeredBy ?? 'manual';
    this.env = { ...(init.env ?? {}) };

    (init.variables ?? []).forEach((variable) => {
      if (!variable?.name) return;
      this.variableDefs.set(variable.name, variable);
      this.variables[variable.name] =
        variable.value !== undefined && variable.value !== null && variable.value !== ''
          ? variable.value
          : variable.defaultValue;
    });
  }

  /* ------------------------------ variables ------------------------------ */

  getVariable(name: string): any {
    return this.variables[name];
  }

  getVariables(): Record<string, any> {
    return { ...this.variables };
  }

  /**
   * Write a workflow variable. Any node can call this and every later node
   * sees the new value immediately — including nodes on other branches.
   */
  setVariable(name: string, value: any): void {
    if (!name) return;
    this.variables[name] = value;
    const definition = this.variableDefs.get(name);
    if (definition) {
      this.variableDefs.set(name, { ...definition, lastUpdated: new Date().toISOString() });
    }
  }

  setVariables(values: Record<string, any>): void {
    Object.entries(values ?? {}).forEach(([name, value]) => this.setVariable(name, value));
  }

  isSecretVariable(name: string): boolean {
    const definition = this.variableDefs.get(name);
    return Boolean(definition?.isSecret || definition?.masked || definition?.scope === 'secret');
  }

  secretVariableNames(): string[] {
    return [...this.variableDefs.values()]
      .filter((variable) => variable.isSecret || variable.masked || variable.scope === 'secret')
      .map((variable) => variable.name);
  }

  /* ---------------------------- runtime buckets --------------------------- */

  setRuntimeValue(key: string, value: any): void {
    if (key) this.runtime[key] = value;
  }

  setRuntimeValues(values: Record<string, any>): void {
    Object.entries(values ?? {}).forEach(([key, value]) => {
      if (key) this.runtime[key] = value;
    });
  }

  clearRuntimeValue(key: string): void {
    if (key) delete this.runtime[key];
  }

  getRuntimeValue(key: string): any {
    return this.runtime[key];
  }

  registerFile(key: string, reference: any): void {
    if (key) this.files[key] = reference;
  }

  getFiles(): Record<string, any> {
    return { ...this.files };
  }

  /* ---------------------------- node lifecycle --------------------------- */

  private executionHistoryKey(executionInstanceKey: string, attempt: number): string {
    return `${executionInstanceKey}\u0000${Math.max(1, attempt)}`;
  }

  private executionSequenceFor(executionInstanceKey: string, preferred?: number): number {
    const existing = this.executionInstanceSequenceByKey.get(executionInstanceKey);
    if (existing !== undefined) return existing;

    const preferredNumber = Number(preferred);
    const sequence = Number.isFinite(preferredNumber) && preferredNumber > 0
      ? Math.trunc(preferredNumber)
      : this.executionInstanceSequenceCounter + 1;

    this.executionInstanceSequenceCounter = Math.max(
      this.executionInstanceSequenceCounter,
      sequence
    );
    this.executionInstanceSequenceByKey.set(executionInstanceKey, sequence);
    return sequence;
  }

  private storeExecutionInstanceRecord(record: NodeOutputRecord): NodeOutputRecord {
    const executionInstanceKey = String(
      record.executionInstanceKey || this.executionInstanceByNode.get(record.nodeId) || record.nodeId
    );
    const executionInstanceSequence = this.executionSequenceFor(
      executionInstanceKey,
      record.executionInstanceSequence
    );
    const attempt = Math.max(1, Number(record.attempt ?? 1) || 1);
    const normalized: NodeOutputRecord = {
      ...record,
      executionInstanceKey,
      executionInstanceSequence,
      attempt,
    };
    const historyKey = this.executionHistoryKey(executionInstanceKey, attempt);
    if (!this.executionInstanceRecords.has(historyKey)) {
      this.executionInstanceOrder.push(historyKey);
    }
    this.executionInstanceRecords.set(historyKey, normalized);
    return normalized;
  }

  /**
   * Register a node as started so partial state is visible in snapshots.
   *
   * Safe to call more than once for the same node: a retry re-enters here, and
   * re-numbering the step each time would make the Preview Data table skip
   * sequence numbers (1, 3, 4…). The original position and start time are
   * therefore kept, and only the attempt counter advances.
   */
  recordNodeStart(
    action: WorkflowAction,
    input?: any,
    options: { executionInstanceKey?: string } = {}
  ): NodeOutputRecord {
    const existing = this.outputsById.get(action.id);
    const stepKey = existing?.stepKey || toStepKey(action.name || action.id);

    const requestedExecutionInstanceKey =
      typeof options.executionInstanceKey === 'string' && options.executionInstanceKey.trim()
        ? options.executionInstanceKey.trim()
        : undefined;
    const previousInstanceKey = this.executionInstanceByNode.get(action.id);
    const isNewExecutionInstance = Boolean(
      requestedExecutionInstanceKey && previousInstanceKey !== requestedExecutionInstanceKey
    );
    if (requestedExecutionInstanceKey) {
      this.executionInstanceByNode.set(action.id, requestedExecutionInstanceKey);
    }
    const executionInstanceKey =
      requestedExecutionInstanceKey || previousInstanceKey || action.id;
    const executionInstanceSequence = this.executionSequenceFor(executionInstanceKey);

    let sequence: number;
    if (existing) {
      sequence = existing.sequence;
    } else {
      this.sequenceCounter += 1;
      sequence = this.sequenceCounter;
    }

    const record: NodeOutputRecord = {
      nodeId: action.id,
      nodeName: action.name ?? action.id,
      stepKey,
      type: action.type,
      category: action.category,
      executionInstanceKey,
      executionInstanceSequence,
      sequence,
      attempt: isNewExecutionInstance ? 1 : (existing?.attempt ?? 0) + 1,
      status: 'running',
      bucket: 'generic',
      // Keep the first attempt's start time so the recorded duration covers the
      // whole retry cycle, which is what a user means by "how long did it take".
      startedAt: isNewExecutionInstance ? new Date().toISOString() : (existing?.startedAt ?? new Date().toISOString()),
      input: input === undefined && !isNewExecutionInstance ? existing?.input : deepClone(input),
      output: undefined,
      flattened: {},
      error: null,
    };

    this.outputsById.set(action.id, record);
    this.storeExecutionInstanceRecord(record);
    if (!this.order.includes(action.id)) this.order.push(action.id);
    this.indexStep(action, stepKey);

    return record;
  }

  private indexStep(action: WorkflowAction, stepKey: string): void {
    this.stepIndex.set(action.id, action.id);
    if (stepKey) this.stepIndex.set(stepKey, action.id);
    if (action.name) {
      this.stepIndex.set(action.name, action.id);
      this.stepIndex.set(action.name.trim(), action.id);
    }
  }

  /**
   * Store a completed node's output. This is the write half of carry-forward:
   * once this runs the value is reachable by every later node, on any branch,
   * for the rest of the run.
   */
  recordNodeOutput(action: WorkflowAction, output: any, options: RecordOutputOptions = {}): NodeOutputRecord {
    const existing = this.outputsById.get(action.id);
    const stepKey = existing?.stepKey || toStepKey(action.name || action.id);
    const startedAt = options.startedAt ?? existing?.startedAt ?? new Date().toISOString();
    const finishedAt = new Date().toISOString();

    if (!existing) {
      this.sequenceCounter += 1;
      this.indexStep(action, stepKey);
      if (!this.order.includes(action.id)) this.order.push(action.id);
    }

    const bucket = classifyOutput(output);
    const record: NodeOutputRecord = {
      nodeId: action.id,
      nodeName: action.name ?? action.id,
      stepKey,
      type: action.type,
      category: action.category,
      executionInstanceKey:
        existing?.executionInstanceKey || this.executionInstanceByNode.get(action.id) || action.id,
      executionInstanceSequence:
        existing?.executionInstanceSequence ||
        this.executionSequenceFor(
          existing?.executionInstanceKey || this.executionInstanceByNode.get(action.id) || action.id
        ),
      sequence: existing?.sequence ?? this.sequenceCounter,
      attempt: existing?.attempt ?? 1,
      status: options.status ?? 'completed',
      bucket,
      startedAt,
      finishedAt,
      durationMs:
        options.durationMs ?? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
      input: options.input !== undefined ? deepClone(options.input) : existing?.input,
      output: deepClone(storableOutput(output)),
      flattened: flattenBounded(output),
      error: null,
    };

    // Branch counts are captured here rather than recomputed in the UI so the
    // panel, the snapshot and the run log can never disagree about how many
    // rows each path carried.
    const branches = summarisePorts(action, output);
    if (branches.length > 0) {
      record.branches = branches.map((branch) => ({
        id: branch.id,
        label: branch.label,
        tone: branch.tone,
        recordCount: branch.recordCount,
        absent: branch.absent,
        description: branch.description,
      }));
    }

    this.outputsById.set(action.id, record);
    this.storeExecutionInstanceRecord(record);
    this.previousNodeId = action.id;
    this.fileBucketFor(bucket, stepKey, record.output);

    return record;
  }

  /** Record a failure. The error stays bindable via `{{steps.X.error}}`. */
  recordNodeError(action: WorkflowAction, error: any, options: RecordOutputOptions = {}): NodeOutputRecord {
    const existing = this.outputsById.get(action.id);
    const stepKey = existing?.stepKey || toStepKey(action.name || action.id);
    const startedAt = options.startedAt ?? existing?.startedAt ?? new Date().toISOString();
    const finishedAt = new Date().toISOString();

    if (!existing) {
      this.sequenceCounter += 1;
      this.indexStep(action, stepKey);
      if (!this.order.includes(action.id)) this.order.push(action.id);
    }

    const record: NodeOutputRecord = {
      nodeId: action.id,
      nodeName: action.name ?? action.id,
      stepKey,
      type: action.type,
      category: action.category,
      executionInstanceKey:
        existing?.executionInstanceKey || this.executionInstanceByNode.get(action.id) || action.id,
      executionInstanceSequence:
        existing?.executionInstanceSequence ||
        this.executionSequenceFor(
          existing?.executionInstanceKey || this.executionInstanceByNode.get(action.id) || action.id
        ),
      sequence: existing?.sequence ?? this.sequenceCounter,
      attempt: existing?.attempt ?? 1,
      status: options.status ?? 'error',
      bucket: 'generic',
      startedAt,
      finishedAt,
      durationMs:
        options.durationMs ?? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
      input: options.input !== undefined ? deepClone(options.input) : existing?.input,
      output: undefined,
      flattened: {},
      error: {
        message: error?.message ? String(error.message) : String(error ?? 'Unknown error'),
        stack: typeof error?.stack === 'string' ? error.stack : undefined,
      },
    };

    this.outputsById.set(action.id, record);
    this.storeExecutionInstanceRecord(record);
    return record;
  }

  private fileBucketFor(bucket: OutputBucket, stepKey: string, output: any): void {
    if (!stepKey) return;
    switch (bucket) {
      case 'apiResponse':
        this.apiResponses[stepKey] = output;
        break;
      case 'databaseResult':
        this.databaseResults[stepKey] = output;
        break;
      case 'fileReference':
        this.files[stepKey] = output;
        break;
      case 'extractedText':
        this.extractedText[stepKey] = output;
        break;
      case 'computed':
        this.computed[stepKey] = output;
        break;
      default:
        break;
    }
  }

  /* ------------------------------- readers ------------------------------- */

  getOutput(nodeIdOrStepKey: string): any {
    const nodeId = this.stepIndex.get(nodeIdOrStepKey) ?? nodeIdOrStepKey;
    return this.outputsById.get(nodeId)?.output;
  }

  getRecord(nodeIdOrStepKey: string): NodeOutputRecord | undefined {
    const nodeId = this.stepIndex.get(nodeIdOrStepKey) ?? nodeIdOrStepKey;
    return this.outputsById.get(nodeId);
  }

  /** Executed logical nodes, oldest first. One latest record per canvas node. */
  getRecords(): NodeOutputRecord[] {
    return this.order
      .map((nodeId) => this.outputsById.get(nodeId))
      .filter((record): record is NodeOutputRecord => Boolean(record));
  }

  /**
   * Physical executions in scheduler order. Loop iterations are separate
   * instances and retry attempts are separate records of the same instance.
   */
  getExecutionInstanceRecords(): NodeOutputRecord[] {
    return this.executionInstanceOrder
      .map((key) => this.executionInstanceRecords.get(key))
      .filter((record): record is NodeOutputRecord => Boolean(record));
  }

  getPreviousOutput(): any {
    if (!this.previousNodeId) return undefined;
    return this.outputsById.get(this.previousNodeId)?.output;
  }

  /* -------------------------- business projection ------------------------- */

  /**
   * Business/technical split for one record, memoised against the output
   * reference so repeated `buildScope()` calls cost nothing.
   */
  private projectionFor(record: NodeOutputRecord): NodeProjection {
    const cached = this.projectionCache.get(record.nodeId);
    if (cached && cached.source === record.output) return cached;

    const { payload, path: envelopePath } = unwrapEnvelope(record.output);
    const business = businessValues(record.output);

    const projection: NodeProjection = {
      source: record.output,
      envelopePath,
      payload,
      business,
      flatBusiness:
        isPlainObject(business) && Object.keys(business).length > 0
          ? flattenObject(business, { maxDepth: 4, maxArrayItems: 10 })
          : {},
      technical: technicalValues(record.output),
    };

    this.projectionCache.set(record.nodeId, projection);
    return projection;
  }

  /** A node's output with its transport wrapper removed. */
  getBusinessOutput(nodeIdOrStepKey: string): any {
    const record = this.getRecord(nodeIdOrStepKey);
    if (!record) return undefined;
    return this.projectionFor(record).payload;
  }

  /**
   * Every business value carried forward so far, oldest → newest, so the most
   * recent producer of a shared key wins. This is the clean carry-forward
   * context: meaningful values only, no transport wrappers.
   */
  getBusinessValues(): Record<string, any> {
    const merged: Record<string, any> = {};
    this.getRecords().forEach((record) => {
      Object.assign(merged, this.projectionFor(record).business);
    });
    return merged;
  }

  /** Transport / diagnostic values per step, for Technical Details. */
  getTechnicalValues(): Record<string, Record<string, any>> {
    const byStep: Record<string, Record<string, any>> = {};
    this.getRecords().forEach((record) => {
      const key = record.stepKey || record.nodeId;
      byStep[key] = this.projectionFor(record).technical;
    });
    return byStep;
  }

  getPreviousNodeId(): string | null {
    return this.previousNodeId;
  }

  hasExecuted(nodeId: string): boolean {
    const record = this.outputsById.get(nodeId);
    return Boolean(record && record.status !== 'running');
  }

  /* ------------------------------- scoping ------------------------------- */

  /**
   * Build the layered lookup object the resolver reads.
   *
   * Precedence for a *bare* `{{key}}` — later layers win:
   *   1. every earlier node's output, oldest → newest (so the newest wins)
   *   2. the previous node's output
   *   3. runtime scratch values
   *   4. workflow variables
   *   5. the current node's own resolved properties (passed in as `selfValues`)
   *
   * Putting properties last preserves the platform's existing behaviour
   * exactly — an `api.body` template that references `{{propertyName}}` keeps
   * binding to that node's own field — while carry-forward now fills in every
   * key the node did not define itself. Namespaced tokens
   * (`previous.x`, `steps.X.y`, `vars.z`) bypass precedence entirely and always
   * address exactly what they name.
   */
  buildScope(
    options: {
      input?: any;
      selfValues?: Record<string, any>;
      currentAction?: WorkflowAction | null;
      /**
       * The step this one actually follows, overriding "whatever ran last".
       *
       * Those are the same thing in a straight line and different things the
       * moment a workflow branches. With `Filter → Matched Report` and
       * `Filter → Unmatched Report`, the queue runs Matched first, so by the
       * time Unmatched runs, the most recent record is Matched's — and
       * `{{previous.data}}` inside the unmatched branch silently resolved
       * against the wrong step. It still resolved, which is what made it
       * dangerous: an exception report full of successful rows looks like a
       * working report.
       *
       * The executor passes the edge's real source here, so `previous` means
       * "the step upstream of me on this path".
       */
      previousNodeId?: string | null;
      /**
       * The slice the inbound edge carried, when it came through a named port.
       * Layered over the predecessor's view so `{{previous.rows}}` in a branch
       * addresses that branch's rows rather than the whole upstream envelope.
       */
      previousPortPayload?: any;
      previousPortId?: string | null;
    } = {}
  ): ExecutionScope {
    const { input, selfValues, currentAction } = options;

    const stepsNamespace: Record<string, any> = {};
    const nodesNamespace: Record<string, any> = {};
    const businessNamespace: Record<string, any> = {};
    const technicalNamespace: Record<string, any> = {};
    const aggregate: Record<string, any> = {};
    const businessAggregate: Record<string, any> = {};

    for (const nodeId of this.order) {
      const record = this.outputsById.get(nodeId);
      if (!record) continue;

      const projection = this.projectionFor(record);

      // Execution metadata is laid down FIRST so the node's own payload wins any
      // name collision. This matters constantly in practice: an HTTP node whose
      // response contains `status` must resolve `{{steps.X.status}}` to 200, not
      // to the engine's internal "completed". Metadata stays unambiguously
      // reachable under the reserved `$` prefix, which no payload uses.
      const view = {
        nodeId: record.nodeId,
        nodeName: record.nodeName,
        status: record.status,
        error: record.error,
        durationMs: record.durationMs,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        sequence: record.sequence,
        // Business layer: the payload with its transport wrapper removed, so
        // `{{steps.X.employeeId}}` resolves against `{ data: { employeeId } }`
        // without the user having to know the wrapper exists.
        ...projection.business,
        // Raw payload last, so the node's own response always wins a collision
        // and every token that resolved before still resolves — EXCEPT for the
        // envelope key itself. Re-spreading that key puts the wrapper back over
        // the payload we just unwrapped, and when a payload happens to contain a
        // field of the same name the wrapper wins. The Excel plugin returns
        // `{ success, message, data: { …, data: [rows] } }`, so `previous.data`
        // resolved to the inner wrapper object rather than to the rows, and
        // every `data[0][...]` binding against it addressed nothing.
        // Every other transport key — success, message, statusCode — is still
        // spread, so those tokens are untouched.
        ...withoutEnvelopeHead(record.output, projection.envelopePath),
        // Always-true accessors, applied after the payload so that
        // `{{steps.X.output}}` reliably means "the whole output".
        output: record.output,
        value: record.output,
        $status: record.status,
        $error: record.error,
        $nodeId: record.nodeId,
        $nodeName: record.nodeName,
        $durationMs: record.durationMs,
        $sequence: record.sequence,
        // Advanced access: the clean record and the wrapper it arrived in.
        $business: projection.payload,
        $technical: projection.technical,
      };

      if (record.stepKey) stepsNamespace[record.stepKey] = view;
      if (record.nodeName) stepsNamespace[record.nodeName] = view;
      nodesNamespace[record.nodeId] = view;

      const bucketKey = record.stepKey || record.nodeId;
      businessNamespace[bucketKey] = projection.payload;
      technicalNamespace[bucketKey] = projection.technical;

      // Oldest → newest, so the most recent producer of a shared key wins.
      Object.assign(aggregate, record.flattened ?? {});
      Object.assign(businessAggregate, projection.flatBusiness);
    }

    // The branch-aware predecessor, falling back to the global "last executed"
    // so a straight-line workflow — and every caller that does not pass one —
    // behaves precisely as before.
    const effectivePreviousNodeId = options.previousNodeId ?? this.previousNodeId;
    const previousRecord = effectivePreviousNodeId
      ? this.outputsById.get(effectivePreviousNodeId)
      : undefined;
    const previousOutput = previousRecord?.output;
    const previousProjection = previousRecord ? this.projectionFor(previousRecord) : undefined;

    // When the inbound edge came through a named port, that slice is the most
    // specific thing `previous` can mean, so it is layered last — above the
    // upstream step's own payload. `$port` records which branch it arrived on,
    // and the full upstream output stays reachable via `previous.output` and
    // `steps.<Name>`, so narrowing the default view never loses a value.
    const portPayload = options.previousPortPayload;
    const hasPortPayload = options.previousPortId != null && portPayload !== undefined;
    const portBusiness = hasPortPayload && isPlainObject(portPayload) ? portPayload : {};

    // Same precedence rule as `steps`: business layer, then the raw payload,
    // then metadata under `$`.
    const previousView = {
      nodeId: previousRecord?.nodeId,
      nodeName: previousRecord?.nodeName,
      status: previousRecord?.status,
      error: previousRecord?.error,
      ...(previousProjection?.business ?? {}),
      ...withoutEnvelopeHead(previousOutput, previousProjection?.envelopePath),
      ...portBusiness,
      // `rows`/`data` are the two names every dataset-shaped branch is bound by,
      // so a port slice answers to both regardless of which the plugin used.
      ...(hasPortPayload ? { rows: portPayload, data: portPayload } : {}),
      output: hasPortPayload ? portPayload : previousOutput,
      value: hasPortPayload ? portPayload : previousOutput,
      $status: previousRecord?.status,
      $error: previousRecord?.error,
      $nodeId: previousRecord?.nodeId,
      $nodeName: previousRecord?.nodeName,
      $port: options.previousPortId ?? null,
      /** The complete upstream output, whatever port this branch arrived on. */
      $output: previousOutput,
      $business: previousProjection?.payload,
      $technical: previousProjection?.technical ?? {},
    };

    const variables = { ...this.variables };

    const scope: ExecutionScope = {
      // ── bare-key layers (lowest → highest precedence) ──
      ...aggregate,
      // Business values sit ABOVE the raw aggregate, so a bare `{{status}}`
      // prefers a business field over an earlier node's transport wrapper.
      ...businessAggregate,
      ...(previousRecord?.flattened ?? {}),
      ...(previousProjection?.flatBusiness ?? {}),
      ...this.runtime,
      ...variables,
      ...(selfValues ?? {}),

      // ── explicit namespaces (never shadowed) ──
      vars: variables,
      variables,
      previous: previousView,
      prev: previousView,
      last: previousView,
      steps: stepsNamespace,
      step: stepsNamespace,
      nodes: nodesNamespace,
      node: nodesNamespace,
      runtime: { ...this.runtime },
      files: { ...this.files },
      apiResponses: { ...this.apiResponses },
      databaseResults: { ...this.databaseResults },
      extractedText: { ...this.extractedText },
      computed: { ...this.computed },
      env: { ...this.env },
      input: input ?? previousOutput,
      self: {
        ...(selfValues ?? {}),
        id: currentAction?.id,
        name: currentAction?.name,
        type: currentAction?.type,
        category: currentAction?.category,
      },
      run: {
        id: this.runId,
        startedAt: this.startedAt,
        triggeredBy: this.triggeredBy,
        executedCount: this.order.length,
      },
      workflow: {
        id: this.workflowId,
        name: this.workflowName,
      },
      now: new Date().toISOString(),
      timestamp: Date.now(),
    };

    // Loop aliases are reserved while a loop is active. They are deliberately
    // applied after variables/self-values so `{{currentItem}}`, `{{iteration}}`
    // and `{{loop.parent.currentItem}}` cannot be shadowed accidentally by a
    // workflow variable with the same friendly name. Outside a loop these keys
    // are absent and existing workflows keep their old precedence unchanged.
    const activeLoop = this.runtime.loop;
    if (activeLoop && typeof activeLoop === 'object') {
      scope.loop = activeLoop;
      scope.loops = this.runtime.loops ?? this.runtime.loopStack ?? [];
      scope.loopStack = this.runtime.loopStack ?? this.runtime.loops ?? [];
      scope.currentItem = activeLoop.currentItem;
      scope.currentIndex = activeLoop.currentIndex;
      scope.currentKey = activeLoop.currentKey;
      scope.iteration = activeLoop.iteration;
    }

    // Reserved-name safety: `business` and `technical` are additive
    // conveniences, so they are only attached when nothing already carried
    // forward — a workflow variable, a runtime value or an earlier output —
    // owns that name. Existing workflows can never change meaning.
    if (scope.business === undefined) scope.business = businessNamespace;
    if (scope.technical === undefined) scope.technical = technicalNamespace;

    return scope;
  }

  /* ------------------------------ snapshots ------------------------------ */

  /**
   * Serialisable image of the run. Secret variables are masked and oversized
   * payloads truncated so a snapshot is always safe to persist and cheap to
   * load.
   */
  snapshot(options: { status?: ActionStatus; finishedAt?: string } = {}): ExecutionSnapshot {
    const records = this.getRecords();
    const executionInstances = this.getExecutionInstanceRecords();
    const secrets = new Set(this.secretVariableNames());

    const safeVariables: Record<string, any> = {};
    Object.entries(this.variables).forEach(([name, value]) => {
      safeVariables[name] = secrets.has(name) ? '••••••••' : truncateForStorage(value);
    });

    const completed = records.filter((record) => record.status === 'completed' || record.status === 'success').length;
    const failed = records.filter((record) => record.status === 'error' || record.status === 'failed').length;
    const skipped = records.filter((record) => record.status === 'skipped').length;

    return {
      version: 1,
      runId: this.runId,
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      status: options.status ?? 'running',
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
      finishedAt: options.finishedAt,
      variables: safeVariables,
      runtime: truncateForStorage(this.runtime),
      files: truncateForStorage(this.files),
      env: truncateForStorage(this.env),
      previousNodeId: this.previousNodeId,
      outputs: records.map((record) => ({
        ...record,
        input: truncateForStorage(record.input),
        output: truncateForStorage(record.output),
        // The flattened map is derivable from `output`; dropping it keeps
        // snapshots small.
        flattened: undefined,
      })),
      executionInstances: executionInstances.map((record) => ({
        ...record,
        input: truncateForStorage(record.input),
        output: truncateForStorage(record.output),
        flattened: undefined,
      })),
      metrics: {
        totalNodes: records.length,
        completed,
        failed,
        skipped,
        durationMs: Math.max(0, Date.now() - new Date(this.startedAt).getTime()),
      },
    };
  }

  /**
   * Rebuild a context from a persisted snapshot so a previous run's values can
   * be inspected in the UI, or a stopped run resumed with its data intact.
   */
  static restore(snapshot: ExecutionSnapshot): WorkflowExecutionContext {
    const context = new WorkflowExecutionContext({
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      workflowName: snapshot.workflowName,
      env: snapshot.env,
    });

    context.variables = { ...(snapshot.variables ?? {}) };
    context.runtime = { ...(snapshot.runtime ?? {}) };
    context.files = { ...(snapshot.files ?? {}) };
    context.previousNodeId = snapshot.previousNodeId ?? null;

    (snapshot.outputs ?? []).forEach((record) => {
      const rehydrated: NodeOutputRecord = {
        ...record,
        flattened: flattenBounded(record.output),
      };
      context.outputsById.set(record.nodeId, rehydrated);
      context.executionInstanceByNode.set(
        record.nodeId,
        String(record.executionInstanceKey || record.nodeId)
      );
      if (!context.order.includes(record.nodeId)) context.order.push(record.nodeId);
      context.stepIndex.set(record.nodeId, record.nodeId);
      if (record.stepKey) context.stepIndex.set(record.stepKey, record.nodeId);
      if (record.nodeName) context.stepIndex.set(record.nodeName, record.nodeId);
      context.sequenceCounter = Math.max(context.sequenceCounter, record.sequence ?? 0);
      context.fileBucketFor(record.bucket, record.stepKey, record.output);
    });

    const persistedInstances =
      snapshot.executionInstances && snapshot.executionInstances.length > 0
        ? snapshot.executionInstances
        : snapshot.outputs ?? [];
    persistedInstances.forEach((record) => {
      context.storeExecutionInstanceRecord({
        ...record,
        executionInstanceKey: record.executionInstanceKey || record.nodeId,
        executionInstanceSequence:
          record.executionInstanceSequence || record.sequence || 1,
        flattened: flattenBounded(record.output),
      });
    });

    return context;
  }

  /** Compact description used by the Execution Panel's context inspector. */
  describe(): {
    variables: Record<string, any>;
    steps: Array<{ record: NodeOutputRecord }>;
    runtime: Record<string, any>;
    files: Record<string, any>;
    previousNodeId: string | null;
  } {
    return {
      variables: this.getVariables(),
      steps: this.getRecords().map((record) => ({ record })),
      runtime: { ...this.runtime },
      files: { ...this.files },
      previousNodeId: this.previousNodeId,
    };
  }
}

/** Convenience factory so callers do not import the class directly. */
export function createExecutionContext(init: ExecutionContextInit): WorkflowExecutionContext {
  return new WorkflowExecutionContext(init);
}