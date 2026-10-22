/**
 * Controlled PostgreSQL Binding Picker cutover.
 *
 * PostgreSQL becomes the primary source for persisted workflow-step outputs,
 * while local-only groups (variables, previous-step shortcuts, runtime values
 * and declared schemas for steps that have not run) remain available. Any
 * legacy step token that is not present in PostgreSQL is retained in a
 * collapsed compatibility group, so existing expressions never disappear from
 * the picker during cutover.
 */

import type { BindingSource, BindingSourceGroup } from '../types/workflow';
import type { OutputSourceCoverage } from './outputSourceApi';
import type { OutputSourceModeState } from './outputSourceMode';

export type VisibleOutputSource = 'legacy' | 'postgres' | 'legacy-fallback';

export interface OutputSourceCutoverInput {
  mode: OutputSourceModeState;
  legacyGroups: BindingSourceGroup[];
  postgresGroups?: BindingSourceGroup[] | null;
  coverage?: OutputSourceCoverage | null;
  runMatches?: boolean;
  targetMatches?: boolean;
  loading?: boolean;
  error?: string | null;
}

export interface OutputSourceCutoverResult {
  groups: BindingSourceGroup[];
  source: VisibleOutputSource;
  reason:
    | 'legacy-mode'
    | 'shadow-mode'
    | 'loading'
    | 'api-error'
    | 'run-mismatch'
    | 'target-mismatch'
    | 'incomplete-coverage'
    | 'postgres-active';
  metrics: {
    legacyTokens: number;
    postgresTokens: number;
    visibleTokens: number;
    compatibilityAliases: number;
    duplicateTokensRemoved: number;
  };
}

const POSTGRES_REPLACED_GROUPS = new Set(['steps', 'technical']);

function tokenOf(source: BindingSource): string {
  return String(source.token || '').trim();
}

function countTokens(groups: BindingSourceGroup[]): number {
  return new Set(groups.flatMap((group) => group.sources.map(tokenOf)).filter(Boolean)).size;
}

function dedupeSources(sources: BindingSource[]): {
  sources: BindingSource[];
  removed: number;
} {
  const seen = new Set<string>();
  const result: BindingSource[] = [];
  let removed = 0;
  for (const source of sources) {
    const token = tokenOf(source);
    const identity = token || String(source.path || '').trim();
    if (!identity || seen.has(identity)) {
      removed += 1;
      continue;
    }
    seen.add(identity);
    result.push(source);
  }
  return { sources: result, removed };
}

function dedupeGroups(groups: BindingSourceGroup[]): {
  groups: BindingSourceGroup[];
  removed: number;
} {
  const seen = new Set<string>();
  let removed = 0;
  const result = groups
    .map((group) => {
      const sources: BindingSource[] = [];
      for (const source of group.sources) {
        const token = tokenOf(source);
        const identity = token || String(source.path || '').trim();
        if (!identity || seen.has(identity)) {
          removed += 1;
          continue;
        }
        seen.add(identity);
        sources.push(source);
      }
      return { ...group, sources };
    })
    .filter((group) => group.sources.length > 0);
  return { groups: result, removed };
}

function fallback(
  input: OutputSourceCutoverInput,
  reason: OutputSourceCutoverResult['reason']
): OutputSourceCutoverResult {
  const deduped = dedupeGroups(input.legacyGroups);
  return {
    groups: deduped.groups,
    source: reason === 'legacy-mode' || reason === 'shadow-mode' ? 'legacy' : 'legacy-fallback',
    reason,
    metrics: {
      legacyTokens: countTokens(input.legacyGroups),
      postgresTokens: countTokens(input.postgresGroups ?? []),
      visibleTokens: countTokens(deduped.groups),
      compatibilityAliases: 0,
      duplicateTokensRemoved: deduped.removed,
    },
  };
}

function legacyCompatibilitySources(
  legacyGroups: BindingSourceGroup[],
  postgresGroups: BindingSourceGroup[]
): BindingSource[] {
  const postgresTokens = new Set(
    postgresGroups.flatMap((group) => group.sources.map(tokenOf)).filter(Boolean)
  );
  const candidates = legacyGroups
    .filter((group) => POSTGRES_REPLACED_GROUPS.has(group.id))
    .flatMap((group) => group.sources)
    .filter((source) => {
      const token = tokenOf(source);
      return Boolean(token) && !postgresTokens.has(token);
    })
    .map((source) => ({
      ...source,
      label: `${source.label} · legacy alias`,
      description:
        `Compatibility alias retained during PostgreSQL cutover. ${source.description || ''}`.trim(),
    }));
  return dedupeSources(candidates).sources;
}

function orderedGroups(
  legacyGroups: BindingSourceGroup[],
  postgresGroups: BindingSourceGroup[],
  compatibilitySources: BindingSource[]
): BindingSourceGroup[] {
  const postgresSteps = postgresGroups.find((group) => group.id === 'steps');
  const postgresTechnical = postgresGroups.find((group) => group.id === 'technical');
  const localBeforeSteps = legacyGroups.filter((group) =>
    ['variables', 'previous'].includes(group.id)
  );
  const declared = legacyGroups.filter((group) => group.id.startsWith('declared:'));
  const localRuntime = legacyGroups.filter((group) => group.id === 'runtime');
  const otherLocal = legacyGroups.filter((group) =>
    !POSTGRES_REPLACED_GROUPS.has(group.id) &&
    !group.id.startsWith('declared:') &&
    !['variables', 'previous', 'runtime'].includes(group.id)
  );

  const result: BindingSourceGroup[] = [
    ...localBeforeSteps,
    ...(postgresSteps ? [{
      ...postgresSteps,
      label: 'Workflow Steps',
      description: 'PostgreSQL-indexed outputs from the persisted workflow run.',
    }] : []),
    ...declared,
    ...localRuntime,
    ...otherLocal,
    ...(postgresTechnical ? [{
      ...postgresTechnical,
      label: 'Technical Details',
      isTechnical: true,
      defaultCollapsed: true,
    }] : []),
  ];

  if (compatibilitySources.length > 0) {
    result.push({
      id: 'legacy-compatibility',
      label: 'Compatibility Aliases',
      icon: 'History',
      description:
        'Older binding paths preserved so existing workflow expressions remain selectable.',
      defaultCollapsed: true,
      sources: compatibilitySources,
    });
  }
  return result;
}

/**
 * Select the visible Binding Picker catalogue for the configured mode.
 * PostgreSQL is activated only with complete node coverage and a response that
 * belongs to the current run and selected target. Every failure condition
 * falls back to the certified legacy catalogue.
 */
export function resolveVisibleOutputSourceCatalogue(
  input: OutputSourceCutoverInput
): OutputSourceCutoverResult {
  if (input.mode.effective === 'legacy') return fallback(input, 'legacy-mode');
  if (input.mode.effective === 'shadow') return fallback(input, 'shadow-mode');
  if (input.loading) return fallback(input, 'loading');
  if (input.error) return fallback(input, 'api-error');
  if (input.runMatches === false) return fallback(input, 'run-mismatch');
  if (input.targetMatches === false) return fallback(input, 'target-mismatch');
  if (!input.postgresGroups || !input.coverage) return fallback(input, 'loading');
  if (!input.coverage.complete || input.coverage.missingIndexedNodes > 0) {
    return fallback(input, 'incomplete-coverage');
  }

  const compatibilitySources = legacyCompatibilitySources(
    input.legacyGroups,
    input.postgresGroups
  );
  const composed = orderedGroups(
    input.legacyGroups,
    input.postgresGroups,
    compatibilitySources
  );
  const deduped = dedupeGroups(composed);

  return {
    groups: deduped.groups,
    source: 'postgres',
    reason: 'postgres-active',
    metrics: {
      legacyTokens: countTokens(input.legacyGroups),
      postgresTokens: countTokens(input.postgresGroups),
      visibleTokens: countTokens(deduped.groups),
      compatibilityAliases: compatibilitySources.length,
      duplicateTokensRemoved: deduped.removed,
    },
  };
}
