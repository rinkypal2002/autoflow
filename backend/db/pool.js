'use strict';

require('dotenv').config();

const { Pool } = require('pg');

function readPositiveInteger(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function readBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw).trim().toLowerCase() === 'true';
}

const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: readPositiveInteger('DB_PORT', 5432),
  database: process.env.DB_NAME || 'autoflow',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  application_name:
    process.env.DB_APPLICATION_NAME || 'autoflow-workspace-api-v1.1',
  max: readPositiveInteger('DB_POOL_MAX', 10),
  idleTimeoutMillis: readPositiveInteger('DB_IDLE_TIMEOUT_MS', 30000),
  connectionTimeoutMillis: readPositiveInteger(
    'DB_CONNECTION_TIMEOUT_MS',
    5000
  ),
  allowExitOnIdle: true,
};

if (readBoolean('DB_SSL', false)) {
  databaseConfig.ssl = {
    rejectUnauthorized: readBoolean('DB_SSL_REJECT_UNAUTHORIZED', true),
  };
}

const pool = new Pool(databaseConfig);

pool.on('error', (error) => {
  console.error('[database] Unexpected idle PostgreSQL client error:', error);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  if (typeof work !== 'function') {
    throw new TypeError('withTransaction requires a function.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[database] PostgreSQL rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  withTransaction,
  closePool,
};
