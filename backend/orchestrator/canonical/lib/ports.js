'use strict';

/**
 * Runtime port-routing parity copied from the certified frontend src/lib/ports.ts.
 * Compatibility rule: an edge with no sourcePort receives the full output.
 */

const { unwrapEnvelope } = require('./carryForward');
const { isPlainObject } = require('./objectUtils');
const { extractDataSetView } = require('./dataset');

function getOutputPorts(action) {
  const ports = action?.outputPorts;
  if (!Array.isArray(ports) || ports.length === 0) return [];
  return ports.filter((port) => Boolean(port && typeof port.id === 'string' && port.id));
}

function hasDeclaredPorts(action) {
  return getOutputPorts(action).length > 0;
}

function findPort(action, portId) {
  if (!portId) return undefined;
  return getOutputPorts(action).find((port) => port.id === portId);
}

function getPrimaryPort(action) {
  const ports = getOutputPorts(action);
  if (ports.length === 0) return undefined;
  return ports.find((port) => port.isDefault) ?? ports[0];
}

function resolveConnectionPort(action, connection) {
  const portId = connection?.sourcePort?.trim();
  if (!portId) return undefined;
  return findPort(action, portId);
}

function readPath(source, path) {
  if (!path) return source;
  let cursor = source;
  for (const segment of path.split('.')) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function selectPortPayload(output, port) {
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

function countPortRecords(value) {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;

  const view = extractDataSetView(value);
  if (view) {
    if (typeof view.rowCount === 'number') return view.rowCount;
    if (Array.isArray(view.rows)) return view.rows.length;
  }

  if (isPlainObject(value)) {
    const rows = value.rows ?? value.data;
    if (Array.isArray(rows)) return rows.length;
    if (typeof value.rowCount === 'number') return value.rowCount;
    return null;
  }

  return null;
}

function routeConnection(action, connection, output) {
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
  const forceRoute = connection?.metadata?.routeWhenEmpty === true;
  const skipped = port.skipWhenEmpty === true && recordCount === 0 && !forceRoute;

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

function summarisePorts(action, output) {
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

module.exports = {
  getOutputPorts,
  hasDeclaredPorts,
  findPort,
  getPrimaryPort,
  resolveConnectionPort,
  selectPortPayload,
  countPortRecords,
  routeConnection,
  summarisePorts,
};
