/**
 * Node-level resilience: retries, backoff, timeouts and try / catch / finally.
 *
 * `WorkflowAction` has carried `retries`, `retryDelay`, `timeout` and `onError`
 * since the first schema, but nothing ever read them — a node configured for
 * "3 retries" ran exactly once. This module turns that dormant contract into
 * real behaviour and gives the executor a single, testable place to decide:
 *
 *   • how many times to attempt a node          (`normalizeRetryPolicy`)
 *   • how long to wait between attempts         (`computeBackoffDelay`)
 *   • whether a given failure is worth retrying (`isRetryableError`)
 *   • when to give up and what to do next       (`resolveErrorStrategy`)
 *
 * Everything here is pure and framework-free except `runWithRetry`, which is
 * async by nature. No React, no DOM, no globals — so the whole policy layer is
 * unit-testable without a browser.
 *
 * ── Design notes ──────────────────────────────────────────────────────────
 * Retries are *opt-in*: a node with no `retries` configured resolves to a
 * single attempt, which is exactly the behaviour every existing workflow has
 * today. Nothing changes for a workflow that never asked for retries, so this
 * module cannot regress a working plugin.
 *
 * Transient failures (network resets, 429s, 502/503/504, timeouts) are
 * retryable by default; deterministic ones (400, 401, 403, 404, validation)
 * are not — retrying a malformed request just burns the run's time budget and
 * hammers the downstream system.
 */

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

export interface RetryPolicy {
  /** Total attempts including the first. `1` means "no retry". */
  maxAttempts: number;
  strategy: BackoffStrategy;
  /** Delay before the 2nd attempt, in ms. */
  initialDelayMs: number;
  /** Ceiling for a single wait, in ms. */
  maxDelayMs: number;
  /** Spread retries randomly to avoid thundering herds. */
  jitter: boolean;
  /** Per-attempt timeout in ms. `0` disables the timeout. */
  timeoutMs: number;
}

export interface RetryAttemptInfo {
  /** 1-based attempt number. */
  attempt: number;
  maxAttempts: number;
  error: Error;
  /** Wait applied before the next attempt, in ms. */
  delayMs: number;
}

export interface RetryHooks {
  /** Called before each attempt after the first. */
  onRetry?: (info: RetryAttemptInfo) => void;
  /** Called once per attempt, before it starts. */
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  /** Cooperative cancellation — return true to stop retrying immediately. */
  shouldAbort?: () => boolean;
}

export interface RetryOutcome<T> {
  ok: boolean;
  value?: T;
  error?: Error;
  /** How many attempts actually ran. */
  attempts: number;
  /** Total wall time across every attempt, in ms. */
  totalMs: number;
  /** True when the failure was a per-attempt timeout. */
  timedOut: boolean;
}

/** What the run loop should do after a node has exhausted its attempts. */
export type ErrorAction = 'continue' | 'stop' | 'fallback';

export interface ErrorResolution {
  action: ErrorAction;
  /** Node id to jump to when `action === 'fallback'`. */
  fallbackActionId?: string;
  reason: string;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  strategy: 'exponential',
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  jitter: true,
  timeoutMs: 0,
};

/* -------------------------------------------------------------------------- */
/*                              POLICY NORMALISING                            */
/* -------------------------------------------------------------------------- */

const toInt = (value: any, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Build a concrete policy from whatever the node carries.
 *
 * Accepts both the flat schema fields (`retries`, `retryDelay`, `timeout`) and
 * a richer `api.retryPolicy` object, so configs written against either shape
 * keep working. `retries` is the number of *extra* attempts, matching how the
 * field reads in the Properties Panel ("Retries: 2" = 3 total attempts).
 */
export function normalizeRetryPolicy(source: any): RetryPolicy {
  if (!source) return { ...DEFAULT_RETRY_POLICY };

  const nested = source.api?.retryPolicy ?? source.retryPolicy ?? {};

  const retries = toInt(
    source.retries ?? nested.retries ?? nested.maxRetries ?? 0,
    0
  );
  const explicitAttempts = toInt(nested.maxAttempts ?? 0, 0);

  const maxAttempts = explicitAttempts > 0
    ? clamp(explicitAttempts, 1, 25)
    : clamp(retries + 1, 1, 25);

  const rawStrategy = String(
    nested.strategy ?? nested.backoff ?? DEFAULT_RETRY_POLICY.strategy
  ).toLowerCase();
  const strategy: BackoffStrategy =
    rawStrategy === 'fixed' || rawStrategy === 'linear' || rawStrategy === 'exponential'
      ? rawStrategy
      : 'exponential';

  const initialDelayMs = clamp(
    toInt(
      source.retryDelay ?? nested.initialDelayMs ?? nested.delay ?? DEFAULT_RETRY_POLICY.initialDelayMs,
      DEFAULT_RETRY_POLICY.initialDelayMs
    ),
    0,
    600_000
  );

  const maxDelayMs = clamp(
    toInt(nested.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs, DEFAULT_RETRY_POLICY.maxDelayMs),
    initialDelayMs,
    600_000
  );

  const timeoutMs = clamp(
    toInt(source.timeout ?? source.api?.timeout ?? nested.timeoutMs ?? 0, 0),
    0,
    3_600_000
  );

  return {
    maxAttempts,
    strategy,
    initialDelayMs,
    maxDelayMs,
    jitter: nested.jitter === undefined ? DEFAULT_RETRY_POLICY.jitter : Boolean(nested.jitter),
    timeoutMs,
  };
}

/** True when the policy would ever attempt a node more than once. */
export function policyHasRetries(policy: RetryPolicy): boolean {
  return policy.maxAttempts > 1;
}

/**
 * Wait before `attempt` (1-based; the delay before attempt 2 uses `attempt=1`).
 *
 * fixed        → d, d, d, …
 * linear       → d, 2d, 3d, …
 * exponential  → d, 2d, 4d, 8d, …  (capped at `maxDelayMs`)
 *
 * Jitter multiplies by 0.5–1.0 so parallel branches retrying the same failing
 * service do not re-collide on every round.
 */
export function computeBackoffDelay(
  policy: RetryPolicy,
  attempt: number,
  random: () => number = Math.random
): number {
  const step = Math.max(1, attempt);
  let delay: number;

  switch (policy.strategy) {
    case 'fixed':
      delay = policy.initialDelayMs;
      break;
    case 'linear':
      delay = policy.initialDelayMs * step;
      break;
    case 'exponential':
    default:
      delay = policy.initialDelayMs * Math.pow(2, step - 1);
      break;
  }

  delay = Math.min(delay, policy.maxDelayMs);
  if (policy.jitter && delay > 0) {
    delay = Math.round(delay * (0.5 + random() * 0.5));
  }
  return Math.max(0, Math.round(delay));
}

/* -------------------------------------------------------------------------- */
/*                             ERROR CLASSIFICATION                           */
/* -------------------------------------------------------------------------- */

/** HTTP statuses worth trying again. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509, 522, 524]);

/** Statuses where retrying only wastes the run's time budget. */
const PERMANENT_STATUS = new Set([400, 401, 403, 404, 405, 409, 410, 412, 415, 422, 451]);

const TRANSIENT_PATTERNS = [
  /\btimed?\s?out\b/i,
  /\btimeout\b/i,
  /\becconnreset\b/i,
  /\becconnrefused\b/i,
  /\benotfound\b/i,
  /\beai_again\b/i,
  /\bepipe\b/i,
  /\behostunreach\b/i,
  /\bsocket hang up\b/i,
  /\bnetwork\b/i,
  /\bfailed to fetch\b/i,
  /\btemporarily unavailable\b/i,
  /\brate limit\b/i,
  /\btoo many requests\b/i,
  /\bservice unavailable\b/i,
  /\bbad gateway\b/i,
  /\bgateway timeout\b/i,
  /\bconnection (reset|closed|aborted)\b/i,
];

const PERMANENT_PATTERNS = [
  /\bunauthorized\b/i,
  /\bforbidden\b/i,
  /\bnot found\b/i,
  /\binvalid credentials\b/i,
  /\bauthentication failed\b/i,
  /\bvalidation (failed|error)\b/i,
  /\bmalformed\b/i,
  /\bbad request\b/i,
];

/** Pull an HTTP status off an error however the transport attached it. */
export function extractStatusCode(error: any): number | undefined {
  if (!error) return undefined;
  const candidates = [
    error.status,
    error.statusCode,
    error.response?.status,
    error.response?.statusCode,
    error.cause?.status,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 100 && parsed < 600) return parsed;
  }
  const match = /\b(?:status|code)\s*[:=]?\s*(\d{3})\b/i.exec(String(error?.message ?? ''));
  if (match) {
    const parsed = Number(match[1]);
    if (parsed >= 100 && parsed < 600) return parsed;
  }
  return undefined;
}

/**
 * Decide whether a failure deserves another attempt.
 *
 * Explicit status codes win over message sniffing, because a 404 that happens
 * to contain the word "network" in its body is still a 404. When nothing is
 * conclusive the answer is "retry" — the policy already caps how many times
 * that can happen, and a spurious second attempt is cheaper than a run that
 * fails on a blip.
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;
  if (error.retryable === true) return true;
  if (error.retryable === false) return false;

  const status = extractStatusCode(error);
  if (status !== undefined) {
    if (RETRYABLE_STATUS.has(status)) return true;
    if (PERMANENT_STATUS.has(status)) return false;
    if (status >= 500) return true;
    if (status >= 400) return false;
  }

  const message = String(error?.message ?? error ?? '');
  if (PERMANENT_PATTERNS.some((pattern) => pattern.test(message))) return false;
  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) return true;

  return true;
}

/** Marker error thrown when a single attempt exceeds `timeoutMs`. */
export class NodeTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly retryable = true;

  constructor(timeoutMs: number, label = 'Node') {
    super(`${label} exceeded its ${timeoutMs} ms timeout.`);
    this.name = 'NodeTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  RUNNERS                                   */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

const toError = (raw: any): Error => {
  if (raw instanceof Error) return raw;
  const error = new Error(String(raw?.message ?? raw ?? 'Unknown error'));
  if (raw && typeof raw === 'object') Object.assign(error, raw);
  return error;
};

/**
 * Race a promise against a timeout.
 *
 * The underlying work is *not* cancelled — a fetch already in flight will still
 * complete somewhere — but the node stops waiting on it, which is what keeps a
 * hung integration from freezing an entire run. The timer is always cleared so
 * a fast-resolving promise never leaves a pending handle behind.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label = 'Node'
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return work;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new NodeTimeoutError(timeoutMs, label)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run `work` under a retry policy.
 *
 * Never throws: the outcome is always returned so the caller decides what a
 * failure means. That keeps the run loop's error handling in one place instead
 * of scattering try/catch around every call site.
 */
export async function runWithRetry<T>(
  work: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  hooks: RetryHooks = {},
  label = 'Node'
): Promise<RetryOutcome<T>> {
  const startedAt = Date.now();
  const maxAttempts = Math.max(1, policy.maxAttempts);

  let lastError: Error | undefined;
  let timedOut = false;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    if (hooks.shouldAbort?.()) {
      lastError = lastError ?? new Error(`${label} aborted before attempt ${attempt}.`);
      break;
    }

    hooks.onAttempt?.(attempt, maxAttempts);

    try {
      const value = await withTimeout(
        Promise.resolve().then(() => work(attempt)),
        policy.timeoutMs,
        label
      );
      return {
        ok: true,
        value,
        attempts: attempt,
        totalMs: Date.now() - startedAt,
        timedOut: false,
      };
    } catch (raw) {
      const error = toError(raw);
      lastError = error;
      timedOut = error instanceof NodeTimeoutError;

      const isLastAttempt = attempt >= maxAttempts;
      if (isLastAttempt || !isRetryableError(error) || hooks.shouldAbort?.()) break;

      const delayMs = computeBackoffDelay(policy, attempt);
      hooks.onRetry?.({ attempt, maxAttempts, error, delayMs });
      await sleep(delayMs);
    }
  }

  return {
    ok: false,
    error: lastError ?? new Error(`${label} failed.`),
    attempts: attempt,
    totalMs: Date.now() - startedAt,
    timedOut,
  };
}

/* -------------------------------------------------------------------------- */
/*                          TRY / CATCH / FINALLY                             */
/* -------------------------------------------------------------------------- */

/**
 * Translate a node's `onError` setting into an instruction for the run loop.
 *
 * `retry` is deliberately mapped to `continue`: by the time this is consulted
 * `runWithRetry` has already exhausted the retry budget, so treating it as
 * "keep going" is the honest reading — the alternative would silently retry
 * forever. `fallback` only resolves when a reachable fallback node is named.
 */
export function resolveErrorStrategy(action: any, availableNodeIds?: Set<string>): ErrorResolution {
  const strategy = String(action?.onError ?? 'continue').toLowerCase();
  const fallbackId = action?.fallbackActionId ? String(action.fallbackActionId) : undefined;

  if (strategy === 'stop') {
    return { action: 'stop', reason: 'Node is configured to stop the run on error.' };
  }

  if (strategy === 'fallback') {
    if (fallbackId && (!availableNodeIds || availableNodeIds.has(fallbackId))) {
      return {
        action: 'fallback',
        fallbackActionId: fallbackId,
        reason: 'Routing to the configured fallback node.',
      };
    }
    return {
      action: 'continue',
      reason: 'Fallback requested but no reachable fallback node is configured.',
    };
  }

  if (strategy === 'retry') {
    return { action: 'continue', reason: 'Retry budget exhausted — continuing past the failure.' };
  }

  return { action: 'continue', reason: 'Node is configured to continue past errors.' };
}

/**
 * Run a body with a guaranteed cleanup step — the workflow equivalent of
 * `try { … } catch { … } finally { … }`.
 *
 * `finallyFn` runs exactly once whether the body succeeded, failed, or the
 * catch handler itself threw. A throw from cleanup is swallowed and reported
 * through `onFinallyError` rather than replacing the real error, because a
 * failure to tidy up should never mask the failure that caused it.
 */
export async function runGuarded<T>(options: {
  try: () => Promise<T>;
  catch?: (error: Error) => Promise<T | void> | T | void;
  finally?: () => Promise<void> | void;
  onFinallyError?: (error: Error) => void;
}): Promise<{ ok: boolean; value?: T; error?: Error; recovered: boolean }> {
  let ok = false;
  let recovered = false;
  let value: T | undefined;
  let error: Error | undefined;

  try {
    value = await options.try();
    ok = true;
  } catch (raw) {
    error = toError(raw);
    if (options.catch) {
      try {
        const recoveredValue = await options.catch(error);
        if (recoveredValue !== undefined) value = recoveredValue as T;
        ok = true;
        recovered = true;
        error = undefined;
      } catch (handlerError) {
        error = toError(handlerError);
      }
    }
  } finally {
    if (options.finally) {
      try {
        await options.finally();
      } catch (cleanupError) {
        options.onFinallyError?.(toError(cleanupError));
      }
    }
  }

  return { ok, value, error, recovered };
}

/** Human summary for logs: `3 attempts over 4.2 s`. */
export function describeRetryOutcome(outcome: RetryOutcome<unknown>): string {
  const attempts = `${outcome.attempts} attempt${outcome.attempts === 1 ? '' : 's'}`;
  const seconds = outcome.totalMs < 1000
    ? `${outcome.totalMs} ms`
    : `${(outcome.totalMs / 1000).toFixed(1)} s`;
  return `${attempts} over ${seconds}`;
}
