import fs from 'node:fs';
import path from 'node:path';
import { automationCategories } from '../src/data/automationCategories';
import type {
  PluginEndpointMappingReadRecord,
  PluginMappingApiResponse,
} from '../src/lib/pluginMappingApi';
import { comparePluginMappings } from '../src/lib/pluginMappingParity';
import { resolvePluginMappingMode } from '../src/lib/pluginMappingMode';
import {
  buildPluginMappingRemediationReport,
  pluginMappingRemediationToCsv,
  pluginMappingRemediationToMarkdown,
} from '../src/lib/pluginMappingRemediation';

interface CliOptions {
  apiBase: string;
  engineVersion: string;
  outDir: string;
  pageSize: number;
  failOnCritical: boolean;
}

function readOption(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseOptions(args: string[]): CliOptions {
  const pageSize = Number(readOption(args, '--page-size', '500'));
  return {
    apiBase: readOption(args, '--api-base', 'http://localhost:8081/api/plugin-mappings').replace(/\/+$/, ''),
    engineVersion: readOption(args, '--engine-version', 'v11.3'),
    outDir: path.resolve(readOption(args, '--out-dir', 'migration_backups/phase4c2a')),
    pageSize: Number.isInteger(pageSize) && pageSize > 0 ? Math.min(2000, pageSize) : 500,
    failOnCritical: args.includes('--fail-on-critical'),
  };
}

function assertResponse(value: unknown): PluginMappingApiResponse {
  if (!value || typeof value !== 'object') throw new Error('Plugin mapping API returned invalid JSON.');
  const response = value as Partial<PluginMappingApiResponse>;
  if (
    response.status !== 'success' ||
    response.source !== 'postgres' ||
    response.readOnly !== true ||
    response.writeEndpointAvailable !== false ||
    !response.coverage ||
    !Array.isArray(response.mappings)
  ) {
    throw new Error('Plugin mapping API safety/response contract mismatch.');
  }
  return response as PluginMappingApiResponse;
}

async function loadMappings(options: CliOptions): Promise<PluginEndpointMappingReadRecord[]> {
  const values = new Map<string, PluginEndpointMappingReadRecord>();
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(options.apiBase);
    url.searchParams.set('engineVersion', options.engineVersion);
    url.searchParams.set('includeDeprecated', 'false');
    url.searchParams.set('limit', String(options.pageSize));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      throw new Error(String(record.error || `Plugin mapping API failed with HTTP ${response.status}.`));
    }
    const pageResult = assertResponse(body);
    for (const mapping of pageResult.mappings) {
      values.set(`${mapping.engineVersion}::${mapping.pluginId}::${mapping.actionId}`, mapping);
    }
    if (!pageResult.coverage.hasMore || pageResult.coverage.returnedMappings === 0) break;
    offset += pageResult.coverage.returnedMappings;
  }
  return [...values.values()];
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const mappings = await loadMappings(options);
  const mode = resolvePluginMappingMode('shadow');
  const parityReport = comparePluginMappings({
    mode,
    categories: automationCategories,
    mappings,
  });
  const report = buildPluginMappingRemediationReport({
    categories: automationCategories,
    mappings,
    parityReport,
  });

  fs.mkdirSync(options.outDir, { recursive: true });
  const jsonFile = path.join(options.outDir, 'phase4c2a-plugin-mapping-remediation.json');
  const csvFile = path.join(options.outDir, 'phase4c2a-plugin-mapping-remediation.csv');
  const markdownFile = path.join(options.outDir, 'phase4c2a-plugin-mapping-remediation.md');
  fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(csvFile, pluginMappingRemediationToCsv(report), 'utf8');
  fs.writeFileSync(markdownFile, pluginMappingRemediationToMarkdown(report), 'utf8');

  console.log(JSON.stringify({
    status: report.status,
    verdict: report.verdict,
    readOnly: report.readOnly,
    databaseWritesPerformed: report.databaseWritesPerformed,
    visibleCatalogueSource: report.visibleCatalogueSource,
    executionRoutingChanged: report.executionRoutingChanged,
    frontendActions: report.paritySummary.frontendActions,
    frontendExecutableActions: report.paritySummary.frontendExecutableActions,
    frontendUnavailableActions: report.paritySummary.frontendUnavailableActions,
    postgresMappings: report.paritySummary.postgresMappings,
    postgresWorkflowEligibleMappings: report.paritySummary.postgresWorkflowEligibleMappings,
    postgresPolicyExcludedMappings: report.paritySummary.postgresPolicyExcludedMappings,
    summary: report.summary,
    topPriorities: report.priorities.slice(0, 10),
    files: { jsonFile, csvFile, markdownFile },
  }, null, 2));

  if (options.failOnCritical && report.summary.critical > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'failed',
    verdict: 'PLUGIN_MAPPING_REMEDIATION_REPORT_FAILED',
    readOnly: true,
    databaseWritesPerformed: 0,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
