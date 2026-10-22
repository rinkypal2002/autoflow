/**
 * Structured, enterprise-grade execution logging.
 *
 * Every line produced during a run is correlated with the run id and (where
 * applicable) the node id, node name, phase and duration. Payloads are redacted
 * and size-capped before they reach the panel or a persisted snapshot, so
 * credentials never leak and a multi-megabyte response can never freeze the UI.
 *
 * The previous executor emitted ad-hoc `setExecutionLogs(prev => [...])` calls
 * with free-text messages and no node name, duration or phase — which is why
 * the Execution Panel's "Step Metrics" tab could only ever render "--".
 */

import type { ExecutionLog, LogLevel } from '../types/workflow';
import { redactSecrets, truncateForStorage } from './objectUtils';

/** Where a log line was produced inside a node's lifecycle. */
export type ExecutionPhase =
  | 'run'
  | 'resolve'
  | 'request'
  | 'response'
  | 'context'
  | 'routing'
  | 'snapshot'
  | 'validation';

export interface LogDetails {
  data?: any;
  error?: any;
  durationMs?: number;
  phase?: ExecutionPhase;
  metadata?: Record<string, any>;
}

export type LogSink = (log: ExecutionLog) => void;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  success: 20,
  warning: 30,
  error: 40,
};

const CONSOLE_STYLES: Record<LogLevel, string> = {
  debug: 'color:#64748b',
  info: 'color:#60a5fa',
  success: 'color:#34d399',
  warning: 'color:#fbbf24',
  error: 'color:#f87171',
};

export interface WorkflowLoggerInit {
  runId: string;
  workflowId?: string;
  sink: LogSink;
  /** Lines below this level are dropped. Defaults to `debug`. */
  minLevel?: LogLevel;
  /** Mirror to the browser console. Defaults to true in dev. */
  mirrorToConsole?: boolean;
  /** Extra key names whose values must be masked (e.g. secret variables). */
  secretKeys?: string[];
  /** Correlation fields inherited by child loggers. */
  actionId?: string;
  actionName?: string;
}

let logCounter = 0;
const nextLogId = (): string => {
  logCounter += 1;
  return `log_${Date.now().toString(36)}_${logCounter.toString(36)}`;
};

export class WorkflowLogger {
  private readonly runId: string;
  private readonly workflowId?: string;
  private readonly sink: LogSink;
  private readonly minLevel: LogLevel;
  private readonly mirrorToConsole: boolean;
  private readonly secretKeys: string[];
  private readonly actionId?: string;
  private readonly actionName?: string;

  constructor(init: WorkflowLoggerInit) {
    this.runId = init.runId;
    this.workflowId = init.workflowId;
    this.sink = init.sink;
    this.minLevel = init.minLevel ?? 'debug';
    this.mirrorToConsole = init.mirrorToConsole ?? true;
    this.secretKeys = init.secretKeys ?? [];
    this.actionId = init.actionId;
    this.actionName = init.actionName;
  }

  /** Derive a logger bound to one node, so every line is auto-correlated. */
  forNode(actionId: string, actionName: string): WorkflowLogger {
    return new WorkflowLogger({
      runId: this.runId,
      workflowId: this.workflowId,
      sink: this.sink,
      minLevel: this.minLevel,
      mirrorToConsole: this.mirrorToConsole,
      secretKeys: this.secretKeys,
      actionId,
      actionName,
    });
  }

  private emit(level: LogLevel, message: string, details: LogDetails = {}): ExecutionLog {
    const log: ExecutionLog = {
      id: nextLogId(),
      workflowId: this.workflowId,
      runId: this.runId,
      actionId: this.actionId,
      timestamp: new Date().toISOString(),
      level,
      message,
      duration: details.durationMs,
      data: details.data === undefined ? undefined : truncateForStorage(redactSecrets(details.data, this.secretKeys)),
      error: details.error === undefined ? undefined : this.describeError(details.error),
      stackTrace: typeof details.error?.stack === 'string' ? details.error.stack : undefined,
      metadata: {
        ...(details.metadata ?? {}),
        ...(this.actionName ? { actionName: this.actionName } : {}),
        ...(details.phase ? { phase: details.phase } : {}),
      },
    };

    if (LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.minLevel]) {
      this.sink(log);
    }

    if (this.mirrorToConsole) {
      const prefix = this.actionName ? `[${this.runId.slice(0, 8)}] ${this.actionName}` : `[${this.runId.slice(0, 8)}]`;
      console.log(
        `%c${prefix} %c${message}`,
        'color:#818cf8;font-weight:600',
        CONSOLE_STYLES[level],
        details.data ?? ''
      );
    }

    return log;
  }

  private describeError(error: any): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (error.message) return String(error.message);
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  debug(message: string, details?: LogDetails): ExecutionLog {
    return this.emit('debug', message, details);
  }

  info(message: string, details?: LogDetails): ExecutionLog {
    return this.emit('info', message, details);
  }

  success(message: string, details?: LogDetails): ExecutionLog {
    return this.emit('success', message, details);
  }

  warn(message: string, details?: LogDetails): ExecutionLog {
    return this.emit('warning', message, details);
  }

  error(message: string, details?: LogDetails): ExecutionLog {
    return this.emit('error', message, details);
  }

  /**
   * Start a timer. Call the returned function to get the elapsed milliseconds.
   *
   *   const done = logger.startTimer();
   *   … work …
   *   logger.success('Finished', { durationMs: done() });
   */
  startTimer(): () => number {
    const start = Date.now();
    return () => Date.now() - start;
  }
}

/** Create the root logger for a run. */
export function createWorkflowLogger(init: WorkflowLoggerInit): WorkflowLogger {
  return new WorkflowLogger(init);
}
