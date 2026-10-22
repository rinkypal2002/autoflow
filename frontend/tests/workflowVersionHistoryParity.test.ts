import {
  clearWorkflowVersionHistoryCache,
  loadWorkflowVersionHistory,
  type WorkflowVersionHistoryApiResponse,
} from '../src/lib/workflowVersionHistoryApi';
import {
  compareWorkflowVersionHistories,
  createWorkflowVersionHistoryShadowFailure,
  persistWorkflowVersionHistoryShadowReport,
  workflowVersionDefinitionFingerprint,
} from '../src/lib/workflowVersionHistoryParity';
import {
  resolveWorkflowVersionHistoryMode,
} from '../src/lib/workflowVersionHistoryMode';
import type { WorkflowVersion } from '../src/lib/workflowVersioning';

let passed = 0;
let failed = 0;
function check(condition: unknown, message: string): void {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${message}`);
  }
}

function version(input: Partial<WorkflowVersion> & { id: string; version: string }): WorkflowVersion {
  return {
    id: input.id,
    workflowId: 'workflow-1',
    version: input.version,
    label: input.label ?? `Version ${input.version}`,
    savedAt: input.savedAt ?? '2026-08-04T10:00:00.000Z',
    savedBy: input.savedBy ?? 'tester',
    auto: input.auto ?? false,
    state: input.state ?? {
      name: 'Workflow One',
      actions: [
        {
          id: 'node-1',
          name: 'Node One',
          type: 'test',
          category: 'test',
          status: 'completed',
          executionTime: 99,
          properties: { password: 'local-secret', value: 'same' },
        } as any,
      ],
      connections: [],
      variables: [
        { id: 'secret-1', name: 'PASSWORD', type: 'string', value: 'local-secret', isSecret: true },
      ],
    },
    stats: input.stats ?? { actions: 1, connections: 0, variables: 1 },
  };
}

function apiResponse(): WorkflowVersionHistoryApiResponse {
  const postgres = version({
    id: 'pg-1',
    version: '322',
    label: 'Database save v322',
    state: {
      name: 'Workflow One',
      actions: [
        {
          id: 'node-1',
          name: 'Node One',
          type: 'test',
          category: 'test',
          status: 'idle',
          executionTime: 5,
          properties: { password: '[REDACTED]', value: 'same' },
        } as any,
      ],
      connections: [],
      variables: [
        {
          id: 'secret-1',
          name: 'PASSWORD',
          type: 'string',
          isSecret: true,
          secretValueRedacted: true,
          credentialReferenceRequired: true,
        } as any,
      ],
    },
  }) as any;
  postgres.versionNumber = 322;
  postgres.versionLabel = 'v322';
  postgres.source = 'postgres';
  postgres.sourceType = 'MANUAL';
  postgres.definitionSchemaVersion = 1;
  postgres.isPublished = false;
  postgres.isCurrent = true;
  postgres.restorable = true;
  postgres.comparisonFingerprint = workflowVersionDefinitionFingerprint(postgres);
  delete postgres.state;

  return {
    status: 'success',
    source: 'postgres',
    table: 'autoflow.workflow_version',
    readOnly: true,
    restoreEnabled: false,
    workflowId: 'workflow-1',
    workflowName: 'Workflow One',
    currentVersionNumber: 322,
    query: {
      includeDefinition: false,
      search: '',
      sourceType: '',
      limit: 100,
      offset: 0,
    },
    coverage: { totalVersions: 1, returnedVersions: 1, hasMore: false },
    versions: [postgres],
  };
}

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  get length(): number { return this.values.size; }
}

async function main(): Promise<void> {
  const legacy = resolveWorkflowVersionHistoryMode('legacy');
  const shadow = resolveWorkflowVersionHistoryMode('shadow');
  const postgres = resolveWorkflowVersionHistoryMode('postgres');
  check(legacy.effective === 'legacy', 'legacy remains legacy');
  check(shadow.effective === 'shadow', 'shadow remains shadow');
  check(postgres.effective === 'shadow', 'postgres cutover is blocked');
  check(postgres.cutoverBlocked === true, 'blocked mode is reported');

  let legacyCalls = 0;
  const skipped = await loadWorkflowVersionHistory({
    mode: 'legacy',
    workflowId: 'workflow-1',
    fetchImpl: (async () => {
      legacyCalls += 1;
      return new Response();
    }) as typeof fetch,
  });
  check(skipped.status === 'skipped', 'legacy mode skips PostgreSQL');
  check(legacyCalls === 0, 'legacy mode makes zero network calls');

  clearWorkflowVersionHistoryCache();
  let shadowCalls = 0;
  const fetchImpl = (async () => {
    shadowCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify(apiResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const [loadedA, loadedB] = await Promise.all([
    loadWorkflowVersionHistory({ mode: 'shadow', workflowId: 'workflow-1', fetchImpl }),
    loadWorkflowVersionHistory({ mode: 'shadow', workflowId: 'workflow-1', fetchImpl }),
  ]);
  check(shadowCalls === 1, 'in-flight shadow requests are deduplicated');
  check(loadedA.status === 'loaded', 'first shadow load succeeds');
  check(loadedB.status === 'loaded', 'second shadow load succeeds');
  check(loadedA.status === 'loaded' && loadedA.response.versions.length === 1, 'version summaries are returned');
  check(loadedB.status === 'loaded' && loadedB.cacheHit === true, 'second caller uses shared cache');
  check(
    loadedA.status === 'loaded' && loadedA.response.query.includeDefinition === false,
    'shadow list uses summary-only payloads'
  );
  check(
    loadedA.status === 'loaded' && loadedA.response.versions[0].state === undefined,
    'full definitions are not transferred in the history list'
  );

  const local = version({ id: 'local-1', version: '40', label: 'Saved' });
  const pg = apiResponse().versions[0];
  check(
    workflowVersionDefinitionFingerprint(local) === workflowVersionDefinitionFingerprint(pg),
    'runtime and secret differences do not change canonical definition identity'
  );
  const report = compareWorkflowVersionHistories({
    workflowId: 'workflow-1',
    mode: shadow,
    localVersions: [local],
    postgresVersions: [pg],
  });
  check(report.summary.localVersions === 1, 'local count recorded');
  check(report.summary.postgresVersions === 1, 'PostgreSQL count recorded');
  check(report.summary.exactDefinitionMatches === 1, 'definition match recorded');
  check(report.summary.currentPostgresDefinitionFoundLocally === true, 'current database definition found locally');
  check(report.summary.newestLocalMatchesCurrentPostgres === true, 'newest local matches current PostgreSQL');
  check(report.visibleHistorySource === 'localStorage', 'visible history stays local');
  check(report.restoreEnabled === false, 'restore remains disabled');
  check(report.verdict === 'CURRENT_DEFINITION_ALIGNED', 'aligned verdict emitted');
  check(JSON.stringify(report).includes('local-secret') === false, 'shadow report contains no secret value');

  const storage = new MemoryStorage() as unknown as Storage;
  persistWorkflowVersionHistoryShadowReport(report, storage);
  check(storage.getItem('autoflow:workflow-version-shadow:last:v1') !== null, 'last report persisted');
  check(storage.getItem('autoflow:workflow-version-shadow:reports:v1') !== null, 'bounded report history persisted');

  const failure = createWorkflowVersionHistoryShadowFailure({
    workflowId: 'workflow-1',
    mode: shadow,
    error: Object.assign(new Error('offline'), { code: 'OFFLINE', status: 503 }),
  });
  check(failure.verdict === 'SHADOW_API_UNAVAILABLE', 'API failures become non-blocking reports');
  check(failure.visibleHistorySource === 'localStorage', 'API failure preserves visible local history');

  if (failed > 0) {
    console.error('Step 7B.6B workflow version-history shadow tests: FAIL');
    console.error(`Assertions passed: ${passed}`);
    console.error(`Assertions failed: ${failed}`);
    process.exitCode = 1;
    return;
  }
  console.log('Step 7B.6B workflow version-history shadow tests: PASS');
  console.log(`Assertions passed: ${passed}`);
  console.log('Assertions failed: 0');
  console.log('Legacy mode network calls: 0');
  console.log('PostgreSQL requests per workflow: cached and in-flight deduplicated');
  console.log('Visible Version History source: localStorage');
  console.log('History list payloads: summary-only');
  console.log('Database restore actions: disabled');
}

main().catch((error) => {
  console.error('Step 7B.6B workflow version-history shadow tests: FAIL');
  console.error(error);
  process.exitCode = 1;
});
