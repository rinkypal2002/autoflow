# Test results

Every command below was executed in this tree, from
`product_v8_branching/product_v8_reviewed/product_v8/`. Exit codes were captured
programmatically, not transcribed. Node v22.22.2, npm 10.9.7, Linux x64.
Dependencies installed with `npm ci` (298 packages).

## Summary

| Command | Result | Detail |
| --- | --- | --- |
| `npm ci` | **Passed** | exit 0, 298 packages |
| `npm run typecheck` | **Passed** | exit 0, 0 errors |
| `npm run test:payload-contract` | **Passed** | exit 0, 33 passed / 0 failed |
| `npm run test:carry-forward` | **Passed** | exit 0, 68 passed / 0 failed |
| `npm run test:enterprise` | **Passed** | exit 0, 123 passed / 0 failed |
| `npm run test:ports` | **Passed** | exit 0, 48 passed / 0 failed |
| `npm run test:vulnerability-triage` | **Passed** | exit 0, **389 passed / 0 failed** (rewritten) |
| `npm test` | **Passed** | exit 0, all five suites, **661 passed / 0 failed** |
| `npm run build` | **Passed** | exit 0, production bundle built in 12.90s |
| `npm run lint` | **Failed (pre-existing)** | exit 1 before and after this work. See below. |
| `npm run contract-drift` | **Not executed** | requires CLI arguments. See below. |
| Live backend call | **Blocked by unavailable backend** | See below. |

Two rows are not clean passes. Both are explained in full rather than omitted.

## Baseline, before any edit

Captured on the unmodified input archive so every number below has something to
be compared against:

| Command | Baseline |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — 68 / 123 / 33 / 48 / 85 = **357 passed, 0 failed** |
| `npm run build` | exit 0, built in 13.55s |
| `npm run lint` | exit 1 — **815 problems (794 errors, 21 warnings)** |

## Per-command detail

### `npm run typecheck` — Passed

```
> tsc -p tsconfig.app.json --noEmit
EXIT=0
```

No errors, no output. Run after every edit in this session, including after the
final type tightening.

### `npm test` — Passed

Aggregate of all five suites, exit 0:

```
  68 passed, 0 failed      (carryForward)
  123 passed, 0 failed     (enterprise)
  33 passed, 0 failed      (payloadContract)
  48 passed, 0 failed      (ports)
  389 passed, 0 failed     (vulnerabilityTriage)
EXIT=0
```

**661 passed, 0 failed.** The four pre-existing suites are unchanged in content
and unchanged in result — 272 assertions, identical to baseline. The
vulnerability suite grew from 85 to 389.

### `npm run test:vulnerability-triage` — Passed (rewritten)

389 assertions across eleven sections:

```
[1]  CATEGORY AND ACTION IDENTITY
[2]  EVERY INTAKE ACTION IS PASS-THROUGH AND CALLS NOTHING
[3]  INTAKE PROPERTIES, DEFAULTS AND HIDDEN SCANNER TYPE
[4]  ALL FOUR WORKFLOWS: Start -> <Scanner> -> Analyze -> End
[5]  DEFAULT previous BINDINGS AND THE BODY TEMPLATE
[6]  MANUAL OVERRIDES AND RE-POINTED BINDINGS
[7]  BOOLEAN false AND NUMERIC 0 SURVIVE THE WHOLE PIPELINE
[8]  DECLARED OUTPUTS ARE BINDABLE BEFORE THE FIRST RUN
[9]  /VulnerabilityScanner AND /engine PROXY REWRITING
[10] MOCKED API ROUND-TRIP
[11] EXISTING ACTIONS REMAIN UNAFFECTED

389 passed, 0 failed
EXIT=0
```

### `npm run build` — Passed

```
dist/index.html                            0.59 kB | gzip:   0.35 kB
dist/assets/index-*.css                  166.08 kB | gzip:  22.67 kB
dist/assets/aiService-*.js                 6.97 kB | gzip:   3.28 kB
dist/assets/serviceRegistry-*.js           8.08 kB | gzip:   3.09 kB
dist/assets/index-*.js                 1,870.22 kB | gzip: 447.30 kB
✓ built in 12.90s
EXIT=0
```

The >500 kB chunk warning is pre-existing and identical at baseline.

### `npm run lint` — Failed, pre-existing, and improved

```
✖ 808 problems (787 errors, 21 warnings)
EXIT=1
```

**This command also fails on the unmodified input archive**, with 815 problems
(794 errors, 21 warnings). It is not a gate this project currently passes: the
errors are overwhelmingly `@typescript-eslint/no-explicit-any` spread across
~40 pre-existing files including `PropertiesPanel.tsx`, `WorkspaceEditorPage.tsx`
and `excelDataset.ts`.

Measured contribution of this work, per file:

| File | Baseline | After | Delta |
| --- | --- | --- | --- |
| `src/data/actions/vulnerabilityTriage.ts` | 1 error | 1 error | 0 |
| `tests/vulnerabilityTriage.test.ts` | 19 errors | 12 errors | **-7** |
| **Project total** | **794 errors** | **787 errors** | **-7** |

The single remaining error in the action module is the pre-existing
`(import.meta as any)?.env?.VITE_ENGINE_URL` cast, unchanged from the previous
revision. Two `Record<string, any>` return types introduced during this work
were removed by typing them as `PropertyContract` and
`Record<string, string | number | boolean>`. In the suite, 25 scattered
`as any` catalogue casts were collapsed into one documented
`type CatalogueEntry = Record<string, any>` alias.

No `@ts-ignore`, `eslint-disable` or broad `any` was used to suppress a real
error anywhere in this work.

### `npm run contract-drift` — Not executed

```
usage: node contract-drift.mjs <registry.ts> <modules-dir> [--json]
EXIT=2
```

This script is a two-argument CLI tool for comparing a backend registry against
a modules directory, not a zero-argument check. It exits 2 with a usage message
when invoked bare — at baseline as well as now. No backend registry path was
supplied because the Java service tree it inspects is not part of this
deliverable. Recorded as **not executed**, not as passed.

### Live backend call — Blocked by unavailable backend

`POST http://localhost:8080/VulnerabilityScanner/api/triage/run` was **not**
executed. The VulnerabilityScanner service is not running in this environment
and is not part of this archive.

The production endpoint is left exactly as it ships — no stub URL, no altered
host, no test-only override.

What *was* verified without it, in section [10] of the suite:

- the URL the executor would call, after the real `toEngineProxyUrl` rewrite:
  `/VulnerabilityScanner/api/triage/run`
- method `POST` and header `Content-Type: application/json`, read from the
  catalogue entry
- the **serialised** request bytes, so the assertion is on JSON rather than on a
  JS object: `"confidenceThreshold":70` (not `"70"`),
  `"enableCrossFileFlow":true` (not `"true"`), no `scannerType`, exactly nine keys
- a representative `ScanResponse` — including a `null` `sanitizerMatched` and a
  populated `pathEvidence` — fed back through the real
  `context.recordNodeOutput(...)`, then read back through
  `{{previous.*}}` and `{{steps.Analyze Vulnerability Verdicts.*}}`
- the complete raw response retained on the execution record

What this cannot prove: that the backend accepts the payload, that
`enableCrossFileFlow` is a field it recognises, or that the paths resolve on the
server's filesystem. Those need the service.

## Requirement coverage

Each numbered requirement from the brief, and where it is asserted.

| # | Requirement | Where | Result |
| --- | --- | --- | --- |
| 1 | The category exists | [1] | Pass |
| 2 | All four scanner actions exist | [1] | Pass |
| 3 | All required action types are exact | [1] | Pass |
| 4 | Every scanner action uses `executionMode: "passthrough"` | [2] | Pass |
| 5 | No scanner input action calls an API | [2] | Pass |
| 6 | Each scanner has the correct hidden `scannerType` | [3] | Pass |
| 7 | Each scanner contains all required properties | [3] | Pass |
| 8 | `sanitizerConfigPath` defaults correctly | [3] | Pass |
| 9 | `language` defaults to `java` | [3] | Pass |
| 10 | `confidenceThreshold` defaults to numeric `70` | [3] | Pass |
| 11 | `enableCrossFileFlow` defaults to boolean `true` | [3] | Pass |
| 12 | Boolean `false` remains false after binding and execution | [6], [7] | Pass |
| 13 | Confidence threshold remains a JSON number | [4], [10] | Pass |
| 14 | The final action uses all nine required API fields | [4], [5] | Pass |
| 15 | The final action does not send `scannerType` | [4], [5], [10] | Pass |
| 16 | The final action uses default `previous` bindings | [5] | Pass |
| 17 | Manual field overrides still work | [6] | Pass |
| 18 | Scanner outputs visible before the first run | [8] | Pass |
| 19 | `pathEvidence` present in the final output schema | [8] | Pass |
| 20 | Teams / Excel / REST / boolean / dropdown unaffected | [11] | Pass |
| 21 | `/engine` proxy rewriting still works | [9] | Pass |
| 22 | `/VulnerabilityScanner` proxy rewriting works | [9] | Pass |

All four required workflows are executed end-to-end in section [4]:

```
Start -> NESS Report Input        -> Analyze Vulnerability Verdicts -> End
Start -> Cisco Report Input       -> Analyze Vulnerability Verdicts -> End
Start -> Check Point Report Input -> Analyze Vulnerability Verdicts -> End
Start -> Checkmarx Report Input   -> Analyze Vulnerability Verdicts -> End
```

Each runs the intake node through the real pass-through path, records its
output through the real execution context, and builds the analysis request
through the real resolve -> interpolate -> parse -> coerce -> validate pipeline.
Two nodes, no extra collectors.

## Failures encountered and fixed

Recorded because a test run with no failures at any point is usually a test run
that is not testing anything.

**1. `a step that has run drops out of the declared catalogue` — Failed, fixed.**

First run of the rewritten suite: 371 passed, 1 failed. The helper recorded the
intake node under id `n-intake` while the canvas fixture placed it as `c0`;
`buildDeclaredCatalogue` filters by recorded `nodeId`, not by step name, so the
executed node never matched. Root cause was in the test fixture, not the source.
Fixed by threading the canvas node id through the helper. Re-run: 372 passed,
0 failed.

**2. Negative control — deliberately induced, then reverted.**

To confirm the assertions were not vacuous, two contract violations were
introduced on purpose: `scannerType` added to the request body template, and the
`enableCrossFileFlow` default flipped to `false`. The suite produced **22
failures**, including `NESS: scannerType is NOT sent`,
`NESS: the request has exactly the nine contract fields` and
`Checkmarx Report Input enableCrossFileFlow default`. Both changes were reverted
and the suite returned to 389 passed, 0 failed.

## Scope of change, verified

A full recursive diff against the pristine input archive
(`diff -rq`, excluding `node_modules` and `dist`) reports exactly five
differing files — three source, two documentation:

```
src/data/actions/vulnerabilityTriage.ts   (rewritten)
src/data/automationCategories.ts          (comment only)
tests/vulnerabilityTriage.test.ts         (rewritten)
CHANGES.md                                (this revision documented)
TEST_RESULTS.md                           (this file)
```

`vite.config.ts`, `package.json`, `package-lock.json`,
`src/pages/WorkspaceEditorPage.tsx`, `src/components/PropertiesPanel.tsx`,
`src/lib/*` and `src/types/*` are byte-identical to the input.

---

## Previous revision's results (superseded)

Retained for provenance. Those numbers describe the five generic collector
actions that this revision removed.


Every command below was executed in this tree, from
`product_v8_branching/product_v8_reviewed/product_v8/`. Exit codes were captured
programmatically, not transcribed. Node v22.22.2, npm 10.9.7, Linux x64.

### Summary

| Command | Result | Detail |
| --- | --- | --- |
| `npm run typecheck` | **Passed** | exit 0, 0 errors |
| `npm run test:payload-contract` | **Passed** | exit 0, 33 passed / 0 failed |
| `npm run test:carry-forward` | **Passed** | exit 0, 68 passed / 0 failed |
| `npm run test:enterprise` | **Passed** | exit 0, 123 passed / 0 failed |
| `npm run test:ports` | **Passed** | exit 0, 48 passed / 0 failed |
| `npm run test:vulnerability-triage` | **Passed** | exit 0, 85 passed / 0 failed (new) |
| `npm test` | **Passed** | exit 0, all five suites, **357 passed / 0 failed** |
| `npm run build` | **Passed** | exit 0, production bundle built |

Nothing in this table is "not executed". Two items are recorded below as
**blocked because an external backend service was unavailable**, and one
environment problem is recorded as **failed and later fixed**.

---

### Failed and later fixed

### Environment: `npm test` and `npm run build` could not run on first attempt

Neither failure was a source defect; both were properties of the archive.

**1. `npm test` — esbuild platform mismatch.** The bundled `node_modules` was
installed on Windows, so it contained `@esbuild/win32-x64` and
`@rollup/rollup-win32-x64-msvc`. `scripts/run-tests.mjs` bundles each suite with
esbuild before running it, so every suite died immediately:

```
You installed esbuild for another platform than the one you're currently using.
    at generateBinPath (.../node_modules/esbuild/lib/main.js:1739:17)
```

**Root cause:** platform-specific optional dependencies cannot be copied between
operating systems. **Fix:** `npm install`, which added the three Linux binaries.

`package.json` and `package-lock.json` were diffed before and after the install
and are **byte-identical — zero lines changed**. No dependency was added,
removed or re-pinned.

**2. `npm run build` — lost executable bit.** The `node_modules/.bin/*` shims
came out of the archive without their executable permission:

```
> vite build
sh: 1: vite: Permission denied
```

**Fix:** `chmod +x node_modules/.bin/*`.

Both fixes are re-applied automatically by a clean `npm install` on any Linux
machine, and neither touches project source. After them, the **baseline was
verified green before a single line was changed**: typecheck 0 errors, 272 tests
passing across the four original suites, build succeeding.

---

### Blocked because an external backend service was unavailable

Recorded explicitly rather than glossed over:

| Item | Status |
| --- | --- |
| Live `POST /VulnerabilityScanner/api/triage/run` | **Blocked.** No VulnerabilityScanner backend was running and no engine host was reachable from this environment. **No live API test is claimed anywhere in this document.** |
| Vite dev-server proxy forwarding for `/VulnerabilityScanner` | **Blocked.** Confirming that the proxy forwards needs both a dev server and a listening backend. The configuration is parsed and accepted by Vite on every `npm run build`, and the client half of the contract — the URL rewrite that produces the path the proxy receives — is covered by 13 assertions in sections [7] and [8] of the new suite. |

**How the request path was tested without the backend.** The final action's
request body is built through the same
`resolveDeep → deepParseWithContract → coerceToContract → validateAgainstContract`
pipeline the executor uses, imported from `src/lib`, and asserted on directly —
so the payload that *would* be sent is verified field by field and type by type
without a socket. The endpoint configuration is left exactly as it ships:
`vite.config.ts` and the action's `api.url` are unmodified by any test, and
nothing is stubbed in source.

---

### Verbatim output

### `npm run typecheck` — Passed (exit 0)

```
> autoflow@1.0.0 typecheck
> tsc -p tsconfig.app.json --noEmit
```

No diagnostics. `tsconfig.app.json` has `strict`, `noUnusedLocals`,
`noUnusedParameters` and `noFallthroughCasesInSwitch` enabled, and none were
relaxed. **No `@ts-ignore`, no `@ts-expect-error`, no broad `any` was introduced
to reach this result**, and no check was disabled.

### `npm run test:payload-contract` — Passed (exit 0)

```
PRE-FLIGHT VALIDATION
  PASS  a missing required field is caught before sending
  PASS  an unresolved binding is flagged
  PASS  a complete payload raises nothing

33 passed, 0 failed
```

### `npm run test:carry-forward` — Passed (exit 0)

```
  PASS  no technical noise in default picker
  PASS  business token present
  PASS  technical token available
==============================================
  68 passed, 0 failed
==============================================
```

### `npm run test:enterprise` — Passed (exit 0)

```
  PASS  duplicate names reported
  PASS  default fills in when value is blank
  PASS  runtime values are coerced
==============================================
  123 passed, 0 failed
==============================================
```

### `npm run test:ports` — Passed (exit 0)

```
  PASS  unported edges on a ported node are an info, not an error
  PASS  an edge from a removed port is an error
  PASS  an unconnected exception port warns about dropped rows
  PASS  both branches into one step is a warning
  PASS  a node with no ports is never reported

48 passed, 0 failed
```

### `npm run test:vulnerability-triage` — Passed (exit 0) — new suite

```
[1] PASS-THROUGH ACTION EXECUTION            ... 7 assertions
[1b] A COLLECTOR CHAIN ACCUMULATES           ... 5 assertions
[2] BOOLEAN false IS PRESERVED               ... 9 assertions
[3] NUMERIC CONFIDENCE THRESHOLD IS PRESERVED... 6 assertions
[4] DECLARED SCANNER OUTPUTS BEFORE FIRST RUN... 9 assertions
[5] DEFAULT previous BINDINGS                ... 14 assertions
[6] MANUAL OVERRIDE OF A BOUND VALUE         ... 6 assertions
[7] VulnerabilityScanner URL REWRITING       ... 7 assertions
[8] EXISTING /engine URL REWRITING UNCHANGED ... 7 assertions
[9] EXISTING ACTIONS REMAIN UNAFFECTED       ... 15 assertions

  PASS  category rest-integration-025 still present with actions
  PASS  category database-plugins-039 still present with actions
  PASS  the excel dataset action still declares its schema
  PASS  and still declares its api url
  PASS  an action without a schema contributes no declared group

85 passed, 0 failed
```

Coverage maps one-to-one onto the nine required areas: pass-through execution
(1, 1b), boolean `false` (2), numeric threshold (3), declared outputs before the
first run (4), default `previous` bindings (5), manual override (6),
VulnerabilityScanner rewriting (7), existing `/engine` rewriting (8), existing
actions unaffected (9).

### `npm test` — Passed (exit 0)

Runs all five suites in sequence:

```
  68 passed, 0 failed     (carryForward)
  123 passed, 0 failed    (enterprise)
  33 passed, 0 failed     (payloadContract)
  48 passed, 0 failed     (ports)
  85 passed, 0 failed     (vulnerabilityTriage)
```

**357 passed, 0 failed.** Baseline before this work was 272 across four suites;
all 272 still pass.

### `npm run build` — Passed (exit 0)

```
vite v7.3.1 building client environment for production...
✓ 2066 modules transformed.
dist/index.html                              0.59 kB │ gzip:   0.35 kB
dist/assets/index-BGNq13D9.css             165.72 kB │ gzip:  22.64 kB
dist/assets/aiService-vHDfLxky.js            6.97 kB │ gzip:   3.29 kB
dist/assets/serviceRegistry-B-mjHmiO.js      8.08 kB │ gzip:   3.09 kB
dist/assets/index-6Mx5q6xn.js            1,868.34 kB │ gzip: 446.92 kB
✓ built in 10.37s
```

The chunk-size advisory is pre-existing and unrelated — it appears identically
in the baseline build. The main bundle grew ~14 kB (1,854.29 → 1,868.34 kB), the
five new actions and two new lib modules.

---

### Mutation check — are the new tests load-bearing?

A suite that passes on the first run is worth distrusting, so the central
invariant was deliberately broken to confirm the tests catch it. In
`buildPassthroughOutput`, the `undefined` guard was replaced with a falsy guard
— the exact bug the function exists to avoid:

```diff
-      if (value === undefined) return;
+      if (!value) return;
```

Result:

```
  FAIL  after four collectors every field is present
  FAIL  the catalogue default is a real false
  FAIL  and it is a boolean, not the string "false"
  FAIL  false overwrites a carried true rather than being skipped
  FAIL  a threshold of 0 survives the merge
  FAIL  the alert flag is carried forward
79 passed, 6 failed
```

Six assertions across three sections caught it. The mutation was reverted and
the suite re-run to `85 passed, 0 failed` before packaging; the shipped source
contains the correct `value === undefined` guard.

---

### Not run

`npm run lint` and `npm run contract-drift` exist in `package.json` but are not
on the required list, and were not run. They are reported here as **not
executed** rather than left unmentioned.
