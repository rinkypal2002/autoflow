'use strict';

const {
  businessValues,
  technicalValues,
  unwrapEnvelope,
} = require('./canonical/lib/carryForward');
const {
  flattenObject,
  isPlainObject,
  toStepKey,
} = require('./canonical/lib/objectUtils');

function jsonClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function errorObject(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code || null,
    status: Number(error.status) || null,
  };
}

const FLATTEN_BOUNDS = { maxDepth: 4, maxArrayItems: 10 };
const MAX_FLATTENED_ENTRIES = 5000;

function flattenBounded(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return {};
  const flat = flattenObject(value, FLATTEN_BOUNDS);
  const keys = Object.keys(flat);
  if (keys.length <= MAX_FLATTENED_ENTRIES) return flat;
  const capped = {};
  for (let index = 0; index < MAX_FLATTENED_ENTRIES; index += 1) {
    capped[keys[index]] = flat[keys[index]];
  }
  return capped;
}

function withoutEnvelopeHead(output, envelopePath) {
  if (!isPlainObject(output)) return {};
  const head = String(envelopePath || '').split('.')[0];
  if (!head) return output;
  return Object.fromEntries(Object.entries(output).filter(([key]) => key !== head));
}

function projectionFor(record) {
  const { payload, path: envelopePath } = unwrapEnvelope(record.output);
  const business = businessValues(record.output);
  return {
    payload,
    envelopePath,
    business,
    flatBusiness:
      isPlainObject(business) && Object.keys(business).length > 0
        ? flattenObject(business, FLATTEN_BOUNDS)
        : {},
    technical: technicalValues(record.output),
  };
}

class ServerExecutionContext {
  constructor({ runId, workflow, phase = 'ORCH-3' }) {
    this.runId = runId;
    this.phase = String(phase || 'ORCH-3');
    this.executorKey = `server-${this.phase.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
    this.workflowId = String(workflow.id);
    this.workflowName = workflow.name || workflow.id;
    this.startedAt = new Date().toISOString();
    this.previousNodeId = null;
    this.records = [];
    this.recordsById = new Map();
    this.logs = [];
    this.sequence = 0;
    this.variables = {};
    this.runtime = {};
    this.files = {};
    this.env = {};
    this.apiResponses = {};
    this.databaseResults = {};
    this.extractedText = {};
    this.computed = {};

    for (const variable of Array.isArray(workflow.variables) ? workflow.variables : []) {
      if (!variable || !variable.name) continue;
      if (variable.isSecret === true || variable.scope === 'secret') continue;
      this.variables[String(variable.name)] = jsonClone(
        variable.value !== undefined ? variable.value : variable.defaultValue
      );
    }
  }

  log(level, message, action = null, data = undefined) {
    const entry = {
      id: `${this.executorKey}-log-${this.logs.length + 1}`,
      workflowId: this.workflowId,
      runId: this.runId,
      actionId: action?.id || undefined,
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data === undefined ? undefined : jsonClone(data),
      metadata: { executor: this.executorKey },
    };
    this.logs.push(entry);
    return entry;
  }

  startNode(action, input, options = {}) {
    this.sequence += 1;
    const startedAt = new Date().toISOString();
    const stepKey = toStepKey(action.name || action.id) || String(action.id);
    return {
      nodeId: String(action.id),
      nodeName: action.name || action.id,
      stepKey,
      type: action.type || null,
      category: action.category || null,
      executionInstanceKey: String(options.executionInstanceKey || action.id),
      executionInstanceSequence: this.sequence,
      sequence: this.sequence,
      attempt: 1,
      status: 'running',
      bucket: options.bucket || 'generic',
      startedAt,
      input: jsonClone(input),
      output: undefined,
      flattened: {},
      error: null,
    };
  }

  completeNode(action, draft, output, input = draft.input) {
    const finishedAt = new Date().toISOString();
    const record = {
      ...draft,
      status: 'completed',
      finishedAt,
      durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(draft.startedAt).getTime()),
      input: jsonClone(input),
      output: jsonClone(output),
      flattened: flattenBounded(output),
      error: null,
    };
    this.records.push(record);
    this.recordsById.set(String(action.id), record);
    this.previousNodeId = String(action.id);
    return record;
  }

  failNode(action, draft, error, input = draft.input) {
    const finishedAt = new Date().toISOString();
    const record = {
      ...draft,
      status: 'failed',
      finishedAt,
      durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(draft.startedAt).getTime()),
      input: jsonClone(input),
      output: null,
      flattened: {},
      error: errorObject(error),
    };
    this.records.push(record);
    this.recordsById.set(String(action.id), record);
    this.previousNodeId = String(action.id);
    return record;
  }

  buildScope(options = {}) {
    const { input, selfValues, currentAction } = options;
    const stepsNamespace = {};
    const nodesNamespace = {};
    const businessNamespace = {};
    const technicalNamespace = {};
    const aggregate = {};
    const businessAggregate = {};

    for (const record of this.records) {
      const projection = projectionFor(record);
      const view = {
        nodeId: record.nodeId,
        nodeName: record.nodeName,
        status: record.status,
        error: record.error,
        durationMs: record.durationMs,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        sequence: record.sequence,
        ...projection.business,
        ...withoutEnvelopeHead(record.output, projection.envelopePath),
        output: record.output,
        value: record.output,
        $status: record.status,
        $error: record.error,
        $nodeId: record.nodeId,
        $nodeName: record.nodeName,
        $durationMs: record.durationMs,
        $sequence: record.sequence,
        $business: projection.payload,
        $technical: projection.technical,
      };

      if (record.stepKey) stepsNamespace[record.stepKey] = view;
      if (record.nodeName) stepsNamespace[record.nodeName] = view;
      nodesNamespace[record.nodeId] = view;

      const bucketKey = record.stepKey || record.nodeId;
      businessNamespace[bucketKey] = projection.payload;
      technicalNamespace[bucketKey] = projection.technical;
      Object.assign(aggregate, record.flattened || {});
      Object.assign(businessAggregate, projection.flatBusiness);
    }

    const effectivePreviousNodeId = options.previousNodeId ?? this.previousNodeId;
    const previousRecord = effectivePreviousNodeId
      ? this.recordsById.get(String(effectivePreviousNodeId))
      : undefined;
    const previousOutput = previousRecord?.output;
    const previousProjection = previousRecord ? projectionFor(previousRecord) : undefined;

    // Browser parity for named output ports: the branch payload becomes the
    // branch-local `previous`, while the complete upstream result remains
    // available through previous.$output and steps.<Name>.
    const portPayload = options.previousPortPayload;
    const hasPortPayload = options.previousPortId != null && portPayload !== undefined;
    const portBusiness = hasPortPayload && isPlainObject(portPayload) ? portPayload : {};

    const previousView = {
      nodeId: previousRecord?.nodeId,
      nodeName: previousRecord?.nodeName,
      status: previousRecord?.status,
      error: previousRecord?.error,
      ...(previousProjection?.business || {}),
      ...withoutEnvelopeHead(previousOutput, previousProjection?.envelopePath),
      ...portBusiness,
      ...(hasPortPayload ? { rows: portPayload, data: portPayload } : {}),
      output: hasPortPayload ? portPayload : previousOutput,
      value: hasPortPayload ? portPayload : previousOutput,
      $status: previousRecord?.status,
      $error: previousRecord?.error,
      $nodeId: previousRecord?.nodeId,
      $nodeName: previousRecord?.nodeName,
      $port: options.previousPortId ?? null,
      $output: previousOutput,
      $business: previousProjection?.payload,
      $technical: previousProjection?.technical || {},
    };

    const variables = { ...this.variables };
    const scope = {
      ...aggregate,
      ...businessAggregate,
      ...(previousRecord?.flattened || {}),
      ...(previousProjection?.flatBusiness || {}),
      ...this.runtime,
      ...variables,
      ...(selfValues || {}),

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
        ...(selfValues || {}),
        id: currentAction?.id,
        name: currentAction?.name,
        type: currentAction?.type,
        category: currentAction?.category,
      },
      run: {
        id: this.runId,
        startedAt: this.startedAt,
        executedCount: this.records.length,
      },
      workflow: {
        id: this.workflowId,
        name: this.workflowName,
      },
      now: new Date().toISOString(),
      timestamp: Date.now(),
    };

    if (scope.business === undefined) scope.business = businessNamespace;
    if (scope.technical === undefined) scope.technical = technicalNamespace;
    return scope;
  }

  snapshot(status = 'running', finishedAt = undefined) {
    const completed = this.records.filter((record) => record.status === 'completed').length;
    const failed = this.records.filter((record) => record.status === 'failed').length;
    const now = new Date().toISOString();
    const finalFinishedAt = finishedAt || (status === 'completed' || status === 'failed' ? now : undefined);
    return {
      version: 1,
      runId: this.runId,
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      status,
      startedAt: this.startedAt,
      updatedAt: now,
      finishedAt: finalFinishedAt,
      variables: jsonClone(this.variables),
      runtime: { executor: this.executorKey, phase: this.phase, durableOwner: 'node-backend' },
      files: {},
      env: {},
      outputs: jsonClone(this.records),
      executionInstances: jsonClone(this.records),
      previousNodeId: this.previousNodeId,
      logs: jsonClone(this.logs),
      metrics: {
        totalNodes: this.records.length,
        completed,
        failed,
        skipped: 0,
        durationMs: Math.max(0, Date.now() - new Date(this.startedAt).getTime()),
      },
    };
  }
}

module.exports = {
  ServerExecutionContext,
  flattenBounded,
  projectionFor,
};
