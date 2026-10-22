/**
 * Scheduling — cron / interval parsing, next-run computation and a live timer.
 *
 * `Schedule` and `Trigger` have carried `type: 'cron' | 'interval'` and a
 * `nextRun` field since the first schema, but nothing ever parsed an expression
 * or computed a next run, so a scheduled workflow never fired and the UI could
 * only echo back the string the user typed.
 *
 * This module supplies:
 *   • `parseCron`        a real 5-field cron parser with ranges, steps, lists
 *                        and named months/days
 *   • `nextCronRun`      the next matching instant after a given time
 *   • `parseInterval`    `30s`, `5m`, `2h`, `1d` and plain milliseconds
 *   • `describeSchedule` a plain-English summary for the Triggers panel
 *   • `WorkflowScheduler` an in-app timer that fires due schedules
 *
 * The parser is deliberately conventional 5-field cron (minute hour dom month
 * dow) rather than a superset — a user pasting a crontab line gets exactly what
 * they expect, and `@hourly`-style macros are expanded to the same form.
 */

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

export interface CronFields {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  /** True when day-of-month was `*` — affects OR/AND matching against dow. */
  domUnrestricted: boolean;
  dowUnrestricted: boolean;
}

export interface CronParseResult {
  ok: boolean;
  fields?: CronFields;
  error?: string;
}

export type ScheduleKind = 'cron' | 'interval';

export interface ScheduleDefinition {
  enabled: boolean;
  type: ScheduleKind;
  /** Cron expression or interval string. */
  value: string;
  timezone?: string;
  maxRuns?: number;
  retryOnFailure?: boolean;
}

export interface ScheduleEvaluation {
  ok: boolean;
  /** Next fire time, or null when the schedule can never fire. */
  nextRun: Date | null;
  description: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*                                CRON PARSING                                */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

interface FieldSpec {
  min: number;
  max: number;
  names?: Record<string, number>;
  label: string;
}

const FIELD_SPECS: FieldSpec[] = [
  { min: 0, max: 59, label: 'minute' },
  { min: 0, max: 23, label: 'hour' },
  { min: 1, max: 31, label: 'day of month' },
  { min: 1, max: 12, names: MONTH_NAMES, label: 'month' },
  { min: 0, max: 6, names: DAY_NAMES, label: 'day of week' },
];

/**
 * Expand one cron field into the explicit list of values it matches.
 *
 * Handles `*`, `a-b`, `a-b/n`, `*` + `/n`, comma lists and names. Returns null
 * on anything malformed so the caller can report *which* field is wrong rather
 * than failing the whole expression opaquely.
 */
function expandField(raw: string, spec: FieldSpec): number[] | null {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;

  const values = new Set<number>();

  for (const part of text.split(',')) {
    const chunk = part.trim();
    if (!chunk) return null;

    const [rangePart, stepPart] = chunk.split('/');
    let step = 1;

    if (stepPart !== undefined) {
      step = Number.parseInt(stepPart, 10);
      if (!Number.isFinite(step) || step <= 0) return null;
    }

    let start: number;
    let end: number;

    if (rangePart === '*' || rangePart === '?') {
      start = spec.min;
      end = spec.max;
    } else if (rangePart.includes('-')) {
      const [fromRaw, toRaw] = rangePart.split('-');
      const from = resolveValue(fromRaw, spec);
      const to = resolveValue(toRaw, spec);
      if (from === null || to === null) return null;
      start = from;
      end = to;
    } else {
      const single = resolveValue(rangePart, spec);
      if (single === null) return null;
      start = single;
      end = stepPart !== undefined ? spec.max : single;
    }

    if (start > end) {
      // Wrapping range, e.g. `fri-mon`. Walk to the ceiling, then from the floor.
      for (let value = start; value <= spec.max; value += step) values.add(value);
      for (let value = spec.min; value <= end; value += step) values.add(value);
    } else {
      for (let value = start; value <= end; value += step) values.add(value);
    }
  }

  const list = [...values].filter((value) => value >= spec.min && value <= spec.max);
  return list.length > 0 ? list.sort((a, b) => a - b) : null;
}

function resolveValue(raw: string, spec: FieldSpec): number | null {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;

  if (spec.names && spec.names[text.slice(0, 3)] !== undefined) {
    return spec.names[text.slice(0, 3)];
  }

  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return null;

  // Cron allows 7 for Sunday alongside 0.
  if (spec.label === 'day of week' && parsed === 7) return 0;
  if (parsed < spec.min || parsed > spec.max) return null;

  return parsed;
}

/** Parse a 5-field cron expression (or a `@macro`). */
export function parseCron(expression: string): CronParseResult {
  const raw = String(expression ?? '').trim().toLowerCase();
  if (!raw) return { ok: false, error: 'Cron expression is empty.' };

  const normalized = MACROS[raw] ?? raw;
  const parts = normalized.split(/\s+/);

  if (parts.length !== 5) {
    return {
      ok: false,
      error: `Expected 5 fields (minute hour day month weekday), received ${parts.length}.`,
    };
  }

  const expanded: number[][] = [];
  for (let index = 0; index < 5; index += 1) {
    const values = expandField(parts[index], FIELD_SPECS[index]);
    if (!values) {
      return { ok: false, error: `Invalid ${FIELD_SPECS[index].label}: "${parts[index]}".` };
    }
    expanded.push(values);
  }

  const domRaw = parts[2].trim();
  const dowRaw = parts[4].trim();

  return {
    ok: true,
    fields: {
      minutes: expanded[0],
      hours: expanded[1],
      daysOfMonth: expanded[2],
      months: expanded[3],
      daysOfWeek: expanded[4],
      domUnrestricted: domRaw === '*' || domRaw === '?',
      dowUnrestricted: dowRaw === '*' || dowRaw === '?',
    },
  };
}

/**
 * Does `date` match the parsed schedule?
 *
 * Day matching follows the standard cron rule: when BOTH day-of-month and
 * day-of-week are restricted the match is an OR, not an AND. `0 0 1 * mon`
 * therefore fires on the 1st *and* on every Monday — surprising, but it is
 * what every crontab in the world does, and diverging would be worse.
 */
export function cronMatches(fields: CronFields, date: Date): boolean {
  if (!fields.minutes.includes(date.getMinutes())) return false;
  if (!fields.hours.includes(date.getHours())) return false;
  if (!fields.months.includes(date.getMonth() + 1)) return false;

  const domMatch = fields.daysOfMonth.includes(date.getDate());
  const dowMatch = fields.daysOfWeek.includes(date.getDay());

  if (fields.domUnrestricted && fields.dowUnrestricted) return true;
  if (fields.domUnrestricted) return dowMatch;
  if (fields.dowUnrestricted) return domMatch;
  return domMatch || dowMatch;
}

/**
 * Next instant strictly after `from` that matches the expression.
 *
 * Walks minute by minute with a hard ceiling of four years, which is enough to
 * find any real schedule (the worst case is Feb 29 on a specific weekday) while
 * guaranteeing the loop terminates on an impossible one like `0 0 30 2 *`.
 */
export function nextCronRun(expression: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(expression);
  if (!parsed.ok || !parsed.fields) return null;

  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = 60 * 24 * 366 * 4;
  for (let step = 0; step < limit; step += 1) {
    if (cronMatches(parsed.fields, cursor)) return new Date(cursor.getTime());
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*                              INTERVAL PARSING                              */
/* -------------------------------------------------------------------------- */

const INTERVAL_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

/**
 * Parse an interval into milliseconds. Accepts `30s`, `5 m`, `2h`, `1d`,
 * compound forms like `1h30m`, and bare numbers (treated as milliseconds).
 */
export function parseInterval(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }

  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    return parsed > 0 ? parsed : null;
  }

  const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw)) !== null) {
    const amount = Number.parseFloat(match[1]);
    const unit = INTERVAL_UNITS[match[2]];
    if (!Number.isFinite(amount) || unit === undefined) return null;
    total += amount * unit;
    matched = true;
  }

  if (!matched || total <= 0) return null;
  return Math.round(total);
}

/** `90000` -> `1m 30s`. */
export function formatInterval(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';

  const units: Array<[string, number]> = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1000],
  ];

  let remaining = Math.round(ms);
  const parts: string[] = [];

  for (const [label, size] of units) {
    const amount = Math.floor(remaining / size);
    if (amount > 0) {
      parts.push(`${amount}${label}`);
      remaining -= amount * size;
    }
    if (parts.length === 2) break;
  }

  return parts.length > 0 ? parts.join(' ') : `${Math.round(ms)}ms`;
}

/* -------------------------------------------------------------------------- */
/*                                 EVALUATION                                 */
/* -------------------------------------------------------------------------- */

const ORDINAL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (value: number): string => String(value).padStart(2, '0');

/** Plain-English summary of a cron expression, for the Triggers panel. */
export function describeCron(expression: string): string {
  const parsed = parseCron(expression);
  if (!parsed.ok || !parsed.fields) return parsed.error ?? 'Invalid cron expression';

  const { minutes, hours, daysOfMonth, months, daysOfWeek, domUnrestricted, dowUnrestricted } =
    parsed.fields;

  const everyMinute = minutes.length === 60;
  const everyHour = hours.length === 24;

  const timePart = everyMinute && everyHour
    ? 'Every minute'
    : everyHour
      ? `At minute ${minutes.join(', ')} of every hour`
      : everyMinute
        ? `Every minute during ${hours.map((hour) => `${pad(hour)}:00`).join(', ')}`
        : `At ${hours
            .flatMap((hour) => minutes.map((minute) => `${pad(hour)}:${pad(minute)}`))
            .slice(0, 4)
            .join(', ')}${hours.length * minutes.length > 4 ? ' …' : ''}`;

  const dayParts: string[] = [];
  if (!dowUnrestricted) {
    dayParts.push(`on ${daysOfWeek.map((day) => ORDINAL_DAYS[day]).join(', ')}`);
  }
  if (!domUnrestricted) {
    dayParts.push(`on day ${daysOfMonth.join(', ')} of the month`);
  }
  if (months.length !== 12) {
    const names = Object.entries(MONTH_NAMES)
      .filter(([, index]) => months.includes(index))
      .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
    dayParts.push(`in ${names.join(', ')}`);
  }

  return [timePart, ...dayParts].join(' ');
}

/** Validate a schedule and compute its next run. */
export function evaluateSchedule(
  schedule: ScheduleDefinition,
  from: Date = new Date()
): ScheduleEvaluation {
  if (!schedule?.enabled) {
    return { ok: true, nextRun: null, description: 'Schedule disabled' };
  }

  if (schedule.type === 'interval') {
    const ms = parseInterval(schedule.value);
    if (ms === null) {
      return {
        ok: false,
        nextRun: null,
        description: 'Invalid interval',
        error: `Could not read "${schedule.value}" as an interval. Try 30s, 5m, 2h or 1d.`,
      };
    }
    return {
      ok: true,
      nextRun: new Date(from.getTime() + ms),
      description: `Every ${formatInterval(ms)}`,
    };
  }

  const parsed = parseCron(schedule.value);
  if (!parsed.ok) {
    return { ok: false, nextRun: null, description: 'Invalid cron expression', error: parsed.error };
  }

  const nextRun = nextCronRun(schedule.value, from);
  if (!nextRun) {
    return {
      ok: false,
      nextRun: null,
      description: 'Never fires',
      error: 'This expression matches no date within the next four years.',
    };
  }

  return { ok: true, nextRun, description: describeCron(schedule.value) };
}

/** `in 4m`, `in 2h 10m`, `overdue`. */
export function describeTimeUntil(target: Date | null, from: Date = new Date()): string {
  if (!target) return '—';
  const delta = target.getTime() - from.getTime();
  if (delta <= 0) return 'due now';
  return `in ${formatInterval(delta)}`;
}

/* -------------------------------------------------------------------------- */
/*                                  SCHEDULER                                 */
/* -------------------------------------------------------------------------- */

export interface ScheduledJob {
  id: string;
  workflowId: string;
  workflowName: string;
  schedule: ScheduleDefinition;
  nextRun: Date | null;
  lastRun?: Date | null;
  runCount: number;
  /** Set when the schedule itself is invalid; the job stays visible and inert. */
  error?: string;
}

export interface SchedulerEvents {
  onFire?: (job: ScheduledJob) => void | Promise<void>;
  onChange?: (jobs: ScheduledJob[]) => void;
  onError?: (job: ScheduledJob, error: Error) => void;
}

/**
 * In-app scheduler.
 *
 * Ticks once a second and fires whatever is due. Deliberately simple: it only
 * runs while the app is open, which is the honest scope for a browser-hosted
 * engine — a durable scheduler belongs on the server. What it does guarantee is
 * that `nextRun` is always a real computed instant, so the UI stops showing
 * schedules that would never have fired.
 */
export class WorkflowScheduler {
  private jobs = new Map<string, ScheduledJob>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private events: SchedulerEvents;
  private firing = new Set<string>();

  constructor(events: SchedulerEvents = {}) {
    this.events = events;
  }

  /** Register or replace a schedule. Recomputes `nextRun` immediately. */
  schedule(job: Omit<ScheduledJob, 'nextRun' | 'runCount' | 'error'>): ScheduledJob {
    const evaluation = evaluateSchedule(job.schedule);
    const entry: ScheduledJob = {
      ...job,
      nextRun: evaluation.nextRun,
      runCount: this.jobs.get(job.id)?.runCount ?? 0,
      error: evaluation.error,
    };
    this.jobs.set(job.id, entry);
    this.emit();
    return entry;
  }

  unschedule(id: string): void {
    if (this.jobs.delete(id)) this.emit();
  }

  getJobs(): ScheduledJob[] {
    return [...this.jobs.values()].sort(
      (a, b) => (a.nextRun?.getTime() ?? Infinity) - (b.nextRun?.getTime() ?? Infinity)
    );
  }

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Fire every job whose time has come.
   *
   * `firing` guards against re-entry: a workflow that takes longer than the
   * tick interval must not be started again while its previous run is still
   * going, which is the classic way a scheduler quietly DDoSes its own backend.
   */
  async tick(now: Date = new Date()): Promise<void> {
    for (const job of this.getJobs()) {
      if (!job.nextRun || job.nextRun.getTime() > now.getTime()) continue;
      if (this.firing.has(job.id)) continue;
      if (job.schedule.maxRuns && job.runCount >= job.schedule.maxRuns) continue;

      this.firing.add(job.id);
      try {
        await this.events.onFire?.(job);
        job.runCount += 1;
        job.lastRun = now;
      } catch (error: any) {
        this.events.onError?.(job, error instanceof Error ? error : new Error(String(error)));
      } finally {
        this.firing.delete(job.id);
        job.nextRun = evaluateSchedule(job.schedule, now).nextRun;
        this.jobs.set(job.id, job);
      }
    }
    this.emit();
  }

  dispose(): void {
    this.stop();
    this.jobs.clear();
    this.firing.clear();
    this.events = {};
  }

  private emit(): void {
    this.events.onChange?.(this.getJobs());
  }
}

export function createScheduler(events: SchedulerEvents = {}): WorkflowScheduler {
  return new WorkflowScheduler(events);
}
