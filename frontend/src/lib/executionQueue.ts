/**
 * Execution queue — bounded concurrency, priority and back-pressure.
 *
 * `Workflow.concurrency` was declared but unenforced: pressing Run twice
 * started two independent runs against the same context, and a fan-out node
 * with twenty branches fired twenty simultaneous requests at whatever backend
 * sat behind them. This module provides the missing governor.
 *
 *   const queue = createExecutionQueue({ concurrency: 4 });
 *   const result = await queue.add(() => callService(), { priority: 10 });
 *
 * Two distinct uses in the platform:
 *   • the run loop parallelises independent branches without stampeding
 *   • the editor serialises whole runs when a workflow declares
 *     `concurrency: 1`, which is what "do not run this twice at once" means
 *
 * Pure TypeScript, no timers beyond the ones the caller's work creates, so it
 * is fully deterministic under test.
 */

export interface QueueTaskOptions {
  /** Higher runs first. Equal priorities keep FIFO order. */
  priority?: number;
  /** Label used in queue stats and logs. */
  label?: string;
  /** Abort the task if it has not started within this many ms. */
  timeoutMs?: number;
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  /** Longest a task has waited before starting, in ms. */
  maxWaitMs: number;
}

interface QueueEntry<T> {
  id: number;
  label: string;
  priority: number;
  enqueuedAt: number;
  timeoutMs: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface ExecutionQueueOptions {
  /** Max tasks running at once. Values below 1 are clamped to 1. */
  concurrency?: number;
  /** Fired whenever the queue's shape changes, for progress UI. */
  onChange?: (stats: QueueStats) => void;
}

/** Raised when a task is dropped before it ever started. */
export class QueueTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`"${label}" waited longer than ${timeoutMs} ms for a queue slot.`);
    this.name = 'QueueTimeoutError';
  }
}

export class QueueDrainedError extends Error {
  constructor(label: string) {
    super(`"${label}" was cancelled because the queue was cleared.`);
    this.name = 'QueueDrainedError';
  }
}

/**
 * A priority queue with a concurrency ceiling.
 *
 * Ordering is by priority descending, then by insertion sequence — so equal
 * priorities are strictly FIFO and a low-priority task can never be starved
 * indefinitely by a steady trickle of equal-priority work.
 */
export class ExecutionQueue {
  private concurrency: number;
  private queue: QueueEntry<any>[] = [];
  private activeCount = 0;
  private sequence = 0;
  private completed = 0;
  private failed = 0;
  private maxWaitMs = 0;
  private onChange?: (stats: QueueStats) => void;
  private idleResolvers: Array<() => void> = [];

  constructor(options: ExecutionQueueOptions = {}) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
    this.onChange = options.onChange;
  }

  /** Change the ceiling at run time; frees slots immediately when raised. */
  setConcurrency(value: number): void {
    this.concurrency = Math.max(1, Math.floor(value));
    this.drain();
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  /**
   * Enqueue work. The returned promise settles with the task's result, so a
   * caller never needs to know whether it ran immediately or waited.
   */
  add<T>(run: () => Promise<T>, options: QueueTaskOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.sequence += 1;
      const entry: QueueEntry<T> = {
        id: this.sequence,
        label: options.label ?? `task-${this.sequence}`,
        priority: options.priority ?? 0,
        enqueuedAt: Date.now(),
        timeoutMs: options.timeoutMs ?? 0,
        run,
        resolve,
        reject,
      };

      if (entry.timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          const index = this.queue.indexOf(entry);
          if (index >= 0) {
            this.queue.splice(index, 1);
            this.failed += 1;
            entry.reject(new QueueTimeoutError(entry.label, entry.timeoutMs));
            this.emit();
          }
        }, entry.timeoutMs);
      }

      this.insert(entry);
      this.emit();
      this.drain();
    });
  }

  /** Insert respecting priority, keeping FIFO within a priority band. */
  private insert(entry: QueueEntry<any>): void {
    let index = this.queue.length;
    while (index > 0 && this.queue[index - 1].priority < entry.priority) index -= 1;
    this.queue.splice(index, 0, entry);
  }

  /** Start as many queued tasks as the ceiling allows. */
  private drain(): void {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      if (entry.timer) clearTimeout(entry.timer);

      const waited = Date.now() - entry.enqueuedAt;
      if (waited > this.maxWaitMs) this.maxWaitMs = waited;

      this.activeCount += 1;
      this.emit();

      Promise.resolve()
        .then(() => entry.run())
        .then(
          (value) => {
            this.completed += 1;
            entry.resolve(value);
          },
          (error) => {
            this.failed += 1;
            entry.reject(error instanceof Error ? error : new Error(String(error)));
          }
        )
        .finally(() => {
          this.activeCount -= 1;
          this.emit();
          this.drain();
          this.settleIdle();
        });
    }

    this.settleIdle();
  }

  private settleIdle(): void {
    if (this.activeCount > 0 || this.queue.length > 0) return;
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  /** Resolves once nothing is queued or running. */
  onIdle(): Promise<void> {
    if (this.activeCount === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  /**
   * Reject everything still waiting. Tasks already running are left alone —
   * they own external side effects the queue cannot undo, so silently
   * abandoning them would be worse than letting them finish.
   */
  clear(): void {
    const dropped = this.queue.splice(0, this.queue.length);
    dropped.forEach((entry) => {
      if (entry.timer) clearTimeout(entry.timer);
      this.failed += 1;
      entry.reject(new QueueDrainedError(entry.label));
    });
    this.emit();
    this.settleIdle();
  }

  stats(): QueueStats {
    return {
      pending: this.queue.length,
      active: this.activeCount,
      completed: this.completed,
      failed: this.failed,
      maxWaitMs: this.maxWaitMs,
    };
  }

  /** Reset counters without disturbing in-flight work. */
  resetStats(): void {
    this.completed = 0;
    this.failed = 0;
    this.maxWaitMs = 0;
    this.emit();
  }

  private emit(): void {
    this.onChange?.(this.stats());
  }
}

export function createExecutionQueue(options: ExecutionQueueOptions = {}): ExecutionQueue {
  return new ExecutionQueue(options);
}

/**
 * Run tasks with bounded parallelism and collect every result.
 *
 * Unlike `Promise.all` this never rejects: each slot reports its own outcome,
 * so one failing branch in a fan-out does not discard the results of the
 * branches that succeeded.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<Array<{ ok: boolean; value?: R; error?: Error; index: number }>> {
  const queue = new ExecutionQueue({ concurrency });

  const results = await Promise.all(
    items.map((item, index) =>
      queue
        .add(() => worker(item, index), { label: `item-${index}`, priority: -index })
        .then(
          (value) => ({ ok: true, value, index }),
          (error: Error) => ({ ok: false, error, index })
        )
    )
  );

  return results.sort((a, b) => a.index - b.index);
}
