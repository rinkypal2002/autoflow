'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArguments(argv) {
  return {
    apply: argv.includes('--apply'),
  };
}

function safeTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
}

function replaceRequired(text, search, replacement, label) {
  if (!text.includes(search)) {
    throw new Error(
      `Cannot patch ${label}: expected anchor was not found.`
    );
  }

  return text.replace(search, replacement);
}

function patchConfig(original) {
  if (
    original.includes('EXECUTION_PERSISTENCE_MODE:') &&
    original.includes('DATABASE_EXECUTION_WRITE_ENABLED:')
  ) {
    return original;
  }

  const anchor =
    "  DB_WORKSPACE_KEY: process.env.DB_WORKSPACE_KEY || 'default',\n";

  const addition = `${anchor}
  // ── Execution-history persistence rollout ───────────────────────────────
  // Independent from workspace-design persistence so run APIs can be rolled
  // back to .runs without changing PostgreSQL workflow CRUD.
  EXECUTION_PERSISTENCE_MODE: ['filesystem', 'postgres'].includes(
    String(process.env.EXECUTION_PERSISTENCE_MODE || 'filesystem').toLowerCase()
  )
    ? String(
        process.env.EXECUTION_PERSISTENCE_MODE || 'filesystem'
      ).toLowerCase()
    : 'filesystem',
  DATABASE_EXECUTION_WRITE_ENABLED: asBool(
    process.env.DATABASE_EXECUTION_WRITE_ENABLED,
    false
  ),
  EXECUTION_RETENTION_DAYS: Math.max(
    0,
    Number(process.env.EXECUTION_RETENTION_DAYS) || 30
  ),
  EXECUTION_MAX_BYTES: Math.max(
    1024,
    Number(process.env.EXECUTION_MAX_BYTES) || 8 * 1024 * 1024
  ),
  EXECUTION_LIST_LIMIT: Math.min(
    200,
    Math.max(1, Number(process.env.EXECUTION_LIST_LIMIT) || 25)
  ),
`;

  return replaceRequired(
    original,
    anchor,
    addition,
    'backend/config.js'
  );
}

function patchServer(original) {
  let text = original;

  const importBlock = `const {
  createPostgresWorkspaceCompatibilityRouter,
} = require('./routes/postgresWorkspaceCompatibilityRoutes');
`;

  const executionImport = `const {
  createPostgresExecutionRunRouter,
} = require('./routes/postgresExecutionRunRoutes');
`;

  if (!text.includes("require('./routes/postgresExecutionRunRoutes')")) {
    text = replaceRequired(
      text,
      importBlock,
      `${importBlock}${executionImport}`,
      'server execution-route import'
    );
  }

  const primaryComment = `// Primary cutover router. It is mounted before the legacy filesystem routes,
`;

  const executionMount = `// Independent execution-history cutover. This router is mounted before both
// PostgreSQL workspace CRUD and legacy filesystem run routes, so matching
// /workflows/:id/runs requests use PostgreSQL while all other routes continue
// through their existing handlers.
if (
  cfg.PERSISTENCE_MODE === 'postgres' &&
  cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'
) {
  app.use(
    '/api/workspace',
    createPostgresExecutionRunRouter({
      workspaceKey: cfg.DB_WORKSPACE_KEY,
      writesEnabled: cfg.DATABASE_EXECUTION_WRITE_ENABLED,
      retentionDays: cfg.EXECUTION_RETENTION_DAYS,
      maxBytes: cfg.EXECUTION_MAX_BYTES,
      listLimit: cfg.EXECUTION_LIST_LIMIT,
    })
  );
}

`;

  if (!text.includes('createPostgresExecutionRunRouter({')) {
    text = replaceRequired(
      text,
      primaryComment,
      `${executionMount}${primaryComment}`,
      'server execution-router mount'
    );
  }

  const healthAnchor =
    '    databasePrimaryWriteEnabled: cfg.DATABASE_PRIMARY_WRITE_ENABLED,\n';

  const healthReplacement = `${healthAnchor}    executionPersistenceMode:\n      cfg.PERSISTENCE_MODE === 'postgres'\n        ? cfg.EXECUTION_PERSISTENCE_MODE\n        : 'filesystem',\n    databaseExecutionWriteEnabled:\n      cfg.PERSISTENCE_MODE === 'postgres' &&\n      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'\n        ? cfg.DATABASE_EXECUTION_WRITE_ENABLED\n        : false,\n`;

  if (!text.includes('executionPersistenceMode:')) {
    text = replaceRequired(
      text,
      healthAnchor,
      healthReplacement,
      'server health response'
    );
  }

  const startupAnchor =
    '    console.log(`💾 Workspace persistence: ${cfg.PERSISTENCE_MODE}`);\n';

  const startupReplacement = `${startupAnchor}    console.log(\n      \`📚 Execution persistence: \${\n        cfg.PERSISTENCE_MODE === 'postgres'\n          ? cfg.EXECUTION_PERSISTENCE_MODE\n          : 'filesystem'\n      }\`\n    );\n    if (\n      cfg.PERSISTENCE_MODE === 'postgres' &&\n      cfg.EXECUTION_PERSISTENCE_MODE === 'postgres'\n    ) {\n      console.log(\n        \`✍️  PostgreSQL execution writes: \${\n          cfg.DATABASE_EXECUTION_WRITE_ENABLED ? 'ENABLED' : 'DISABLED'\n        }\`\n      );\n    }\n`;

  if (!text.includes('PostgreSQL execution writes:')) {
    text = replaceRequired(
      text,
      startupAnchor,
      startupReplacement,
      'server startup logging'
    );
  }

  return text;
}

function syntaxCheck(filePath) {
  const result = spawnSync(
    process.execPath,
    ['--check', filePath],
    {
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Syntax check failed for '${filePath}':\n` +
        (result.stderr || result.stdout)
    );
  }
}

async function writeAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath, path.extname(filePath));
  const temporaryPath = path.join(
    directory,
    `${fileName}.step6b3-${process.pid}-${Date.now()}.tmp.js`
  );

  try {
    await fsp.writeFile(
      temporaryPath,
      content,
      'utf8'
    );

    // Node.js 24 determines syntax-check format from the extension.
    // Keep the temporary file extension as .js so `node --check` works.
    syntaxCheck(temporaryPath);

    await fsp.rename(
      temporaryPath,
      filePath
    );
  } catch (error) {
    await fsp.rm(
      temporaryPath,
      {
        force: true,
      }
    );

    throw error;
  }
}

async function main() {
  const args = parseArguments(
    process.argv.slice(2)
  );

  const backendDir = path.resolve(
    __dirname,
    '..'
  );
  const serverPath = path.join(
    backendDir,
    'server.js'
  );
  const configPath = path.join(
    backendDir,
    'config.js'
  );

  console.log('============================================================');
  console.log(' AutoFlow Step 6B.3 Server Patch');
  console.log('============================================================');
  console.log(
    `Mode                       : ${args.apply ? 'APPLY' : 'DRY RUN'}`
  );
  console.log(
    `Server                     : ${serverPath}`
  );
  console.log(
    `Config                     : ${configPath}`
  );

  const originalServer =
    await fsp.readFile(
      serverPath,
      'utf8'
    );
  const originalConfig =
    await fsp.readFile(
      configPath,
      'utf8'
    );

  const updatedServer =
    patchServer(originalServer);
  const updatedConfig =
    patchConfig(originalConfig);

  const serverChanged =
    updatedServer !== originalServer;
  const configChanged =
    updatedConfig !== originalConfig;

  console.log('');
  console.log(
    `server.js change required  : ${serverChanged ? 'YES' : 'NO'}`
  );
  console.log(
    `config.js change required  : ${configChanged ? 'YES' : 'NO'}`
  );

  if (!serverChanged && !configChanged) {
    syntaxCheck(serverPath);
    syntaxCheck(configPath);

    console.log('');
    console.log(
      'RESULT                     : STEP 6B.3 SERVER PATCH ALREADY APPLIED'
    );
    return;
  }

  if (!args.apply) {
    console.log('');
    console.log(
      'Filesystem changes         : NONE'
    );
    console.log(
      'RESULT                     : STEP 6B.3 SERVER PATCH DRY RUN PASSED'
    );
    return;
  }

  const backupDirectory = path.join(
    backendDir,
    'migration_backups',
    `step6b3-server-patch-${safeTimestamp()}`
  );

  await fsp.mkdir(
    backupDirectory,
    {
      recursive: true,
    }
  );

  await fsp.copyFile(
    serverPath,
    path.join(
      backupDirectory,
      'server.js'
    )
  );
  await fsp.copyFile(
    configPath,
    path.join(
      backupDirectory,
      'config.js'
    )
  );

  if (serverChanged) {
    await writeAtomic(
      serverPath,
      updatedServer
    );
  }

  if (configChanged) {
    await writeAtomic(
      configPath,
      updatedConfig
    );
  }

  syntaxCheck(serverPath);
  syntaxCheck(configPath);

  console.log('');
  console.log(
    `Backup                     : ${backupDirectory}`
  );
  console.log(
    'server.js syntax           : PASS'
  );
  console.log(
    'config.js syntax           : PASS'
  );
  console.log(
    'RESULT                     : STEP 6B.3 SERVER PATCH APPLIED'
  );
}

main().catch((error) => {
  console.error('');
  console.error(
    'RESULT                     : STEP 6B.3 SERVER PATCH FAILED'
  );
  console.error(
    error.stack || error.message
  );
  process.exitCode = 1;
});
