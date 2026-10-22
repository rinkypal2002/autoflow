'use strict';

const {
  extractOutputSchema,
  projectExecutionOutput,
} = require('./outputProjection');
const {
  deleteOtherAttemptsForNodeExecution,
  replaceForNodeExecution,
} = require('./executionOutputIndexRepository');

const LIVE_PHASE = 'Database Phase 3 Step 7B.4';

function annotateLiveRows(rows, context = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    metadata: {
      ...(row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {}),
      liveIndex: {
        phase: LIVE_PHASE,
        sourceType: 'EXECUTION_SNAPSHOT',
        schemaSource: context.schemaSource || 'OBSERVED_HEURISTIC',
        projectionVersion: '1',
      },
    },
  }));
}

function buildLiveOutputProjection(input = {}) {
  const outputSchema =
    input.outputSchema || extractOutputSchema(input.nodeJson);
  const projection = projectExecutionOutput({
    output: input.output,
    nodeJson: input.nodeJson,
    outputSchema,
    stepName: input.nodeName || input.nodeKey || 'Step',
    nodeKey: input.nodeKey,
  }, input.projectionOptions || {});

  if (projection.truncated) {
    const error = new Error(
      `Output-index projection for node '${input.nodeKey || input.nodeName || 'unknown'}' ` +
        `reached the configured row limit (${projection.options.maxRows}).`
    );
    error.code = 'OUTPUT_INDEX_PROJECTION_TRUNCATED';
    error.status = 422;
    throw error;
  }

  return {
    ...projection,
    rows: annotateLiveRows(projection.rows, {
      schemaSource: projection.schemaSource,
    }),
  };
}

async function indexLiveNodeExecution(client, input = {}) {
  if (input.enabled !== true) {
    return {
      enabled: false,
      indexed: false,
      rows: 0,
      business: 0,
      technical: 0,
      raw: 0,
      schemaSource: null,
    };
  }

  if (!client || typeof client.query !== 'function') {
    throw new TypeError(
      'indexLiveNodeExecution requires an active PostgreSQL transaction client.'
    );
  }

  const executionId = String(input.executionId || '');
  const nodeExecutionId = String(input.nodeExecutionId || '');
  const nodeKey = String(input.nodeKey || '');
  if (!executionId || !nodeExecutionId || !nodeKey) {
    throw new Error(
      'executionId, nodeExecutionId and nodeKey are required for live output indexing.'
    );
  }

  const projection = buildLiveOutputProjection(input);

  await deleteOtherAttemptsForNodeExecution(client, {
    executionId,
    nodeExecutionId,
    nodeKey,
    writeEnabled: true,
  });

  const persisted = await replaceForNodeExecution(client, {
    executionId,
    nodeExecutionId,
    rows: projection.rows,
    writeEnabled: true,
  });

  return {
    enabled: true,
    indexed: true,
    rows: persisted.inserted,
    business: projection.counts.BUSINESS,
    technical: projection.counts.TECHNICAL,
    raw: projection.counts.RAW,
    schemaSource: projection.schemaSource,
  };
}

module.exports = {
  LIVE_PHASE,
  annotateLiveRows,
  buildLiveOutputProjection,
  indexLiveNodeExecution,
};
