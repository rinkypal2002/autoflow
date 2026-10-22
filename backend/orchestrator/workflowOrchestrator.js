'use strict';

const { v4: uuidv4 } = require('uuid');
const { getWorkflow } = require('../db/workspaceWriteRepository');
const { upsertExecutionSnapshot } = require('../db/executionRepository');
const { ServerExecutionContext } = require('./executionContext');
const {
  assertOrch3Workflow,
  hasOrch3RoutingFeatures,
  assertOrch4AForEachWorkflow,
  assertOrch4BWhileWorkflow,
  assertOrch4CRepeatUntilWorkflow,
  assertOrch4DBreakWorkflow,
  hasOrch4LoopControls,
} = require('./workflowGraph');
const { createPluginExecutor } = require('./pluginExecutor');
const { evaluateCondition, resolveDeep } = require('./canonical/lib/expression');
const { routeConnection } = require('./canonical/lib/ports');
const {
  LOOP_BODY_PORT,
  LOOP_DONE_PORT,
  advanceLoopState,
  captureLoopBodyOutput,
  finaliseCurrentLoopIteration,
  makeLoopDoneOutput,
  popLoopFrame,
  loopExecutionKey,
  loopRuntimeAliases,
} = require('./canonical/lib/loopControl');

class OrchestratorExecutionError extends Error {
  constructor(code, message, status = 500, runId = null, details = undefined) {
    super(message);
    this.name = 'OrchestratorExecutionError';
    this.code = code;
    this.status = status;
    this.runId = runId;
    this.details = details;
  }
}

function controlOutput(action, input) {
  return {
    success: true,
    controlNode: true,
    nodeType: action.type,
    actionName: action.name,
    inputData: input ?? null,
  };
}

function isStart(action) {
  return action?.type === 'workflow-start';
}

function isEnd(action) {
  return action?.type === 'workflow-end';
}

function createWorkflowOrchestrator(options = {}) {
  const workspaceKey = options.workspaceKey || 'default';
  const retentionDays = Number.isFinite(Number(options.retentionDays))
    ? Math.max(0, Number(options.retentionDays))
    : 30;
  const outputIndexWriteEnabled = options.outputIndexWriteEnabled === true;
  const workflowLoader = options.getWorkflow || getWorkflow;
  const persistSnapshot = options.upsertExecutionSnapshot || upsertExecutionSnapshot;
  const pluginExecutor = options.pluginExecutor || createPluginExecutor({
    engineUrl: options.engineUrl,
    engineVersion: options.engineVersion,
    engineContextPath: options.engineContextPath,
    schema: options.schema,
  });

  async function persist(workflowId, context, status, finishedAt = undefined) {
    return persistSnapshot(workflowId, context.snapshot(status, finishedAt), {
      workspaceKey,
      retentionDays,
      outputIndexWriteEnabled,
    });
  }


  function syncLoopRuntime(context, frames) {
    const aliases = loopRuntimeAliases(frames);
    context.runtime = {
      ...context.runtime,
      ...aliases,
    };
  }

  function loopConditionScope(baseScope, frames) {
    const aliases = loopRuntimeAliases(frames);
    return {
      ...baseScope,
      ...aliases,
      runtime: {
        ...(baseScope.runtime || {}),
        ...aliases,
      },
    };
  }

  async function executeForEachWorkflow(workflowId, workflow) {
    const graph = assertOrch4AForEachWorkflow(workflow);
    const runId = `orch4a-${uuidv4()}`;
    const context = new ServerExecutionContext({ runId, workflow, phase: 'ORCH-4A' });
    await persist(workflowId, context, 'running');

    const startAction = graph.start;
    const loopAction = graph.loop;
    const bodyAction = graph.bodyPlugin;
    const endAction = graph.end;
    let frames = [];

    try {
      const startDraft = context.startNode(startAction, null);
      context.log('info', 'ORCH-4A executing Start control node.', startAction);
      const startOutput = controlOutput(startAction, null);
      context.completeNode(startAction, startDraft, startOutput, null);
      await persist(workflowId, context, 'running');

      const loopProperties = loopAction?.properties || {};
      const collectionScope = context.buildScope({
        input: startOutput,
        currentAction: loopAction,
        previousNodeId: String(startAction.id),
      });
      const collectionValue = resolveDeep(loopProperties.collection, collectionScope, { onMissing: 'keep' });
      const maxIterationsValue = resolveDeep(loopProperties.maxIterations, collectionScope, { onMissing: 'keep' });

      let loopInput = startOutput;
      while (true) {
        syncLoopRuntime(context, frames);
        const controllerExecutionKey = loopExecutionKey(String(loopAction.id), frames);
        const loopDraft = context.startNode(loopAction, loopInput, {
          executionInstanceKey: controllerExecutionKey,
        });
        context.log(
          'info',
          `ORCH-4A advancing For Each '${loopAction.name || loopAction.id}'.`,
          loopAction,
          { executionInstanceKey: controllerExecutionKey }
        );

        let transition;
        try {
          transition = advanceLoopState({
            action: loopAction,
            frames,
            inputData: loopInput,
            collectionValue,
            maxIterationsValue,
            evaluate: () => false,
          });
        } catch (error) {
          context.failNode(loopAction, loopDraft, error, loopInput);
          const failedAt = new Date().toISOString();
          context.log('error', `For Each failed: ${error.message || error}.`, loopAction);
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            'ORCH4A_FOREACH_STATE_FAILED',
            error.message || 'ORCH-4A For Each state transition failed.',
            409,
            runId
          );
        }

        context.completeNode(loopAction, loopDraft, transition.output, loopInput);
        await persist(workflowId, context, 'running');
        frames = transition.frames;
        syncLoopRuntime(context, frames);

        if (transition.route === LOOP_DONE_PORT) {
          const doneRouting = routeConnection(loopAction, graph.doneConnection, transition.output);
          if (doneRouting.skipped) {
            throw new OrchestratorExecutionError(
              'ORCH4A_DONE_ROUTE_SUPPRESSED',
              `For Each Done route was suppressed: ${doneRouting.reason}.`,
              409,
              runId
            );
          }
          const endDraft = context.startNode(endAction, doneRouting.payload);
          context.log('info', 'ORCH-4A executing End control node.', endAction);
          const endOutput = controlOutput(endAction, doneRouting.payload);
          context.completeNode(endAction, endDraft, endOutput, doneRouting.payload);
          const finishedAt = new Date().toISOString();
          context.log('success', 'ORCH-4A For Each workflow completed on the server.', endAction);
          const persisted = await persist(workflowId, context, 'completed', finishedAt);
          return {
            runId,
            status: 'completed',
            workflowId: String(workflow.id),
            workflowName: workflow.name,
            workflowVersion: workflow.version,
            nodeCount: context.records.length,
            executionId: persisted.executionId,
            output: doneRouting.payload ?? null,
          };
        }

        if (transition.route !== LOOP_BODY_PORT) {
          throw new OrchestratorExecutionError(
            'ORCH4A_UNKNOWN_LOOP_ROUTE',
            `For Each produced unsupported route '${transition.route}'.`,
            500,
            runId
          );
        }

        const bodyRouting = routeConnection(loopAction, graph.bodyConnection, transition.output);
        if (bodyRouting.skipped) {
          throw new OrchestratorExecutionError(
            'ORCH4A_BODY_ROUTE_SUPPRESSED',
            `For Each Body route was suppressed: ${bodyRouting.reason}.`,
            409,
            runId
          );
        }

        const bodyExecutionKey = loopExecutionKey(String(bodyAction.id), frames);
        const bodyDraft = context.startNode(bodyAction, bodyRouting.payload, {
          executionInstanceKey: bodyExecutionKey,
        });
        context.log(
          'info',
          `ORCH-4A executing Body action: ${bodyAction.name || bodyAction.id}.`,
          bodyAction,
          {
            executionInstanceKey: bodyExecutionKey,
            iteration: loopRuntimeAliases(frames).iteration,
          }
        );

        try {
          const carryScope = context.buildScope({
            input: bodyRouting.payload,
            currentAction: bodyAction,
            previousNodeId: String(loopAction.id),
            previousPortId: LOOP_BODY_PORT,
            previousPortPayload: bodyRouting.payload,
          });
          const execution = await pluginExecutor.execute(bodyAction, {
            scope: carryScope,
            input: bodyRouting.payload,
            context,
          });
          const output = execution.output;
          context.completeNode(bodyAction, bodyDraft, output, execution.request.body);
          context.log('success', `ORCH-4A Body action completed: ${bodyAction.name || bodyAction.id}.`, bodyAction, {
            executionInstanceKey: bodyExecutionKey,
            boundTokenCount: execution.request.bindingDiagnostics?.boundTokens?.length || 0,
          });
          await persist(workflowId, context, 'running');
          frames = captureLoopBodyOutput(frames, output);
          loopInput = output;
        } catch (error) {
          context.failNode(bodyAction, bodyDraft, error);
          const failedAt = new Date().toISOString();
          context.log('error', `ORCH-4A Body action failed: ${error.message || error}.`, bodyAction);
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            error.code || 'ORCH4A_BODY_EXECUTION_FAILED',
            error.message || 'ORCH-4A Body plugin execution failed.',
            Number(error.status) || 502,
            runId,
            error.details
          );
        }
      }
    } catch (error) {
      if (error instanceof OrchestratorExecutionError) {
        if (!context.records.some((record) => record.status === 'failed')) {
          try {
            const failedAt = new Date().toISOString();
            context.log('error', `ORCH-4A workflow failed: ${error.message || error}.`);
            await persist(workflowId, context, 'failed', failedAt);
          } catch {
            // Preserve the original orchestrator error.
          }
        }
        throw error;
      }

      const failedAt = new Date().toISOString();
      try {
        context.log('error', `ORCH-4A workflow failed: ${error.message || error}.`);
        await persist(workflowId, context, 'failed', failedAt);
      } catch {
        // Preserve the original execution error.
      }
      throw new OrchestratorExecutionError(
        error.code || 'ORCH4A_EXECUTION_FAILED',
        error.message || 'ORCH-4A execution failed.',
        Number(error.status) || 500,
        runId,
        error.details
      );
    }
  }


  async function executeWhileWorkflow(workflowId, workflow) {
    const graph = assertOrch4BWhileWorkflow(workflow);
    const runId = `orch4b-${uuidv4()}`;
    const context = new ServerExecutionContext({ runId, workflow, phase: 'ORCH-4B' });
    await persist(workflowId, context, 'running');

    const startAction = graph.start;
    const loopAction = graph.loop;
    const bodyAction = graph.bodyPlugin;
    const endAction = graph.end;
    const loopProperties = loopAction?.properties || {};
    let frames = [];

    try {
      const startDraft = context.startNode(startAction, null);
      context.log('info', 'ORCH-4B executing Start control node.', startAction);
      const startOutput = controlOutput(startAction, null);
      context.completeNode(startAction, startDraft, startOutput, null);
      await persist(workflowId, context, 'running');

      let loopInput = startOutput;
      let previousNodeId = String(startAction.id);

      while (true) {
        syncLoopRuntime(context, frames);
        const baseScope = context.buildScope({
          input: loopInput,
          currentAction: loopAction,
          previousNodeId,
        });
        const maxIterationsValue = resolveDeep(
          loopProperties.maxIterations,
          baseScope,
          { onMissing: 'keep' }
        );
        const controllerExecutionKey = loopExecutionKey(String(loopAction.id), frames);
        const loopDraft = context.startNode(loopAction, loopInput, {
          executionInstanceKey: controllerExecutionKey,
        });
        context.log(
          'info',
          `ORCH-4B advancing While '${loopAction.name || loopAction.id}'.`,
          loopAction,
          { executionInstanceKey: controllerExecutionKey }
        );

        let transition;
        try {
          transition = advanceLoopState({
            action: loopAction,
            frames,
            inputData: loopInput,
            condition: String(loopProperties.condition ?? ''),
            maxIterationsValue,
            evaluate: (condition, candidateFrames) =>
              evaluateCondition(condition, loopConditionScope(baseScope, candidateFrames)),
          });
        } catch (error) {
          context.failNode(loopAction, loopDraft, error, loopInput);
          const failedAt = new Date().toISOString();
          context.log('error', `While failed: ${error.message || error}.`, loopAction);
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            'ORCH4B_WHILE_STATE_FAILED',
            error.message || 'ORCH-4B While state transition failed.',
            409,
            runId
          );
        }

        context.completeNode(loopAction, loopDraft, transition.output, loopInput);
        await persist(workflowId, context, 'running');
        frames = transition.frames;
        syncLoopRuntime(context, frames);

        if (transition.route === LOOP_DONE_PORT) {
          const doneRouting = routeConnection(loopAction, graph.doneConnection, transition.output);
          if (doneRouting.skipped) {
            throw new OrchestratorExecutionError(
              'ORCH4B_DONE_ROUTE_SUPPRESSED',
              `While Done route was suppressed: ${doneRouting.reason}.`,
              409,
              runId
            );
          }
          const endDraft = context.startNode(endAction, doneRouting.payload);
          context.log('info', 'ORCH-4B executing End control node.', endAction);
          const endOutput = controlOutput(endAction, doneRouting.payload);
          context.completeNode(endAction, endDraft, endOutput, doneRouting.payload);
          const finishedAt = new Date().toISOString();
          context.log('success', 'ORCH-4B While workflow completed on the server.', endAction);
          const persisted = await persist(workflowId, context, 'completed', finishedAt);
          return {
            runId,
            status: 'completed',
            workflowId: String(workflow.id),
            workflowName: workflow.name,
            workflowVersion: workflow.version,
            nodeCount: context.records.length,
            executionId: persisted.executionId,
            output: doneRouting.payload ?? null,
          };
        }

        if (transition.route !== LOOP_BODY_PORT) {
          throw new OrchestratorExecutionError(
            'ORCH4B_UNKNOWN_LOOP_ROUTE',
            `While produced unsupported route '${transition.route}'.`,
            500,
            runId
          );
        }

        const bodyRouting = routeConnection(loopAction, graph.bodyConnection, transition.output);
        if (bodyRouting.skipped) {
          throw new OrchestratorExecutionError(
            'ORCH4B_BODY_ROUTE_SUPPRESSED',
            `While Body route was suppressed: ${bodyRouting.reason}.`,
            409,
            runId
          );
        }

        const bodyExecutionKey = loopExecutionKey(String(bodyAction.id), frames);
        const bodyDraft = context.startNode(bodyAction, bodyRouting.payload, {
          executionInstanceKey: bodyExecutionKey,
        });
        const aliases = loopRuntimeAliases(frames);
        context.log(
          'info',
          `ORCH-4B executing Body action: ${bodyAction.name || bodyAction.id}.`,
          bodyAction,
          {
            executionInstanceKey: bodyExecutionKey,
            iteration: aliases.iteration,
            currentIndex: aliases.currentIndex,
          }
        );

        try {
          const carryScope = context.buildScope({
            input: bodyRouting.payload,
            currentAction: bodyAction,
            previousNodeId: String(loopAction.id),
            previousPortId: LOOP_BODY_PORT,
            previousPortPayload: bodyRouting.payload,
          });
          const execution = await pluginExecutor.execute(bodyAction, {
            scope: carryScope,
            input: bodyRouting.payload,
            context,
          });
          const output = execution.output;
          context.completeNode(bodyAction, bodyDraft, output, execution.request.body);
          context.log(
            'success',
            `ORCH-4B Body action completed: ${bodyAction.name || bodyAction.id}.`,
            bodyAction,
            {
              executionInstanceKey: bodyExecutionKey,
              boundTokenCount: execution.request.bindingDiagnostics?.boundTokens?.length || 0,
            }
          );
          await persist(workflowId, context, 'running');
          frames = captureLoopBodyOutput(frames, output);
          loopInput = output;
          previousNodeId = String(bodyAction.id);
        } catch (error) {
          context.failNode(bodyAction, bodyDraft, error);
          const failedAt = new Date().toISOString();
          context.log('error', `ORCH-4B Body action failed: ${error.message || error}.`, bodyAction);
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            error.code || 'ORCH4B_BODY_EXECUTION_FAILED',
            error.message || 'ORCH-4B Body plugin execution failed.',
            Number(error.status) || 502,
            runId,
            error.details
          );
        }
      }
    } catch (error) {
      if (error instanceof OrchestratorExecutionError) {
        if (!context.records.some((record) => record.status === 'failed')) {
          try {
            const failedAt = new Date().toISOString();
            context.log('error', `ORCH-4B workflow failed: ${error.message || error}.`);
            await persist(workflowId, context, 'failed', failedAt);
          } catch {
            // Preserve the original orchestrator error.
          }
        }
        throw error;
      }

      const failedAt = new Date().toISOString();
      try {
        context.log('error', `ORCH-4B workflow failed: ${error.message || error}.`);
        await persist(workflowId, context, 'failed', failedAt);
      } catch {
        // Preserve the original execution error.
      }
      throw new OrchestratorExecutionError(
        error.code || 'ORCH4B_EXECUTION_FAILED',
        error.message || 'ORCH-4B execution failed.',
        Number(error.status) || 500,
        runId,
        error.details
      );
    }
  }


  async function executeRepeatUntilWorkflow(workflowId, workflow) {
    const graph = assertOrch4CRepeatUntilWorkflow(workflow);
    const runId = `orch4c-${uuidv4()}`;
    const context = new ServerExecutionContext({ runId, workflow, phase: 'ORCH-4C' });
    await persist(workflowId, context, 'running');

    const startAction = graph.start;
    const loopAction = graph.loop;
    const bodyAction = graph.bodyPlugin;
    const endAction = graph.end;
    const loopProperties = loopAction?.properties || {};
    let frames = [];

    try {
      const startDraft = context.startNode(startAction, null);
      context.log('info', 'ORCH-4C executing Start control node.', startAction);
      const startOutput = controlOutput(startAction, null);
      context.completeNode(startAction, startDraft, startOutput, null);
      await persist(workflowId, context, 'running');

      let loopInput = startOutput;
      let previousNodeId = String(startAction.id);

      while (true) {
        syncLoopRuntime(context, frames);
        const baseScope = context.buildScope({
          input: loopInput,
          currentAction: loopAction,
          previousNodeId,
        });
        const maxIterationsValue = resolveDeep(
          loopProperties.maxIterations,
          baseScope,
          { onMissing: 'keep' }
        );
        const controllerExecutionKey = loopExecutionKey(String(loopAction.id), frames);
        const loopDraft = context.startNode(loopAction, loopInput, {
          executionInstanceKey: controllerExecutionKey,
        });
        context.log(
          'info',
          `ORCH-4C advancing Repeat Until '${loopAction.name || loopAction.id}'.`,
          loopAction,
          { executionInstanceKey: controllerExecutionKey }
        );

        let transition;
        try {
          transition = advanceLoopState({
            action: loopAction,
            frames,
            inputData: loopInput,
            condition: String(loopProperties.condition ?? ''),
            maxIterationsValue,
            evaluate: (condition, candidateFrames) =>
              evaluateCondition(condition, loopConditionScope(baseScope, candidateFrames)),
          });
        } catch (error) {
          context.failNode(loopAction, loopDraft, error, loopInput);
          const failedAt = new Date().toISOString();
          context.log('error', `Repeat Until failed: ${error.message || error}.`, loopAction);
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            'ORCH4C_REPEAT_UNTIL_STATE_FAILED',
            error.message || 'ORCH-4C Repeat Until state transition failed.',
            409,
            runId
          );
        }

        context.completeNode(loopAction, loopDraft, transition.output, loopInput);
        await persist(workflowId, context, 'running');
        frames = transition.frames;
        syncLoopRuntime(context, frames);

        if (transition.route === LOOP_DONE_PORT) {
          const doneRouting = routeConnection(loopAction, graph.doneConnection, transition.output);
          if (doneRouting.skipped) {
            throw new OrchestratorExecutionError(
              'ORCH4C_DONE_ROUTE_SUPPRESSED',
              `Repeat Until Done route was suppressed: ${doneRouting.reason}.`,
              409,
              runId
            );
          }
          const endDraft = context.startNode(endAction, doneRouting.payload);
          context.log('info', 'ORCH-4C executing End control node.', endAction);
          const endOutput = controlOutput(endAction, doneRouting.payload);
          context.completeNode(endAction, endDraft, endOutput, doneRouting.payload);
          const finishedAt = new Date().toISOString();
          context.log('success', 'ORCH-4C Repeat Until workflow completed on the server.', endAction);
          const persisted = await persist(workflowId, context, 'completed', finishedAt);
          return {
            runId,
            status: 'completed',
            workflowId: String(workflow.id),
            workflowName: workflow.name,
            workflowVersion: workflow.version,
            nodeCount: context.records.length,
            executionId: persisted.executionId,
            output: doneRouting.payload ?? null,
          };
        }

        if (transition.route !== LOOP_BODY_PORT) {
          throw new OrchestratorExecutionError(
            'ORCH4C_UNKNOWN_LOOP_ROUTE',
            `Repeat Until produced unsupported route '${transition.route}'.`,
            500,
            runId
          );
        }

        const bodyRouting = routeConnection(loopAction, graph.bodyConnection, transition.output);
        if (bodyRouting.skipped) {
          throw new OrchestratorExecutionError(
            'ORCH4C_BODY_ROUTE_SUPPRESSED',
            `Repeat Until Body route was suppressed: ${bodyRouting.reason}.`,
            409,
            runId
          );
        }

        const bodyExecutionKey = loopExecutionKey(String(bodyAction.id), frames);
        const bodyDraft = context.startNode(bodyAction, bodyRouting.payload, {
          executionInstanceKey: bodyExecutionKey,
        });
        const aliases = loopRuntimeAliases(frames);
        context.log(
          'info',
          `ORCH-4C executing Body action: ${bodyAction.name || bodyAction.id}.`,
          bodyAction,
          {
            executionInstanceKey: bodyExecutionKey,
            iteration: aliases.iteration,
            currentIndex: aliases.currentIndex,
          }
        );

        try {
          const carryScope = context.buildScope({
            input: bodyRouting.payload,
            currentAction: bodyAction,
            previousNodeId: String(loopAction.id),
            previousPortId: LOOP_BODY_PORT,
            previousPortPayload: bodyRouting.payload,
          });
          const execution = await pluginExecutor.execute(bodyAction, {
            scope: carryScope,
            input: bodyRouting.payload,
            context,
          });
          const output = execution.output;
          context.completeNode(bodyAction, bodyDraft, output, execution.request.body);
          context.log(
            'success',
            `ORCH-4C Body action completed: ${bodyAction.name || bodyAction.id}.`,
            bodyAction,
            {
              executionInstanceKey: bodyExecutionKey,
              boundTokenCount: execution.request.bindingDiagnostics?.boundTokens?.length || 0,
            }
          );
          await persist(workflowId, context, 'running');
          frames = captureLoopBodyOutput(frames, output);
          loopInput = output;
          previousNodeId = String(bodyAction.id);
        } catch (error) {
          context.failNode(bodyAction, bodyDraft, error);
          const failedAt = new Date().toISOString();
          context.log('error', `ORCH-4C Body action failed: ${error.message || error}.`, bodyAction);
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            error.code || 'ORCH4C_BODY_EXECUTION_FAILED',
            error.message || 'ORCH-4C Body plugin execution failed.',
            Number(error.status) || 502,
            runId,
            error.details
          );
        }
      }
    } catch (error) {
      if (error instanceof OrchestratorExecutionError) {
        if (!context.records.some((record) => record.status === 'failed')) {
          try {
            const failedAt = new Date().toISOString();
            context.log('error', `ORCH-4C workflow failed: ${error.message || error}.`);
            await persist(workflowId, context, 'failed', failedAt);
          } catch {
            // Preserve the original orchestrator error.
          }
        }
        throw error;
      }

      const failedAt = new Date().toISOString();
      try {
        context.log('error', `ORCH-4C workflow failed: ${error.message || error}.`);
        await persist(workflowId, context, 'failed', failedAt);
      } catch {
        // Preserve the original execution error.
      }
      throw new OrchestratorExecutionError(
        error.code || 'ORCH4C_EXECUTION_FAILED',
        error.message || 'ORCH-4C execution failed.',
        Number(error.status) || 500,
        runId,
        error.details
      );
    }
  }


  async function executeBreakWorkflow(workflowId, workflow) {
    const graph = assertOrch4DBreakWorkflow(workflow);
    const runId = `orch4d-${uuidv4()}`;
    const context = new ServerExecutionContext({ runId, workflow, phase: 'ORCH-4D' });
    await persist(workflowId, context, 'running');

    const startAction = graph.start;
    const loopAction = graph.loop;
    const breakAction = graph.breakAction;
    const endAction = graph.end;
    const loopProperties = loopAction?.properties || {};
    let frames = [];

    try {
      const startDraft = context.startNode(startAction, null);
      context.log('info', 'ORCH-4D executing Start control node.', startAction);
      const startOutput = controlOutput(startAction, null);
      context.completeNode(startAction, startDraft, startOutput, null);
      await persist(workflowId, context, 'running');

      const collectionScope = context.buildScope({
        input: startOutput,
        currentAction: loopAction,
        previousNodeId: String(startAction.id),
      });
      const collectionValue = resolveDeep(
        loopProperties.collection,
        collectionScope,
        { onMissing: 'keep' }
      );
      const maxIterationsValue = resolveDeep(
        loopProperties.maxIterations,
        collectionScope,
        { onMissing: 'keep' }
      );

      syncLoopRuntime(context, frames);
      const controllerExecutionKey = loopExecutionKey(String(loopAction.id), frames);
      const loopDraft = context.startNode(loopAction, startOutput, {
        executionInstanceKey: controllerExecutionKey,
      });
      context.log(
        'info',
        `ORCH-4D advancing For Each '${loopAction.name || loopAction.id}' before Break.`,
        loopAction,
        { executionInstanceKey: controllerExecutionKey }
      );

      let transition;
      try {
        transition = advanceLoopState({
          action: loopAction,
          frames,
          inputData: startOutput,
          collectionValue,
          maxIterationsValue,
          evaluate: () => false,
        });
      } catch (error) {
        context.failNode(loopAction, loopDraft, error, startOutput);
        const failedAt = new Date().toISOString();
        context.log('error', `ORCH-4D For Each failed: ${error.message || error}.`, loopAction);
        await persist(workflowId, context, 'failed', failedAt);
        throw new OrchestratorExecutionError(
          'ORCH4D_FOREACH_STATE_FAILED',
          error.message || 'ORCH-4D For Each state transition failed.',
          409,
          runId
        );
      }

      context.completeNode(loopAction, loopDraft, transition.output, startOutput);
      await persist(workflowId, context, 'running');
      frames = transition.frames;
      syncLoopRuntime(context, frames);

      if (transition.route === LOOP_DONE_PORT) {
        const doneRouting = routeConnection(loopAction, graph.doneConnection, transition.output);
        if (doneRouting.skipped) {
          throw new OrchestratorExecutionError(
            'ORCH4D_DONE_ROUTE_SUPPRESSED',
            `For Each Done route was suppressed: ${doneRouting.reason}.`,
            409,
            runId
          );
        }
        const endDraft = context.startNode(endAction, doneRouting.payload);
        const endOutput = controlOutput(endAction, doneRouting.payload);
        context.completeNode(endAction, endDraft, endOutput, doneRouting.payload);
        const finishedAt = new Date().toISOString();
        const persisted = await persist(workflowId, context, 'completed', finishedAt);
        return {
          runId,
          status: 'completed',
          workflowId: String(workflow.id),
          workflowName: workflow.name,
          workflowVersion: workflow.version,
          nodeCount: context.records.length,
          executionId: persisted.executionId,
          output: doneRouting.payload ?? null,
        };
      }

      if (transition.route !== LOOP_BODY_PORT) {
        throw new OrchestratorExecutionError(
          'ORCH4D_UNKNOWN_LOOP_ROUTE',
          `For Each produced unsupported route '${transition.route}'.`,
          500,
          runId
        );
      }

      const bodyRouting = routeConnection(loopAction, graph.bodyConnection, transition.output);
      if (bodyRouting.skipped) {
        throw new OrchestratorExecutionError(
          'ORCH4D_BODY_ROUTE_SUPPRESSED',
          `For Each Body route was suppressed: ${bodyRouting.reason}.`,
          409,
          runId
        );
      }

      const aliases = loopRuntimeAliases(frames);
      const breakExecutionKey = loopExecutionKey(String(breakAction.id), frames);
      const breakDraft = context.startNode(breakAction, bodyRouting.payload, {
        executionInstanceKey: breakExecutionKey,
      });
      const signalOutput = {
        success: true,
        controlNode: true,
        signal: 'break',
        loopNodeId: String(loopAction.id),
        iteration: aliases.iteration,
      };
      context.log(
        'info',
        `ORCH-4D Break: exiting ${loopAction.name || loopAction.id} at iteration ${aliases.iteration}.`,
        breakAction,
        {
          executionInstanceKey: breakExecutionKey,
          loopNodeId: String(loopAction.id),
          iteration: aliases.iteration,
        }
      );
      context.completeNode(breakAction, breakDraft, signalOutput, bodyRouting.payload);
      await persist(workflowId, context, 'running');

      const activeFrame = frames[frames.length - 1];
      if (!activeFrame || String(activeFrame.loopNodeId) !== String(loopAction.id)) {
        throw new OrchestratorExecutionError(
          'ORCH4D_BREAK_WITHOUT_ACTIVE_LOOP',
          'Break could not find the active For Each loop frame.',
          409,
          runId
        );
      }

      const finishedFrame = finaliseCurrentLoopIteration(activeFrame);
      const doneOutput = makeLoopDoneOutput(finishedFrame, { broken: true });

      const breakDoneExecutionKey = loopExecutionKey(String(loopAction.id), frames);
      const doneDraft = context.startNode(loopAction, signalOutput, {
        executionInstanceKey: breakDoneExecutionKey,
      });
      context.completeNode(loopAction, doneDraft, doneOutput, signalOutput);
      await persist(workflowId, context, 'running');

      frames = popLoopFrame(frames);
      syncLoopRuntime(context, frames);

      const doneRouting = routeConnection(loopAction, graph.doneConnection, doneOutput);
      if (doneRouting.skipped) {
        throw new OrchestratorExecutionError(
          'ORCH4D_DONE_ROUTE_SUPPRESSED',
          `For Each Done route was suppressed after Break: ${doneRouting.reason}.`,
          409,
          runId
        );
      }

      const endDraft = context.startNode(endAction, doneRouting.payload);
      context.log('info', 'ORCH-4D executing End after Break.', endAction);
      const endOutput = controlOutput(endAction, doneRouting.payload);
      context.completeNode(endAction, endDraft, endOutput, doneRouting.payload);

      const finishedAt = new Date().toISOString();
      context.log('success', 'ORCH-4D Break workflow completed on the server.', endAction);
      const persisted = await persist(workflowId, context, 'completed', finishedAt);
      return {
        runId,
        status: 'completed',
        workflowId: String(workflow.id),
        workflowName: workflow.name,
        workflowVersion: workflow.version,
        nodeCount: context.records.length,
        executionId: persisted.executionId,
        output: doneRouting.payload ?? null,
      };
    } catch (error) {
      if (error instanceof OrchestratorExecutionError) {
        if (!context.records.some((record) => record.status === 'failed')) {
          try {
            const failedAt = new Date().toISOString();
            context.log('error', `ORCH-4D workflow failed: ${error.message || error}.`);
            await persist(workflowId, context, 'failed', failedAt);
          } catch {
          }
        }
        throw error;
      }

      const failedAt = new Date().toISOString();
      try {
        context.log('error', `ORCH-4D workflow failed: ${error.message || error}.`);
        await persist(workflowId, context, 'failed', failedAt);
      } catch {
      }
      throw new OrchestratorExecutionError(
        error.code || 'ORCH4D_EXECUTION_FAILED',
        error.message || 'ORCH-4D execution failed.',
        Number(error.status) || 500,
        runId,
        error.details
      );
    }
  }

  async function executeWorkflow(workflowId) {
    const workflow = await workflowLoader(workflowId, { workspaceKey });
    const actions = Array.isArray(workflow?.actions) ? workflow.actions : [];
    const hasBreak = actions.some(
      (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-break'
    );
    if (hasBreak) {
      return executeBreakWorkflow(workflowId, workflow);
    }
    const hasRepeatUntil = actions.some(
      (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-repeat-until'
    );
    if (hasRepeatUntil) {
      return executeRepeatUntilWorkflow(workflowId, workflow);
    }
    const hasWhile = actions.some(
      (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-while'
    );
    if (hasWhile) {
      return executeWhileWorkflow(workflowId, workflow);
    }
    if (hasOrch4LoopControls(workflow)) {
      return executeForEachWorkflow(workflowId, workflow);
    }
    const graph = assertOrch3Workflow(workflow);
    const isOrch3Run = hasOrch3RoutingFeatures(workflow);
    const runPrefix = isOrch3Run ? 'orch3' : 'orch2';
    const runId = `${runPrefix}-${uuidv4()}`;
    const context = new ServerExecutionContext({ runId, workflow });

    await persist(workflowId, context, 'running');

    const executedNodes = new Set();
    const executionQueue = [{
      nodeId: String(graph.start.id),
      inputData: undefined,
      fromNodeId: null,
      portId: null,
    }];
    let schedulerSteps = 0;
    const maxSchedulerSteps = Math.max(1000, graph.actions.length * graph.connections.length * 20);

    async function routeFromAction(sourceAction, sourceOutput) {
      for (const connection of graph.outgoing.get(String(sourceAction.id)) || []) {
        const targetAction = graph.byId.get(String(connection.targetId));
        const targetName = targetAction?.name || connection.targetId;
        const routing = routeConnection(sourceAction, connection, sourceOutput);

        if (routing.skipped) {
          context.log(
            'info',
            `Branch not taken: ${sourceAction.name || sourceAction.id} -> ${targetName}. ${routing.reason}.`,
            sourceAction,
            { port: routing.port?.id || null, recordCount: routing.recordCount }
          );
          continue;
        }

        let shouldProceed = true;
        const condition = String(connection?.condition || '').trim();
        if (condition) {
          const conditionScope = context.buildScope({
            input: routing.payload,
            currentAction: sourceAction,
            previousNodeId: String(sourceAction.id),
            previousPortId: routing.port?.id ?? null,
            previousPortPayload: routing.port ? routing.payload : undefined,
          });
          try {
            shouldProceed = evaluateCondition(condition, conditionScope);
          } catch (error) {
            shouldProceed = false;
            context.log(
              'warning',
              `Branch condition could not be evaluated and was treated as false: ${condition}.`,
              sourceAction,
              { connectionId: connection.id, error: error?.message || String(error) }
            );
          }
        }

        if (!shouldProceed) {
          context.log(
            'warning',
            `Branch skipped - condition '${condition}' evaluated false (${sourceAction.name || sourceAction.id} -> ${targetName}).`,
            sourceAction,
            { connectionId: connection.id, port: routing.port?.id || null }
          );
          continue;
        }

        if (executedNodes.has(String(connection.targetId))) continue;
        executionQueue.push({
          nodeId: String(connection.targetId),
          inputData: routing.payload,
          fromNodeId: String(sourceAction.id),
          portId: routing.port?.id ?? null,
        });
        context.log(
          'info',
          `Routing: ${sourceAction.name || sourceAction.id}` +
            (routing.port ? ` [${routing.port.label}]` : '') +
            ` -> ${targetName}` +
            (routing.port ? ` - ${routing.reason}` : ''),
          sourceAction,
          { connectionId: connection.id, port: routing.port?.id || null, recordCount: routing.recordCount }
        );
      }
    }

    try {
      while (executionQueue.length > 0 && schedulerSteps < maxSchedulerSteps) {
        schedulerSteps += 1;
        const entry = executionQueue.shift();
        const nodeId = String(entry.nodeId);
        if (executedNodes.has(nodeId)) continue;

        const action = graph.byId.get(nodeId);
        if (!action) continue;

        // Browser parity for fan-in: when another inbound source is already
        // queued and not yet executed, let that source drain first. Inbound
        // branches that were suppressed by a condition/empty port are not
        // queued and therefore do not block the join forever.
        if (!isStart(action)) {
          const pending = (graph.incoming.get(nodeId) || []).filter(
            (connection) => !executedNodes.has(String(connection.sourceId))
          );
          const reachablePending = pending.filter((connection) =>
            executionQueue.some((queued) => String(queued.nodeId) === String(connection.sourceId))
          );
          if (reachablePending.length > 0) {
            executionQueue.push(entry);
            continue;
          }
        }

        if (isStart(action)) {
          const draft = context.startNode(action, null);
          context.log('info', 'ORCH-3 executing Start control node.', action);
          const output = controlOutput(action, null);
          context.completeNode(action, draft, output, null);
          executedNodes.add(nodeId);
          await persist(workflowId, context, 'running');
          await routeFromAction(action, output);
          continue;
        }

        if (isEnd(action)) {
          const draft = context.startNode(action, entry.inputData);
          context.log('info', 'ORCH-3 executing End control node.', action);
          const endOutput = controlOutput(action, entry.inputData);
          context.completeNode(action, draft, endOutput, entry.inputData);
          executedNodes.add(nodeId);
          const finishedAt = new Date().toISOString();
          context.log('success', 'ORCH-3 workflow completed on the server.', action);
          const persisted = await persist(workflowId, context, 'completed', finishedAt);
          return {
            runId,
            status: 'completed',
            workflowId: String(workflow.id),
            workflowName: workflow.name,
            workflowVersion: workflow.version,
            nodeCount: context.records.length,
            executionId: persisted.executionId,
            output: entry.inputData ?? null,
          };
        }

        const pluginDraft = context.startNode(action, entry.inputData);
        context.log('info', `ORCH-3 executing engine action: ${action.name || action.id}.`, action);
        try {
          const carryScope = context.buildScope({
            input: entry.inputData,
            currentAction: action,
            previousNodeId: entry.fromNodeId ?? undefined,
            previousPortId: entry.portId ?? undefined,
            previousPortPayload: entry.portId ? entry.inputData : undefined,
          });
          const execution = await pluginExecutor.execute(action, {
            scope: carryScope,
            input: entry.inputData,
            context,
          });
          const output = execution.output;
          context.completeNode(action, pluginDraft, output, execution.request.body);
          executedNodes.add(nodeId);
          context.log('success', `Engine action completed: ${action.name || action.id}.`, action, {
            method: execution.request.method,
            routeSource: execution.request.routeSource,
            boundTokenCount: execution.request.bindingDiagnostics?.boundTokens?.length || 0,
          });
          await persist(workflowId, context, 'running');
          await routeFromAction(action, output);
        } catch (error) {
          context.failNode(action, pluginDraft, error);
          executedNodes.add(nodeId);
          context.log('error', `Engine action failed: ${error.message || error}.`, action);
          const failedAt = new Date().toISOString();
          await persist(workflowId, context, 'failed', failedAt);
          throw new OrchestratorExecutionError(
            error.code || 'ORCH3_PLUGIN_EXECUTION_FAILED',
            error.message || 'ORCH-3 plugin execution failed.',
            Number(error.status) || 502,
            runId,
            error.details
          );
        }
      }

      if (schedulerSteps >= maxSchedulerSteps && executionQueue.length > 0) {
        throw new OrchestratorExecutionError(
          'ORCH3_SCHEDULER_GUARD_EXCEEDED',
          `ORCH-3 exceeded its scheduler guard (${maxSchedulerSteps} steps).`,
          500,
          runId
        );
      }

      throw new OrchestratorExecutionError(
        'ORCH3_END_NOT_REACHED',
        'ORCH-3 routing completed without reaching End. All paths may have been suppressed.',
        409,
        runId
      );
    } catch (error) {
      if (error instanceof OrchestratorExecutionError) {
        // Plugin failures were already persisted above. For routing/end errors,
        // persist a final failed snapshot here.
        if (!context.records.some((record) => record.status === 'failed')) {
          try {
            const failedAt = new Date().toISOString();
            context.log('error', `ORCH-3 workflow failed: ${error.message || error}.`);
            await persist(workflowId, context, 'failed', failedAt);
          } catch {
            // Preserve the original orchestrator error.
          }
        }
        throw error;
      }

      const failedAt = new Date().toISOString();
      try {
        context.log('error', `ORCH-3 workflow failed: ${error.message || error}.`);
        await persist(workflowId, context, 'failed', failedAt);
      } catch {
        // Preserve the original execution error.
      }
      throw new OrchestratorExecutionError(
        error.code || 'ORCH3_EXECUTION_FAILED',
        error.message || 'ORCH-3 execution failed.',
        Number(error.status) || 500,
        runId,
        error.details
      );
    }
  }

  return { executeWorkflow };
}

module.exports = {
  OrchestratorExecutionError,
  createWorkflowOrchestrator,
};
