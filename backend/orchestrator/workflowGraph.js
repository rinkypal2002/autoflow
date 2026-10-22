'use strict';

class OrchestratorGraphError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'OrchestratorGraphError';
    this.code = code;
    this.status = status;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isStart(action) {
  return action?.type === 'workflow-start';
}

function isEnd(action) {
  return action?.type === 'workflow-end';
}

/** Strict ORCH-1 validator retained as a regression guard. */
function assertOrch1LinearWorkflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length !== 3) {
    throw new OrchestratorGraphError(
      'ORCH1_LINEAR_WORKFLOW_REQUIRED',
      `ORCH-1 accepts exactly 3 nodes (Start -> one API plugin -> End); found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH1_DISABLED_NODE_UNSUPPORTED',
      `ORCH-1 does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  if (starts.length !== 1 || ends.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH1_START_END_REQUIRED',
      `ORCH-1 requires exactly one Start and one End node (found Start=${starts.length}, End=${ends.length}).`
    );
  }

  const pluginActions = actions.filter((action) => !isStart(action) && !isEnd(action));
  if (pluginActions.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH1_SINGLE_PLUGIN_REQUIRED',
      `ORCH-1 requires exactly one normal plugin node; found ${pluginActions.length}.`
    );
  }

  const plugin = pluginActions[0];
  if (plugin?.isControlNode === true || String(plugin?.type || '').startsWith('workflow-')) {
    throw new OrchestratorGraphError(
      'ORCH1_CONTROL_NODE_UNSUPPORTED',
      `ORCH-1 only supports Start and End control nodes; '${plugin.name || plugin.id}' is another control node.`
    );
  }

  if (!plugin?.api?.url && !plugin?.type) {
    throw new OrchestratorGraphError(
      'ORCH1_PLUGIN_API_REQUIRED',
      `Plugin '${plugin?.name || plugin?.id || 'unknown'}' has neither an API URL nor an action type.`
    );
  }

  if (String(plugin?.api?.bodyType || '').toLowerCase() === 'form-data') {
    throw new OrchestratorGraphError(
      'ORCH1_MULTIPART_UNSUPPORTED',
      `ORCH-1 does not support multipart/file actions yet. '${plugin.name || plugin.id}' uses form-data.`
    );
  }

  if (connections.length !== 2) {
    throw new OrchestratorGraphError(
      'ORCH1_TWO_CONNECTIONS_REQUIRED',
      `ORCH-1 requires exactly 2 active connections; found ${connections.length}.`
    );
  }

  for (const connection of connections) {
    if (
      String(connection?.condition || '').trim() ||
      String(connection?.sourcePort || '').trim() ||
      String(connection?.targetPort || '').trim()
    ) {
      throw new OrchestratorGraphError(
        'ORCH1_BRANCHING_UNSUPPORTED',
        'ORCH-1 does not support conditional or port-based routing yet.'
      );
    }
  }

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH1_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (outgoing.has(sourceId)) {
      throw new OrchestratorGraphError(
        'ORCH1_FAN_OUT_UNSUPPORTED',
        `Node '${byId.get(sourceId)?.name || sourceId}' has more than one outgoing connection.`
      );
    }
    outgoing.set(sourceId, targetId);
    incoming.set(targetId, (incoming.get(targetId) || 0) + 1);
  }

  const start = starts[0];
  const end = ends[0];
  const pluginId = outgoing.get(String(start.id));
  const endId = pluginId ? outgoing.get(pluginId) : null;

  if (
    pluginId !== String(plugin.id) ||
    endId !== String(end.id) ||
    incoming.get(String(start.id)) ||
    incoming.get(String(plugin.id)) !== 1 ||
    incoming.get(String(end.id)) !== 1 ||
    outgoing.has(String(end.id))
  ) {
    throw new OrchestratorGraphError(
      'ORCH1_LINEAR_CHAIN_INVALID',
      'ORCH-1 requires one deterministic chain: Start -> one API plugin -> End.'
    );
  }

  return [start, plugin, end];
}

/**
 * ORCH-2 keeps scheduling deliberately deterministic while allowing enough
 * normal plugin steps to certify previous/steps bindings across real nodes.
 * Branches, ports, loops and multipart/file actions remain later phases.
 */
function assertOrch2LinearWorkflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length < 3) {
    throw new OrchestratorGraphError(
      'ORCH2_LINEAR_WORKFLOW_REQUIRED',
      `ORCH-2 requires Start -> one or more API plugins -> End; found ${actions.length} node(s).`
    );
  }
  if (actions.length > 100) {
    throw new OrchestratorGraphError(
      'ORCH2_LINEAR_WORKFLOW_TOO_LARGE',
      `ORCH-2 certification is capped at 100 linear nodes; found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH2_DISABLED_NODE_UNSUPPORTED',
      `ORCH-2 does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  if (starts.length !== 1 || ends.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH2_START_END_REQUIRED',
      `ORCH-2 requires exactly one Start and one End node (found Start=${starts.length}, End=${ends.length}).`
    );
  }

  const plugins = actions.filter((action) => !isStart(action) && !isEnd(action));
  if (plugins.length < 1) {
    throw new OrchestratorGraphError(
      'ORCH2_PLUGIN_REQUIRED',
      'ORCH-2 requires at least one normal API plugin between Start and End.'
    );
  }

  for (const plugin of plugins) {
    if (plugin?.isControlNode === true || String(plugin?.type || '').startsWith('workflow-')) {
      throw new OrchestratorGraphError(
        'ORCH2_CONTROL_NODE_UNSUPPORTED',
        `ORCH-2 only supports Start and End control nodes; '${plugin.name || plugin.id}' is another control node.`
      );
    }
    if (!plugin?.api?.url && !plugin?.type) {
      throw new OrchestratorGraphError(
        'ORCH2_PLUGIN_API_REQUIRED',
        `Plugin '${plugin?.name || plugin?.id || 'unknown'}' has neither an API URL nor an action type.`
      );
    }
    const bodyType = String(plugin?.api?.bodyType || '').toLowerCase();
    if (bodyType === 'form-data' || bodyType === 'multipart') {
      throw new OrchestratorGraphError(
        'ORCH2_MULTIPART_UNSUPPORTED',
        `ORCH-2 does not support multipart/file actions yet. '${plugin.name || plugin.id}' uses ${bodyType}.`
      );
    }
  }

  if (connections.length !== actions.length - 1) {
    throw new OrchestratorGraphError(
      'ORCH2_LINEAR_CONNECTION_COUNT_INVALID',
      `ORCH-2 requires exactly ${actions.length - 1} active connection(s) for ${actions.length} linear nodes; found ${connections.length}.`
    );
  }

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();

  for (const connection of connections) {
    if (
      String(connection?.condition || '').trim() ||
      String(connection?.sourcePort || '').trim() ||
      String(connection?.targetPort || '').trim()
    ) {
      throw new OrchestratorGraphError(
        'ORCH2_BRANCHING_UNSUPPORTED',
        'ORCH-2 does not support conditional or port-based routing yet.'
      );
    }

    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH2_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (sourceId === targetId) {
      throw new OrchestratorGraphError(
        'ORCH2_SELF_LOOP_UNSUPPORTED',
        `Node '${byId.get(sourceId)?.name || sourceId}' connects to itself.`
      );
    }
    if (outgoing.has(sourceId)) {
      throw new OrchestratorGraphError(
        'ORCH2_FAN_OUT_UNSUPPORTED',
        `Node '${byId.get(sourceId)?.name || sourceId}' has more than one outgoing connection.`
      );
    }
    const incomingCount = (incoming.get(targetId) || 0) + 1;
    if (incomingCount > 1) {
      throw new OrchestratorGraphError(
        'ORCH2_FAN_IN_UNSUPPORTED',
        `Node '${byId.get(targetId)?.name || targetId}' has more than one incoming connection.`
      );
    }
    outgoing.set(sourceId, targetId);
    incoming.set(targetId, incomingCount);
  }

  const start = starts[0];
  const end = ends[0];
  if (incoming.has(String(start.id)) || outgoing.has(String(end.id))) {
    throw new OrchestratorGraphError(
      'ORCH2_LINEAR_CHAIN_INVALID',
      'ORCH-2 Start cannot have an incoming edge and End cannot have an outgoing edge.'
    );
  }

  const ordered = [];
  const visited = new Set();
  let currentId = String(start.id);
  while (currentId) {
    if (visited.has(currentId)) {
      throw new OrchestratorGraphError(
        'ORCH2_CYCLE_UNSUPPORTED',
        `ORCH-2 detected a cycle at node '${byId.get(currentId)?.name || currentId}'.`
      );
    }
    visited.add(currentId);
    ordered.push(byId.get(currentId));
    if (currentId === String(end.id)) break;
    currentId = outgoing.get(currentId) || '';
  }

  if (
    ordered.length !== actions.length ||
    ordered[0] !== start ||
    ordered[ordered.length - 1] !== end ||
    visited.size !== actions.length
  ) {
    throw new OrchestratorGraphError(
      'ORCH2_LINEAR_CHAIN_INVALID',
      'ORCH-2 requires one deterministic chain containing every node: Start -> API plugin(s) -> End.'
    );
  }

  return ordered;
}


/**
 * ORCH-3 validator: one Start, one End, normal API plugins, and an acyclic
 * connected graph. Conditions, named source ports, target ports, fan-out and
 * fan-in are allowed. Loops and other workflow control nodes remain ORCH-4.
 */
function assertOrch3Workflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length < 3) {
    throw new OrchestratorGraphError(
      'ORCH3_WORKFLOW_TOO_SMALL',
      `ORCH-3 requires Start -> plugin(s) -> End; found ${actions.length} node(s).`
    );
  }
  if (actions.length > 500) {
    throw new OrchestratorGraphError(
      'ORCH3_WORKFLOW_TOO_LARGE',
      `ORCH-3 certification is capped at 500 nodes; found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH3_DISABLED_NODE_UNSUPPORTED',
      `ORCH-3 does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  if (starts.length !== 1 || ends.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH3_START_END_REQUIRED',
      `ORCH-3 requires exactly one Start and one End node (found Start=${starts.length}, End=${ends.length}).`
    );
  }

  const start = starts[0];
  const end = ends[0];
  const plugins = actions.filter((action) => !isStart(action) && !isEnd(action));
  if (plugins.length < 1) {
    throw new OrchestratorGraphError(
      'ORCH3_PLUGIN_REQUIRED',
      'ORCH-3 requires at least one normal API plugin between Start and End.'
    );
  }

  for (const plugin of plugins) {
    if (plugin?.isControlNode === true || String(plugin?.type || '').startsWith('workflow-')) {
      throw new OrchestratorGraphError(
        'ORCH3_CONTROL_NODE_UNSUPPORTED',
        `ORCH-3 supports branching between normal plugins but not '${plugin.name || plugin.id}' control nodes yet.`
      );
    }
    if (!plugin?.api?.url && !plugin?.type) {
      throw new OrchestratorGraphError(
        'ORCH3_PLUGIN_API_REQUIRED',
        `Plugin '${plugin?.name || plugin?.id || 'unknown'}' has neither an API URL nor an action type.`
      );
    }
    const bodyType = String(plugin?.api?.bodyType || '').toLowerCase();
    if (bodyType === 'form-data' || bodyType === 'multipart') {
      throw new OrchestratorGraphError(
        'ORCH3_MULTIPART_UNSUPPORTED',
        `ORCH-3 does not support multipart/file actions yet. '${plugin.name || plugin.id}' uses ${bodyType}.`
      );
    }
  }

  if (connections.length < 2) {
    throw new OrchestratorGraphError(
      'ORCH3_CONNECTIONS_REQUIRED',
      `ORCH-3 requires at least 2 active connections; found ${connections.length}.`
    );
  }

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();

  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH3_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (sourceId === targetId) {
      throw new OrchestratorGraphError(
        'ORCH3_SELF_LOOP_UNSUPPORTED',
        `Node '${byId.get(sourceId)?.name || sourceId}' connects to itself.`
      );
    }
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    if (!incoming.has(targetId)) incoming.set(targetId, []);
    outgoing.get(sourceId).push(connection);
    incoming.get(targetId).push(connection);
  }

  if (incoming.has(String(start.id))) {
    throw new OrchestratorGraphError(
      'ORCH3_START_HAS_INCOMING',
      'ORCH-3 Start cannot have an incoming connection.'
    );
  }
  if (outgoing.has(String(end.id))) {
    throw new OrchestratorGraphError(
      'ORCH3_END_HAS_OUTGOING',
      'ORCH-3 End cannot have an outgoing connection.'
    );
  }

  // Every node must be statically reachable from Start.
  const reachable = new Set();
  const stack = [String(start.id)];
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    for (const connection of outgoing.get(nodeId) || []) {
      stack.push(String(connection.targetId));
    }
  }
  if (reachable.size !== actions.length) {
    const missing = actions.filter((action) => !reachable.has(String(action.id)));
    throw new OrchestratorGraphError(
      'ORCH3_UNREACHABLE_NODE',
      `ORCH-3 requires every node to be reachable from Start. Unreachable: ${missing.map((node) => node.name || node.id).join(', ')}.`
    );
  }

  // Every node must also have a static path to End, so a taken branch cannot
  // terminate in a hidden dead end.
  const canReachEnd = new Set();
  const reverseStack = [String(end.id)];
  while (reverseStack.length > 0) {
    const nodeId = reverseStack.pop();
    if (canReachEnd.has(nodeId)) continue;
    canReachEnd.add(nodeId);
    for (const connection of incoming.get(nodeId) || []) {
      reverseStack.push(String(connection.sourceId));
    }
  }
  if (canReachEnd.size !== actions.length) {
    const deadEnds = actions.filter((action) => !canReachEnd.has(String(action.id)));
    throw new OrchestratorGraphError(
      'ORCH3_DEAD_END_BRANCH',
      `ORCH-3 requires every node to have a path to End. Dead end(s): ${deadEnds.map((node) => node.name || node.id).join(', ')}.`
    );
  }

  // Kahn topological check: cycles remain ORCH-4 loop territory.
  const indegree = new Map(actions.map((action) => [String(action.id), 0]));
  for (const connection of connections) {
    const targetId = String(connection.targetId);
    indegree.set(targetId, (indegree.get(targetId) || 0) + 1);
  }
  const ready = actions
    .filter((action) => (indegree.get(String(action.id)) || 0) === 0)
    .map((action) => String(action.id));
  let visitedCount = 0;
  while (ready.length > 0) {
    const nodeId = ready.shift();
    visitedCount += 1;
    for (const connection of outgoing.get(nodeId) || []) {
      const targetId = String(connection.targetId);
      const next = (indegree.get(targetId) || 0) - 1;
      indegree.set(targetId, next);
      if (next === 0) ready.push(targetId);
    }
  }
  if (visitedCount !== actions.length) {
    throw new OrchestratorGraphError(
      'ORCH3_CYCLE_UNSUPPORTED',
      'ORCH-3 detected a cycle. Loop/cycle execution is introduced in ORCH-4.'
    );
  }

  return { actions, connections, byId, outgoing, incoming, start, end };
}

function hasOrch3RoutingFeatures(workflow) {
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );
  const outgoingCount = new Map();
  const incomingCount = new Map();
  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    outgoingCount.set(sourceId, (outgoingCount.get(sourceId) || 0) + 1);
    incomingCount.set(targetId, (incomingCount.get(targetId) || 0) + 1);
    if (
      String(connection?.condition || '').trim() ||
      String(connection?.sourcePort || '').trim() ||
      String(connection?.targetPort || '').trim()
    ) return true;
  }
  return [...outgoingCount.values()].some((count) => count > 1) ||
    [...incomingCount.values()].some((count) => count > 1);
}


/**
 * ORCH-4A validator: deliberately narrow first loop cutover.
 * Exactly one For Each controller is allowed with one normal plugin in the Body
 * path and an explicit back-edge to the controller. The Done port must route to
 * the single End node. While / Repeat Until / Break / Continue arrive in later
 * ORCH-4 increments so their semantics are never approximated accidentally.
 */
function assertOrch4AForEachWorkflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4A_FOREACH_SHAPE_REQUIRED',
      `ORCH-4A accepts exactly 4 nodes (Start -> For Each -> one Body plugin -> End); found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH4A_DISABLED_NODE_UNSUPPORTED',
      `ORCH-4A does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  const forEachNodes = actions.filter(
    (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-for-each'
  );
  const unsupportedControls = actions.filter((action) => {
    const type = String(action?.type || '').trim().toLowerCase();
    return type.startsWith('workflow-') &&
      type !== 'workflow-start' &&
      type !== 'workflow-end' &&
      type !== 'workflow-for-each';
  });

  if (unsupportedControls.length > 0) {
    throw new OrchestratorGraphError(
      'ORCH4A_FOREACH_ONLY',
      `ORCH-4A certifies For Each first. Unsupported control node(s): ${unsupportedControls.map((node) => node.name || node.id).join(', ')}.`
    );
  }
  if (starts.length !== 1 || ends.length !== 1 || forEachNodes.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4A_START_FOREACH_END_REQUIRED',
      `ORCH-4A requires exactly one Start, one For Each and one End (found Start=${starts.length}, ForEach=${forEachNodes.length}, End=${ends.length}).`
    );
  }

  const start = starts[0];
  const end = ends[0];
  const loop = forEachNodes[0];
  const bodyPlugins = actions.filter(
    (action) => action !== start && action !== end && action !== loop
  );
  if (bodyPlugins.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4A_SINGLE_BODY_PLUGIN_REQUIRED',
      `ORCH-4A requires exactly one normal plugin in the For Each Body; found ${bodyPlugins.length}.`
    );
  }
  const bodyPlugin = bodyPlugins[0];
  if (bodyPlugin?.isControlNode === true || String(bodyPlugin?.type || '').startsWith('workflow-')) {
    throw new OrchestratorGraphError(
      'ORCH4A_BODY_CONTROL_UNSUPPORTED',
      `ORCH-4A Body must contain one normal API plugin; '${bodyPlugin.name || bodyPlugin.id}' is a control node.`
    );
  }
  if (!bodyPlugin?.api?.url && !bodyPlugin?.type) {
    throw new OrchestratorGraphError(
      'ORCH4A_BODY_PLUGIN_API_REQUIRED',
      `Body plugin '${bodyPlugin?.name || bodyPlugin?.id || 'unknown'}' has neither an API URL nor an action type.`
    );
  }
  const bodyType = String(bodyPlugin?.api?.bodyType || '').toLowerCase();
  if (bodyType === 'form-data' || bodyType === 'multipart') {
    throw new OrchestratorGraphError(
      'ORCH4A_MULTIPART_UNSUPPORTED',
      `ORCH-4A does not support multipart/file actions yet. '${bodyPlugin.name || bodyPlugin.id}' uses ${bodyType}.`
    );
  }

  if (connections.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4A_CONNECTION_COUNT_INVALID',
      `ORCH-4A requires exactly 4 active connections; found ${connections.length}.`
    );
  }

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH4A_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (String(connection?.condition || '').trim() || String(connection?.targetPort || '').trim()) {
      throw new OrchestratorGraphError(
        'ORCH4A_CONDITIONAL_ROUTING_DEFERRED',
        'ORCH-4A For Each certification does not combine loop edges with conditions/target ports yet.'
      );
    }
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    if (!incoming.has(targetId)) incoming.set(targetId, []);
    outgoing.get(sourceId).push(connection);
    incoming.get(targetId).push(connection);
  }

  if (incoming.has(String(start.id)) || outgoing.has(String(end.id))) {
    throw new OrchestratorGraphError(
      'ORCH4A_START_END_DIRECTION_INVALID',
      'ORCH-4A Start cannot have incoming edges and End cannot have outgoing edges.'
    );
  }

  const startOut = outgoing.get(String(start.id)) || [];
  const loopOut = outgoing.get(String(loop.id)) || [];
  const bodyOut = outgoing.get(String(bodyPlugin.id)) || [];
  if (startOut.length !== 1 || bodyOut.length !== 1 || loopOut.length !== 2) {
    throw new OrchestratorGraphError(
      'ORCH4A_FOREACH_WIRING_INVALID',
      'ORCH-4A requires Start -> For Each, For Each Body -> plugin -> For Each, and For Each Done -> End.'
    );
  }

  const startConnection = startOut[0];
  const bodyConnection = loopOut.find((connection) => String(connection?.sourcePort || '').trim() === 'body');
  const doneConnection = loopOut.find((connection) => String(connection?.sourcePort || '').trim() === 'done');
  const backConnection = bodyOut[0];

  const valid =
    String(startConnection.targetId) === String(loop.id) &&
    !String(startConnection?.sourcePort || '').trim() &&
    bodyConnection && String(bodyConnection.targetId) === String(bodyPlugin.id) &&
    doneConnection && String(doneConnection.targetId) === String(end.id) &&
    String(backConnection.targetId) === String(loop.id) &&
    !String(backConnection?.sourcePort || '').trim();

  if (!valid) {
    throw new OrchestratorGraphError(
      'ORCH4A_FOREACH_WIRING_INVALID',
      'ORCH-4A requires the exact controlled cycle Start -> For Each [Body] -> one plugin -> For Each, plus For Each [Done] -> End.'
    );
  }

  const loopIncoming = incoming.get(String(loop.id)) || [];
  const bodyIncoming = incoming.get(String(bodyPlugin.id)) || [];
  const endIncoming = incoming.get(String(end.id)) || [];
  if (
    loopIncoming.length !== 2 ||
    bodyIncoming.length !== 1 ||
    endIncoming.length !== 1 ||
    !loopIncoming.some((connection) => String(connection.sourceId) === String(start.id)) ||
    !loopIncoming.some((connection) => String(connection.sourceId) === String(bodyPlugin.id)) ||
    String(bodyIncoming[0].sourceId) !== String(loop.id) ||
    String(endIncoming[0].sourceId) !== String(loop.id)
  ) {
    throw new OrchestratorGraphError(
      'ORCH4A_FOREACH_WIRING_INVALID',
      'ORCH-4A For Each edges are not connected to the expected Start/Body/Done nodes.'
    );
  }

  return {
    actions,
    connections,
    byId,
    outgoing,
    incoming,
    start,
    end,
    loop,
    bodyPlugin,
    startConnection,
    bodyConnection,
    backConnection,
    doneConnection,
  };
}


function assertOrch4BWhileWorkflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4B_WHILE_SHAPE_REQUIRED',
      `ORCH-4B accepts exactly 4 nodes (Start -> While -> one Body plugin -> End); found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH4B_DISABLED_NODE_UNSUPPORTED',
      `ORCH-4B does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  const whileNodes = actions.filter(
    (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-while'
  );
  const unsupportedControls = actions.filter((action) => {
    const type = String(action?.type || '').trim().toLowerCase();
    return type.startsWith('workflow-') &&
      type !== 'workflow-start' &&
      type !== 'workflow-end' &&
      type !== 'workflow-while';
  });

  if (unsupportedControls.length > 0) {
    throw new OrchestratorGraphError(
      'ORCH4B_WHILE_ONLY',
      `ORCH-4B certifies While first. Unsupported control node(s): ${unsupportedControls.map((node) => node.name || node.id).join(', ')}.`
    );
  }
  if (starts.length !== 1 || ends.length !== 1 || whileNodes.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4B_START_WHILE_END_REQUIRED',
      `ORCH-4B requires exactly one Start, one While and one End (found Start=${starts.length}, While=${whileNodes.length}, End=${ends.length}).`
    );
  }

  const start = starts[0];
  const end = ends[0];
  const loop = whileNodes[0];
  const bodyPlugins = actions.filter(
    (action) => action !== start && action !== end && action !== loop
  );
  if (bodyPlugins.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4B_SINGLE_BODY_PLUGIN_REQUIRED',
      `ORCH-4B requires exactly one normal plugin in the While Body; found ${bodyPlugins.length}.`
    );
  }
  const bodyPlugin = bodyPlugins[0];
  if (bodyPlugin?.isControlNode === true || String(bodyPlugin?.type || '').startsWith('workflow-')) {
    throw new OrchestratorGraphError(
      'ORCH4B_BODY_CONTROL_UNSUPPORTED',
      `ORCH-4B Body must contain one normal API plugin; '${bodyPlugin.name || bodyPlugin.id}' is a control node.`
    );
  }
  if (!bodyPlugin?.api?.url && !bodyPlugin?.type) {
    throw new OrchestratorGraphError(
      'ORCH4B_BODY_PLUGIN_API_REQUIRED',
      `Body plugin '${bodyPlugin?.name || bodyPlugin?.id || 'unknown'}' has neither an API URL nor an action type.`
    );
  }
  const bodyType = String(bodyPlugin?.api?.bodyType || '').toLowerCase();
  if (bodyType === 'form-data' || bodyType === 'multipart') {
    throw new OrchestratorGraphError(
      'ORCH4B_MULTIPART_UNSUPPORTED',
      `ORCH-4B does not support multipart/file actions yet. '${bodyPlugin.name || bodyPlugin.id}' uses ${bodyType}.`
    );
  }

  if (connections.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4B_CONNECTION_COUNT_INVALID',
      `ORCH-4B requires exactly 4 active connections; found ${connections.length}.`
    );
  }

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH4B_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (String(connection?.condition || '').trim() || String(connection?.targetPort || '').trim()) {
      throw new OrchestratorGraphError(
        'ORCH4B_CONDITIONAL_ROUTING_DEFERRED',
        'ORCH-4B While certification does not combine loop edges with conditions/target ports yet.'
      );
    }
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    if (!incoming.has(targetId)) incoming.set(targetId, []);
    outgoing.get(sourceId).push(connection);
    incoming.get(targetId).push(connection);
  }

  if (incoming.has(String(start.id)) || outgoing.has(String(end.id))) {
    throw new OrchestratorGraphError(
      'ORCH4B_START_END_DIRECTION_INVALID',
      'ORCH-4B Start cannot have incoming edges and End cannot have outgoing edges.'
    );
  }

  const startOut = outgoing.get(String(start.id)) || [];
  const loopOut = outgoing.get(String(loop.id)) || [];
  const bodyOut = outgoing.get(String(bodyPlugin.id)) || [];
  if (startOut.length !== 1 || bodyOut.length !== 1 || loopOut.length !== 2) {
    throw new OrchestratorGraphError(
      'ORCH4B_WHILE_WIRING_INVALID',
      'ORCH-4B requires Start -> While, While Body -> plugin -> While, and While Done -> End.'
    );
  }

  const startConnection = startOut[0];
  const bodyConnection = loopOut.find((connection) => String(connection?.sourcePort || '').trim() === 'body');
  const doneConnection = loopOut.find((connection) => String(connection?.sourcePort || '').trim() === 'done');
  const backConnection = bodyOut[0];

  const valid =
    String(startConnection.targetId) === String(loop.id) &&
    !String(startConnection?.sourcePort || '').trim() &&
    bodyConnection && String(bodyConnection.targetId) === String(bodyPlugin.id) &&
    doneConnection && String(doneConnection.targetId) === String(end.id) &&
    String(backConnection.targetId) === String(loop.id) &&
    !String(backConnection?.sourcePort || '').trim();

  if (!valid) {
    throw new OrchestratorGraphError(
      'ORCH4B_WHILE_WIRING_INVALID',
      'ORCH-4B requires the exact controlled cycle Start -> While [Body] -> one plugin -> While, plus While [Done] -> End.'
    );
  }

  const loopIncoming = incoming.get(String(loop.id)) || [];
  const bodyIncoming = incoming.get(String(bodyPlugin.id)) || [];
  const endIncoming = incoming.get(String(end.id)) || [];
  if (
    loopIncoming.length !== 2 ||
    bodyIncoming.length !== 1 ||
    endIncoming.length !== 1 ||
    !loopIncoming.some((connection) => String(connection.sourceId) === String(start.id)) ||
    !loopIncoming.some((connection) => String(connection.sourceId) === String(bodyPlugin.id)) ||
    String(bodyIncoming[0].sourceId) !== String(loop.id) ||
    String(endIncoming[0].sourceId) !== String(loop.id)
  ) {
    throw new OrchestratorGraphError(
      'ORCH4B_WHILE_WIRING_INVALID',
      'ORCH-4B While edges are not connected to the expected Start/Body/Done nodes.'
    );
  }

  return {
    actions,
    connections,
    byId,
    outgoing,
    incoming,
    start,
    end,
    loop,
    bodyPlugin,
    startConnection,
    bodyConnection,
    backConnection,
    doneConnection,
  };
}


function assertOrch4CRepeatUntilWorkflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4C_REPEAT_UNTIL_SHAPE_REQUIRED',
      `ORCH-4C accepts exactly 4 nodes (Start -> Repeat Until -> one Body plugin -> End); found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH4C_DISABLED_NODE_UNSUPPORTED',
      `ORCH-4C does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  const repeatUntilNodes = actions.filter(
    (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-repeat-until'
  );
  const unsupportedControls = actions.filter((action) => {
    const type = String(action?.type || '').trim().toLowerCase();
    return type.startsWith('workflow-') &&
      type !== 'workflow-start' &&
      type !== 'workflow-end' &&
      type !== 'workflow-repeat-until';
  });

  if (unsupportedControls.length > 0) {
    throw new OrchestratorGraphError(
      'ORCH4C_REPEAT_UNTIL_ONLY',
      `ORCH-4C certifies Repeat Until first. Unsupported control node(s): ${unsupportedControls.map((node) => node.name || node.id).join(', ')}.`
    );
  }
  if (starts.length !== 1 || ends.length !== 1 || repeatUntilNodes.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4C_START_REPEAT_UNTIL_END_REQUIRED',
      `ORCH-4C requires exactly one Start, one Repeat Until and one End (found Start=${starts.length}, Repeat Until=${repeatUntilNodes.length}, End=${ends.length}).`
    );
  }

  const start = starts[0];
  const end = ends[0];
  const loop = repeatUntilNodes[0];
  const bodyPlugins = actions.filter(
    (action) => action !== start && action !== end && action !== loop
  );
  if (bodyPlugins.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4C_SINGLE_BODY_PLUGIN_REQUIRED',
      `ORCH-4C requires exactly one normal plugin in the Repeat Until Body; found ${bodyPlugins.length}.`
    );
  }
  const bodyPlugin = bodyPlugins[0];
  if (bodyPlugin?.isControlNode === true || String(bodyPlugin?.type || '').startsWith('workflow-')) {
    throw new OrchestratorGraphError(
      'ORCH4C_BODY_CONTROL_UNSUPPORTED',
      `ORCH-4C Body must contain one normal API plugin; '${bodyPlugin.name || bodyPlugin.id}' is a control node.`
    );
  }
  if (!bodyPlugin?.api?.url && !bodyPlugin?.type) {
    throw new OrchestratorGraphError(
      'ORCH4C_BODY_PLUGIN_API_REQUIRED',
      `Body plugin '${bodyPlugin?.name || bodyPlugin?.id || 'unknown'}' has neither an API URL nor an action type.`
    );
  }
  const bodyType = String(bodyPlugin?.api?.bodyType || '').toLowerCase();
  if (bodyType === 'form-data' || bodyType === 'multipart') {
    throw new OrchestratorGraphError(
      'ORCH4C_MULTIPART_UNSUPPORTED',
      `ORCH-4C does not support multipart/file actions yet. '${bodyPlugin.name || bodyPlugin.id}' uses ${bodyType}.`
    );
  }

  if (connections.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4C_CONNECTION_COUNT_INVALID',
      `ORCH-4C requires exactly 4 active connections; found ${connections.length}.`
    );
  }

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH4C_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (String(connection?.condition || '').trim() || String(connection?.targetPort || '').trim()) {
      throw new OrchestratorGraphError(
        'ORCH4C_CONDITIONAL_ROUTING_DEFERRED',
        'ORCH-4C Repeat Until certification does not combine loop edges with conditions/target ports yet.'
      );
    }
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    if (!incoming.has(targetId)) incoming.set(targetId, []);
    outgoing.get(sourceId).push(connection);
    incoming.get(targetId).push(connection);
  }

  if (incoming.has(String(start.id)) || outgoing.has(String(end.id))) {
    throw new OrchestratorGraphError(
      'ORCH4C_START_END_DIRECTION_INVALID',
      'ORCH-4C Start cannot have incoming edges and End cannot have outgoing edges.'
    );
  }

  const startOut = outgoing.get(String(start.id)) || [];
  const loopOut = outgoing.get(String(loop.id)) || [];
  const bodyOut = outgoing.get(String(bodyPlugin.id)) || [];
  if (startOut.length !== 1 || bodyOut.length !== 1 || loopOut.length !== 2) {
    throw new OrchestratorGraphError(
      'ORCH4C_REPEAT_UNTIL_WIRING_INVALID',
      'ORCH-4C requires Start -> Repeat Until, Repeat Until Body -> plugin -> Repeat Until, and Repeat Until Done -> End.'
    );
  }

  const startConnection = startOut[0];
  const bodyConnection = loopOut.find((connection) => String(connection?.sourcePort || '').trim() === 'body');
  const doneConnection = loopOut.find((connection) => String(connection?.sourcePort || '').trim() === 'done');
  const backConnection = bodyOut[0];

  const valid =
    String(startConnection.targetId) === String(loop.id) &&
    !String(startConnection?.sourcePort || '').trim() &&
    bodyConnection && String(bodyConnection.targetId) === String(bodyPlugin.id) &&
    doneConnection && String(doneConnection.targetId) === String(end.id) &&
    String(backConnection.targetId) === String(loop.id) &&
    !String(backConnection?.sourcePort || '').trim();

  if (!valid) {
    throw new OrchestratorGraphError(
      'ORCH4C_REPEAT_UNTIL_WIRING_INVALID',
      'ORCH-4C requires the exact controlled cycle Start -> Repeat Until [Body] -> one plugin -> Repeat Until, plus Repeat Until [Done] -> End.'
    );
  }

  const loopIncoming = incoming.get(String(loop.id)) || [];
  const bodyIncoming = incoming.get(String(bodyPlugin.id)) || [];
  const endIncoming = incoming.get(String(end.id)) || [];
  if (
    loopIncoming.length !== 2 ||
    bodyIncoming.length !== 1 ||
    endIncoming.length !== 1 ||
    !loopIncoming.some((connection) => String(connection.sourceId) === String(start.id)) ||
    !loopIncoming.some((connection) => String(connection.sourceId) === String(bodyPlugin.id)) ||
    String(bodyIncoming[0].sourceId) !== String(loop.id) ||
    String(endIncoming[0].sourceId) !== String(loop.id)
  ) {
    throw new OrchestratorGraphError(
      'ORCH4C_REPEAT_UNTIL_WIRING_INVALID',
      'ORCH-4C Repeat Until edges are not connected to the expected Start/Body/Done nodes.'
    );
  }

  return {
    actions,
    connections,
    byId,
    outgoing,
    incoming,
    start,
    end,
    loop,
    bodyPlugin,
    startConnection,
    bodyConnection,
    backConnection,
    doneConnection,
  };
}


/**
 * ORCH-4D validator: first server-side Break cutover.
 *
 * Scope is intentionally narrow and deterministic:
 *   Start -> For Each
 *              [Body] -> Break
 *              [Done] -> End
 *
 * Break has no properties and no outgoing edge. It exits the innermost active
 * loop immediately and the orchestrator continues from that loop's Done path.
 */
function assertOrch4DBreakWorkflow(workflow) {
  const actions = asArray(workflow?.actions);
  const connections = asArray(workflow?.connections).filter(
    (connection) => connection?.isDisabled !== true
  );

  if (actions.length !== 4) {
    throw new OrchestratorGraphError(
      'ORCH4D_BREAK_SHAPE_REQUIRED',
      `ORCH-4D accepts exactly 4 nodes (Start -> For Each [Body] -> Break / [Done] -> End); found ${actions.length}.`
    );
  }

  const disabled = actions.find((action) => action?.disabled === true);
  if (disabled) {
    throw new OrchestratorGraphError(
      'ORCH4D_DISABLED_NODE_UNSUPPORTED',
      `ORCH-4D does not execute disabled nodes. Node '${disabled.name || disabled.id}' is disabled.`
    );
  }

  const starts = actions.filter(isStart);
  const ends = actions.filter(isEnd);
  const forEachNodes = actions.filter(
    (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-for-each'
  );
  const breakNodes = actions.filter(
    (action) => String(action?.type || '').trim().toLowerCase() === 'workflow-break'
  );
  const unsupportedControls = actions.filter((action) => {
    const type = String(action?.type || '').trim().toLowerCase();
    return type.startsWith('workflow-') &&
      type !== 'workflow-start' &&
      type !== 'workflow-end' &&
      type !== 'workflow-for-each' &&
      type !== 'workflow-break';
  });

  if (unsupportedControls.length > 0) {
    throw new OrchestratorGraphError(
      'ORCH4D_BREAK_FOREACH_ONLY',
      `ORCH-4D certifies Break inside For Each first. Unsupported control node(s): ${unsupportedControls.map((node) => node.name || node.id).join(', ')}.`
    );
  }

  if (starts.length !== 1 || ends.length !== 1 || forEachNodes.length !== 1 || breakNodes.length !== 1) {
    throw new OrchestratorGraphError(
      'ORCH4D_START_FOREACH_BREAK_END_REQUIRED',
      `ORCH-4D requires exactly one Start, one For Each, one Break and one End (found Start=${starts.length}, ForEach=${forEachNodes.length}, Break=${breakNodes.length}, End=${ends.length}).`
    );
  }

  if (connections.length !== 3) {
    throw new OrchestratorGraphError(
      'ORCH4D_CONNECTION_COUNT_INVALID',
      `ORCH-4D requires exactly 3 active connections; found ${connections.length}.`
    );
  }

  const start = starts[0];
  const end = ends[0];
  const loop = forEachNodes[0];
  const breakAction = breakNodes[0];

  const byId = new Map(actions.map((action) => [String(action.id), action]));
  const outgoing = new Map();
  const incoming = new Map();

  for (const connection of connections) {
    const sourceId = String(connection?.sourceId || '');
    const targetId = String(connection?.targetId || '');
    if (!byId.has(sourceId) || !byId.has(targetId)) {
      throw new OrchestratorGraphError(
        'ORCH4D_DANGLING_CONNECTION',
        `Connection '${connection?.id || 'unknown'}' references a missing node.`
      );
    }
    if (String(connection?.condition || '').trim() || String(connection?.targetPort || '').trim()) {
      throw new OrchestratorGraphError(
        'ORCH4D_CONDITIONAL_ROUTING_DEFERRED',
        'ORCH-4D Break certification does not combine loop edges with conditions/target ports yet.'
      );
    }
    if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
    if (!incoming.has(targetId)) incoming.set(targetId, []);
    outgoing.get(sourceId).push(connection);
    incoming.get(targetId).push(connection);
  }

  if (incoming.has(String(start.id)) || outgoing.has(String(end.id))) {
    throw new OrchestratorGraphError(
      'ORCH4D_START_END_DIRECTION_INVALID',
      'ORCH-4D Start cannot have incoming edges and End cannot have outgoing edges.'
    );
  }

  if ((outgoing.get(String(breakAction.id)) || []).length !== 0) {
    throw new OrchestratorGraphError(
      'ORCH4D_BREAK_OUTGOING_INVALID',
      'ORCH-4D Break must not have an outgoing edge; it resumes from the active loop Done path.'
    );
  }

  const startOut = outgoing.get(String(start.id)) || [];
  const loopOut = outgoing.get(String(loop.id)) || [];
  if (startOut.length !== 1 || loopOut.length !== 2) {
    throw new OrchestratorGraphError(
      'ORCH4D_BREAK_WIRING_INVALID',
      'ORCH-4D requires Start -> For Each, For Each Body -> Break, and For Each Done -> End.'
    );
  }

  const startConnection = startOut[0];
  const bodyConnection = loopOut.find(
    (connection) => String(connection?.sourcePort || '').trim() === 'body'
  );
  const doneConnection = loopOut.find(
    (connection) => String(connection?.sourcePort || '').trim() === 'done'
  );

  const valid =
    String(startConnection.targetId) === String(loop.id) &&
    !String(startConnection?.sourcePort || '').trim() &&
    bodyConnection &&
    String(bodyConnection.targetId) === String(breakAction.id) &&
    doneConnection &&
    String(doneConnection.targetId) === String(end.id);

  if (!valid) {
    throw new OrchestratorGraphError(
      'ORCH4D_BREAK_WIRING_INVALID',
      'ORCH-4D requires the exact graph Start -> For Each [Body] -> Break, plus For Each [Done] -> End.'
    );
  }

  const loopIncoming = incoming.get(String(loop.id)) || [];
  const breakIncoming = incoming.get(String(breakAction.id)) || [];
  const endIncoming = incoming.get(String(end.id)) || [];

  if (
    loopIncoming.length !== 1 ||
    breakIncoming.length !== 1 ||
    endIncoming.length !== 1 ||
    String(loopIncoming[0].sourceId) !== String(start.id) ||
    String(breakIncoming[0].sourceId) !== String(loop.id) ||
    String(endIncoming[0].sourceId) !== String(loop.id)
  ) {
    throw new OrchestratorGraphError(
      'ORCH4D_BREAK_WIRING_INVALID',
      'ORCH-4D Break edges are not connected to the expected Start/Body/Done nodes.'
    );
  }

  return {
    actions,
    connections,
    byId,
    outgoing,
    incoming,
    start,
    end,
    loop,
    breakAction,
    startConnection,
    bodyConnection,
    doneConnection,
  };
}

function hasOrch4LoopControls(workflow) {
  return asArray(workflow?.actions).some((action) => {
    const type = String(action?.type || '').trim().toLowerCase();
    return type === 'workflow-for-each' ||
      type === 'workflow-while' ||
      type === 'workflow-repeat-until' ||
      type === 'workflow-break' ||
      type === 'workflow-continue';
  });
}

module.exports = {
  OrchestratorGraphError,
  assertOrch1LinearWorkflow,
  assertOrch2LinearWorkflow,
  assertOrch3Workflow,
  hasOrch3RoutingFeatures,
  assertOrch4AForEachWorkflow,
  assertOrch4BWhileWorkflow,
  assertOrch4CRepeatUntilWorkflow,
  assertOrch4DBreakWorkflow,
  hasOrch4LoopControls,
};
