/**
 * Preview-free parity reporting between the certified legacy binding catalogue
 * and PostgreSQL-indexed output sources.
 *
 * Step 7B.5B.1 compares canonical binding identities rather than treating the
 * legacy `path` display alias as authoritative. Existing tokens remain
 * untouched; the report only classifies compatibility.
 */

import type { BindingSource, BindingSourceGroup } from '../types/workflow';
import type { OutputSourceCoverage } from './outputSourceApi';
import type { OutputSourceModeState } from './outputSourceMode';

const STORAGE_KEY = 'autoflow:output-source-shadow:reports:v1';
const LAST_REPORT_KEY = 'autoflow:output-source-shadow:last:v1';
const MAX_STORED_REPORTS = 20;

interface ComparableSource {
  source: BindingSource;
  technical: boolean;
  raw: boolean;
}

export interface OutputSourceTypeMismatch {
  token: string;
  legacyType: string;
  postgresType: string;
}

export interface OutputSourcePathMismatch {
  token: string;
  legacyPath: string;
  postgresPath: string;
}

export interface OutputSourceParityReport {
  schemaVersion: '1.1';
  generatedAt: string;
  workflowId: string;
  runId: string;
  targetNodeId: string | null;
  mode: OutputSourceModeState;
  coverage: Pick<
    OutputSourceCoverage,
    'finalNodes' | 'indexedNodes' | 'missingIndexedNodes' | 'complete' | 'totalMatchingRows'
  >;
  summary: {
    legacyTokens: number;
    postgresTokens: number;
    commonTokens: number;
    missingInPostgres: number;
    additionalInPostgres: number;
    typeMismatches: number;
    pathMismatches: number;
    compatiblePathAliases: number;
    canonicalMatches: number;
    genuineMissingBusinessFields: number;
    missingTechnicalAliases: number;
    additionalPostgresFields: number;
    exactTokenParity: boolean;
    canonicalParity: boolean;
  };
  missingInPostgres: string[];
  additionalInPostgres: string[];
  genuineMissingBusinessFields: string[];
  missingTechnicalAliases: string[];
  compatibleAliases: Array<{ legacyToken: string; postgresToken: string }>;
  typeMismatches: OutputSourceTypeMismatch[];
  pathMismatches: OutputSourcePathMismatch[];
  verdict: 'EXACT_TOKEN_PARITY' | 'CANONICAL_PARITY' | 'DIFFERENCES_RECORDED';
}

export interface OutputSourceShadowFailureReport {
  schemaVersion: '1.1';
  generatedAt: string;
  workflowId: string;
  runId: string;
  targetNodeId: string | null;
  mode: OutputSourceModeState;
  verdict: 'SHADOW_API_UNAVAILABLE';
  error: { name: string; message: string; code?: string; status?: number };
}

export type PersistedOutputSourceShadowReport =
  | OutputSourceParityReport
  | OutputSourceShadowFailureReport;

function isStepSource(source: BindingSource): boolean {
  const token = String(source.token ?? '').trim();
  const path = String(source.path ?? '').trim();
  return token.startsWith('{{steps.') || token.startsWith("{{steps['") ||
    path.startsWith('steps.') || path.startsWith("steps['");
}

function looksRaw(source: BindingSource): boolean {
  const record = source as BindingSource & { fieldKind?: string };
  if (String(record.fieldKind || '').toUpperCase() === 'RAW') return true;
  const text = `${source.label || ''} ${source.description || ''}`.toLowerCase();
  return text.includes('entire output') || text.includes('complete raw output');
}

function comparableSources(groups: BindingSourceGroup[]): ComparableSource[] {
  return groups
    .filter((group) => group.id === 'steps' || group.id === 'technical' || group.isTechnical)
    .flatMap((group) => group.sources.map((source) => ({
      source,
      technical: Boolean(group.id === 'technical' || group.isTechnical),
      raw: looksRaw(source),
    })))
    .filter((entry) => isStepSource(entry.source));
}

function normalizeType(value: string): string {
  const normalized = String(value || 'unknown').trim().toLowerCase();
  if (['integer', 'decimal', 'double', 'float', 'long'].includes(normalized)) return 'number';
  if (['map', 'dataset'].includes(normalized)) return 'object';
  if (normalized === 'binary') return 'file';
  if (normalized === 'null') return 'unknown';
  return normalized;
}

function cleanToken(value: string): string {
  const token = String(value || '').trim();
  return token.startsWith('{{') && token.endsWith('}}')
    ? token.slice(2, -2).trim()
    : token;
}

/** Canonical identity used only for parity classification, never execution. */
function canonicalIdentity(entry: ComparableSource): string {
  let value = cleanToken(entry.source.token || entry.source.path);
  value = value.replace(/\.\$business\./g, '.');
  if (entry.raw && value.endsWith('.output')) value = value.slice(0, -'.output'.length);
  return value;
}

function byToken(entries: ComparableSource[]): Map<string, ComparableSource> {
  const result = new Map<string, ComparableSource>();
  for (const entry of entries) {
    const token = String(entry.source.token ?? '').trim();
    if (token && !result.has(token)) result.set(token, entry);
  }
  return result;
}

function byCanonical(entries: ComparableSource[]): Map<string, ComparableSource[]> {
  const result = new Map<string, ComparableSource[]>();
  for (const entry of entries) {
    const key = canonicalIdentity(entry);
    if (!key) continue;
    const values = result.get(key) ?? [];
    values.push(entry);
    result.set(key, values);
  }
  return result;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function compareOutputSourceCatalogues(input: {
  workflowId: string;
  runId: string;
  targetNodeId?: string | null;
  mode: OutputSourceModeState;
  coverage: OutputSourceCoverage;
  legacyGroups: BindingSourceGroup[];
  postgresGroups: BindingSourceGroup[];
}): OutputSourceParityReport {
  const legacyEntries = comparableSources(input.legacyGroups);
  const postgresEntries = comparableSources(input.postgresGroups);
  const legacy = byToken(legacyEntries);
  const postgres = byToken(postgresEntries);
  const postgresCanonical = byCanonical(postgresEntries);
  const legacyTokens = new Set(legacy.keys());
  const postgresTokens = new Set(postgres.keys());

  const rawMissing = sorted([...legacyTokens].filter((token) => !postgresTokens.has(token)));
  const rawAdditional = sorted([...postgresTokens].filter((token) => !legacyTokens.has(token)));
  const exactCommonTokens = sorted([...legacyTokens].filter((token) => postgresTokens.has(token)));

  const compatibleAliases: Array<{ legacyToken: string; postgresToken: string }> = [];
  const unmatchedLegacy: ComparableSource[] = [];
  const matchedPostgresTokens = new Set(exactCommonTokens);

  for (const token of rawMissing) {
    const legacyEntry = legacy.get(token)!;
    const candidates = postgresCanonical.get(canonicalIdentity(legacyEntry)) ?? [];
    const candidate = candidates.find((entry) => !matchedPostgresTokens.has(entry.source.token));
    if (candidate) {
      compatibleAliases.push({ legacyToken: token, postgresToken: candidate.source.token });
      matchedPostgresTokens.add(candidate.source.token);
    } else {
      unmatchedLegacy.push(legacyEntry);
    }
  }

  const typeMismatches: OutputSourceTypeMismatch[] = [];
  const pathMismatches: OutputSourcePathMismatch[] = [];
  let compatiblePathAliases = 0;

  const comparePair = (legacyEntry: ComparableSource, postgresEntry: ComparableSource): void => {
    const token = legacyEntry.source.token;
    const legacyType = normalizeType(legacyEntry.source.valueType);
    const postgresType = normalizeType(postgresEntry.source.valueType);
    if (legacyType !== postgresType && legacyType !== 'unknown' && postgresType !== 'unknown') {
      typeMismatches.push({ token, legacyType, postgresType });
    }
    const legacyPath = String(legacyEntry.source.path ?? '');
    const postgresPath = String(postgresEntry.source.path ?? '');
    if (legacyPath !== postgresPath) {
      if (canonicalIdentity(legacyEntry) === canonicalIdentity(postgresEntry)) {
        compatiblePathAliases += 1;
      } else {
        pathMismatches.push({ token, legacyPath, postgresPath });
      }
    }
  };

  for (const token of exactCommonTokens) comparePair(legacy.get(token)!, postgres.get(token)!);
  for (const alias of compatibleAliases) {
    comparePair(legacy.get(alias.legacyToken)!, postgres.get(alias.postgresToken)!);
  }

  const genuineMissingBusinessFields = unmatchedLegacy
    .filter((entry) => !entry.technical && !entry.raw)
    .map((entry) => entry.source.token);
  const missingTechnicalAliases = unmatchedLegacy
    .filter((entry) => entry.technical || entry.raw)
    .map((entry) => entry.source.token);
  const additionalInPostgres = rawAdditional.filter((token) => !matchedPostgresTokens.has(token));

  const exactTokenParity = rawMissing.length === 0 && rawAdditional.length === 0;
  const canonicalParity =
    genuineMissingBusinessFields.length === 0 &&
    typeMismatches.length === 0 &&
    pathMismatches.length === 0;

  return {
    schemaVersion: '1.1',
    generatedAt: new Date().toISOString(),
    workflowId: input.workflowId,
    runId: input.runId,
    targetNodeId: input.targetNodeId ?? null,
    mode: input.mode,
    coverage: {
      finalNodes: input.coverage.finalNodes,
      indexedNodes: input.coverage.indexedNodes,
      missingIndexedNodes: input.coverage.missingIndexedNodes,
      complete: input.coverage.complete,
      totalMatchingRows: input.coverage.totalMatchingRows,
    },
    summary: {
      legacyTokens: legacy.size,
      postgresTokens: postgres.size,
      commonTokens: exactCommonTokens.length,
      missingInPostgres: rawMissing.length,
      additionalInPostgres: rawAdditional.length,
      typeMismatches: typeMismatches.length,
      pathMismatches: pathMismatches.length,
      compatiblePathAliases,
      canonicalMatches: exactCommonTokens.length + compatibleAliases.length,
      genuineMissingBusinessFields: genuineMissingBusinessFields.length,
      missingTechnicalAliases: missingTechnicalAliases.length,
      additionalPostgresFields: additionalInPostgres.length,
      exactTokenParity,
      canonicalParity,
    },
    missingInPostgres: rawMissing,
    additionalInPostgres,
    genuineMissingBusinessFields: sorted(genuineMissingBusinessFields),
    missingTechnicalAliases: sorted(missingTechnicalAliases),
    compatibleAliases,
    typeMismatches,
    pathMismatches,
    verdict: exactTokenParity
      ? 'EXACT_TOKEN_PARITY'
      : canonicalParity
        ? 'CANONICAL_PARITY'
        : 'DIFFERENCES_RECORDED',
  };
}

export function createOutputSourceShadowFailure(input: {
  workflowId: string;
  runId: string;
  targetNodeId?: string | null;
  mode: OutputSourceModeState;
  error: unknown;
}): OutputSourceShadowFailureReport {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));
  const record = error as Error & { code?: string; status?: number };
  return {
    schemaVersion: '1.1',
    generatedAt: new Date().toISOString(),
    workflowId: input.workflowId,
    runId: input.runId,
    targetNodeId: input.targetNodeId ?? null,
    mode: input.mode,
    verdict: 'SHADOW_API_UNAVAILABLE',
    error: {
      name: error.name,
      message: error.message,
      code: record.code,
      status: record.status,
    },
  };
}

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean(window.sessionStorage);
  } catch {
    return false;
  }
}

function identity(report: PersistedOutputSourceShadowReport): string {
  return [report.workflowId, report.runId, report.targetNodeId ?? 'all', report.verdict].join(':');
}

export function persistOutputSourceShadowReport(
  report: PersistedOutputSourceShadowReport
): boolean {
  if (!storageAvailable()) return false;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const reports: PersistedOutputSourceShadowReport[] = Array.isArray(parsed) ? parsed : [];
    const reportId = identity(report);
    const withoutSame = reports.filter((candidate) => identity(candidate) !== reportId);
    withoutSame.push(report);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(withoutSame.slice(-MAX_STORED_REPORTS))
    );
    window.sessionStorage.setItem(LAST_REPORT_KEY, JSON.stringify(report));
    return reports.every((candidate) => identity(candidate) !== reportId);
  } catch {
    return false;
  }
}

export function readLatestOutputSourceShadowReport(): PersistedOutputSourceShadowReport | null {
  if (!storageAvailable()) return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_REPORT_KEY);
    return raw ? JSON.parse(raw) as PersistedOutputSourceShadowReport : null;
  } catch {
    return null;
  }
}
