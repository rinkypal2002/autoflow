# Enterprise Runtime Layer (Phase 4)

This document covers the enterprise capabilities added on top of the Phase 3
carry-forward engine. Phase 3 is unchanged and still passes its full suite;
everything here is additive.

## Why this phase existed

An audit of the Phase 3 build found the carry-forward, business projection,
binding and Preview Data requirements already implemented and working:

- `npm run build` succeeded
- `tsc --strict` reported zero errors
- all 67 carry-forward tests passed
- `{{employeeId}}`, `{{previous.employeeId}}`,
  `{{steps.Read Employee Excel.employeeId}}` and `{{variables.EmployeeId}}`
  all resolved correctly from any node

The real gap was the **enterprise runtime**. Concretely:

> `WorkflowAction` declared `retries`, `retryDelay`, `timeout` and
> `fallbackActionId`. **The executor read none of them.** A node configured for
> "3 retries" ran exactly once, and `fallbackActionId` was dead config.

Alongside that, there were zero occurrences anywhere in the codebase of
breakpoints, debug sessions, cron parsing, version rollback, concurrency
limiting, or variable validation.

---

## What was added

### 1. Resilience — `src/lib/retryPolicy.ts`

Turns the dormant schema fields into real behaviour.

| Capability | Detail |
| --- | --- |
| Backoff | `fixed`, `linear`, `exponential`, each with optional jitter |
| Timeouts | Per-attempt ceiling; the node stops waiting on a hung integration |
| Classification | 429/500/502/503/504 and network resets retry; 400/401/403/404 do not |
| Try / catch / finally | `runGuarded` guarantees cleanup runs exactly once |
| Error routing | `resolveErrorStrategy` implements `continue`, `stop` and `fallback` |

**Backward compatibility:** a node with no retry configured normalises to
`maxAttempts: 1` — byte-for-byte today's behaviour. This cannot regress an
existing workflow.

The wrapper (`executeActionWithPolicy` in `WorkspaceEditorPage`) wraps
`executeAction` from the *outside*. Nothing inside the 700-line plugin path
changed, which is what keeps every working plugin working.

### 2. Debugger — `src/lib/workflowDebugger.ts`

The run loop is a `while` over a queue, so the only hook a debugger needs is a
place to `await` between nodes:

```ts
const gate = await debugSession.beforeNode(action, scope, sequence);
if (gate === 'abort') break;
```

Because pausing is just an unresolved promise, a parked run **holds its entire
live context** — every variable and every earlier node's output stays
inspectable and bindable. Nothing is snapshotted and replayed.

- **Breakpoints** with enable/disable, conditions, and hit counts
- **Conditional breakpoints** — "stop only when `previous.rowsAffected === 0`",
  evaluated with the same sandboxed evaluator routing conditions use (no `eval`,
  no `new Function`)
- **Tracepoints** (`logOnly`) — record the hit and keep going
- **Step over / Resume / Pause / Run to here**
- **Watch expressions**, re-evaluated on every pause; braces optional
- Breakpoints persist per workflow to `localStorage` and survive reloads

Set a breakpoint by clicking the gutter dot on the left edge of any node.

### 3. Versioning — `src/lib/workflowVersioning.ts`

`Workflow.versionHistory` existed but was never written to.

- A version is captured on every save, but **only when the canvas actually
  differs** from the newest stored one — otherwise repeated saves would bury
  real history under identical entries
- Per-run fields (`status`, `executionTime`, `selected`…) are stripped, so a
  rollback never restores stale "completed" badges
- Diffing matches **by id, not position**, so reordering nodes does not read as
  "everything changed"
- Rollback is **non-destructive**: the current canvas is auto-versioned first
- Secrets are diffed for presence, never content

### 4. Scheduling — `src/lib/scheduler.ts`

A real 5-field cron parser: ranges, steps, lists, named months and weekdays,
`@daily`-style macros, and `7` as Sunday. Day matching follows the standard
crontab OR rule when both day-of-month and day-of-week are restricted.

`nextCronRun` walks minute by minute with a four-year ceiling, so an impossible
expression like `0 0 30 2 *` terminates and returns `null` instead of hanging.

Intervals accept `30s`, `5m`, `1h30m`, and bare milliseconds.

### 5. Queueing — `src/lib/executionQueue.ts`

`Workflow.concurrency` was declared but unenforced. This adds a priority queue
with a concurrency ceiling, FIFO within a priority band so nothing starves, and
`mapWithConcurrency` which — unlike `Promise.all` — never discards the results
of branches that succeeded when one branch fails.

### 6. Typed variables — `src/lib/variableTypes.ts`

`type`, `required` and `validationRules` are now enforced *before* a run starts,
rather than failing deep inside a plugin with a confusing message.

Coercion is forgiving on input (a `number` variable accepts `"1,250"`) and
strict on output (it stores `1250`). Binding tokens pass through untouched —
`{{previous.count}}` in a `number` field is a deferred value, not a broken one.

---

## Bugs found and fixed

1. **Step sequence corruption under retry.** `recordNodeStart` unconditionally
   incremented the sequence counter, so any re-attempt would have made Preview
   Data skip step numbers (1, 3, 4…). It is now idempotent and reports
   `record.attempt`.

2. **`nextVersionNumber` emitted `2.undefined.NaN`.** `Number.isNaN(undefined)`
   is `false`, so the guard let `undefined` through for short version strings
   like `"2"`. Caught by the new test suite; now uses `Number.isFinite`.

3. **`npm run lint` crashed entirely** — an eslint 9.34 / typescript-eslint
   version mismatch that failed on untouched files too. Bumping
   `typescript-eslint` repaired it.

---

## Verification

```bash
npm run typecheck        # tsc --strict, zero errors
npm test                 # both suites: 67 + 123 = 190 assertions
npm run build            # production build
npm run test:enterprise  # the Phase 4 suite alone
```

| Check | Result |
| --- | --- |
| TypeScript (strict) | 0 errors |
| Carry-forward suite | 67 passed, 0 failed |
| Enterprise suite | 123 passed, 0 failed |
| Production build | succeeds |

Remaining lint output is `@typescript-eslint/no-explicit-any`, which fires
across the pre-existing engine files too (`objectUtils.ts` alone reports 32).
A dynamic workflow engine legitimately types payloads as `any`; the new modules
match the platform's established style rather than diverging from it.

---

## Files

**New**

```
src/lib/retryPolicy.ts             resilience + control flow
src/lib/workflowDebugger.ts        breakpoints, stepping, watches
src/lib/workflowVersioning.ts      version capture, diff, rollback
src/lib/scheduler.ts               cron/interval parsing + scheduler
src/lib/executionQueue.ts          bounded concurrency
src/lib/variableTypes.ts           typed variable coercion + validation
src/components/DebuggerPanel.tsx   debugger UI
src/components/VersionHistoryModal.tsx  version history + diff UI
tests/enterprise.test.ts           123 assertions
```

**Modified**

```
src/types/workflow.ts              + NodeOutputRecord.attempt
src/lib/executionContext.ts        idempotent recordNodeStart
src/pages/WorkspaceEditorPage.tsx  retry wrapper, debug gate, versioning,
                                   fallback routing, pre-run validation
src/components/ExecutionPanel.tsx  Debug tab -> real debugger
src/components/WorkflowNode.tsx    breakpoint gutter
src/components/WorkflowCanvas.tsx  breakpoint prop threading
scripts/run-tests.mjs              multi-suite runner
package.json                       test / typecheck scripts
```

All new UI props are optional, so any existing mount of `ExecutionPanel`,
`WorkflowCanvas` or `WorkflowNode` still compiles and behaves as before.
