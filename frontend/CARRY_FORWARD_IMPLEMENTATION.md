# Workflow-Wide Data Carry-Forward — Implementation Report

**Date:** 25 July 2026
**Scope:** Full platform inspection, defect repair, and implementation of true
workflow-wide data carry-forward.

---

## 1. Diagnosis

The platform could not carry data forward between nodes. Three defects in one
data path were responsible.

### 1.1 `inputData` was accepted and then discarded

`handleRunWorkflow` *did* push each node's output into the queue as `inputData`
(old line 1527), and `executeAction` *did* accept it as a parameter (old line
664) — but the parameter was never read anywhere in the function body except to
be echoed back for Start/End control nodes.

The interpolation context was built exclusively from `variableMap` plus the
node's **own** properties (old lines 745–807). No node could see any other
node's output. Not "only the next node" — **no** node.

### 1.2 The output store was write-only by construction

```ts
const [, setExecutionData] = useState<Map<string, any>>(new Map());
```

The getter was discarded at the destructure. Every `setExecutionData(...)` call
in the run loop wrote into a Map that nothing in the application could read.

### 1.3 The resolver could not traverse paths

The old `interpolate()` performed a flat `context[key]` lookup. `{{previous.employeeId}}`
and `{{steps.ReadEmployeeExcel.employeeId}}` were not *failing* to resolve —
they were never resolvable in principle. No dot traversal, no namespaces, no
fallbacks, no filters.

### 1.4 Secondary defects found and fixed

| Defect | Impact | Resolution |
|---|---|---|
| `new Function('data', cond)` for connection conditions | Arbitrary code execution from a saved workflow; condition saw only the immediate output | Replaced with the sandboxed `evaluateCondition`, evaluated against the full run scope |
| Run loop read `actions` / `variables` from a stale closure | Edits made mid-run were invisible to the executor | Mirrored into refs (`actionsRef`, `variablesRef`, `connectionsRef`) |
| Logs carried no node name, duration or phase | "Step Metrics" tab could only ever render `--` | Structured `WorkflowLogger` with correlation, phase and duration |
| No snapshot or recovery layer | An interrupted run lost everything | Two-tier snapshot persistence + backend runs API |
| `Stop` reset every node status | Destroyed the evidence of what had run | Cooperative stop; statuses and context preserved |
| **9 pre-existing TypeScript errors** | The project did not compile | All fixed (see §5) |

---

## 2. Architecture

```
                    ┌──────────────────────────────┐
                    │  WorkflowExecutionContext    │
                    │  ──────────────────────────  │
   writes  ────────▶│  variables                   │────────▶  reads
  (recordNodeOutput)│  nodeOutputs  (id + stepKey) │       (buildScope)
                    │  previous                    │
                    │  runtime / files / api /     │
                    │  db / text / computed        │
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     expression.ts         bindingSources.ts     executionSnapshot.ts
   (resolve bindings)    (what the UI offers)   (persist / recover)
              │                    │                    │
              ▼                    ▼                    ▼
      executeAction        PropertiesPanel        backend /runs API
                            BindingPicker
                           ExecutionPanel
```

The **same** context object feeds execution, the UI picker, the inline preview
and the persisted snapshot. There is no second implementation to drift.

### 2.1 Execution rules

1. **Before** each node runs, its payload is resolved from `ctx.buildScope()`.
2. **After** each node completes, `ctx.recordNodeOutput()` writes its output back.
3. That output is then reachable by **every** later node, on any branch, for the
   rest of the run.
4. A snapshot is persisted after every node.

### 2.2 Scope precedence

For a **bare** `{{key}}`, later layers win:

1. every earlier node's output, oldest → newest (newest wins)
2. the previous node's output
3. runtime scratch values
4. workflow variables
5. **the current node's own resolved properties**

Properties are layered last **deliberately**. This preserves the platform's
existing behaviour exactly — an `api.body` template referencing `{{propertyName}}`
still binds to that node's own field — while carry-forward fills in every key the
node did not define for itself. **No existing plugin changes behaviour.**

Namespaced tokens (`previous.x`, `steps.X.y`, `vars.z`) bypass precedence
entirely and always address exactly what they name.

### 2.3 Binding syntax

| Pattern | Meaning |
|---|---|
| `{{employeeId}}` | Bare key, resolved through the layered scope |
| `{{previous.employeeId}}` | Immediately preceding node's output |
| `{{steps.ReadEmployeeExcel.employeeId}}` | Any earlier node, by name |
| `{{steps['Read Employee Excel'].rows[0].name}}` | Quoted name + array index |
| `{{nodes.<nodeId>.output.total}}` | Any earlier node, by id |
| `{{vars.tenantId}}` / `{{variables.x}}` | Workflow variables |
| `{{runtime.cursor}}` / `{{files.report}}` | Runtime buckets |
| `{{run.id}}` / `{{workflow.name}}` / `{{now}}` | Run metadata |
| `{{a.b \|\| 'fallback'}}` | Fallback chain (`\|\|` and `??`) |
| `{{name \| upper}}` | Filters: `upper` `lower` `trim` `title` `json` `pretty` `parse` `number` `int` `round` `bool` `length` `first` `last` `keys` `values` `join` `split` `encodeUri` `isoDate` `default` |
| `{{steps.X.$status}}` | Node **execution** status (reserved `$` prefix) |

A whole-string token preserves its native type, so a node can bind an entire
object or array. Mixed strings interpolate to text.

**No `eval`, no `new Function`.** A malformed or malicious binding can only
resolve to nothing; it can never execute code.

---

## 3. File manifest

### 3.1 New files

| File | Lines | Purpose |
|---|---:|---|
| `src/lib/objectUtils.ts` | 473 | Path parse/get/has/set, safe deep clone, flattening, deep merge, secret redaction, storage truncation, step-key slugs |
| `src/lib/expression.ts` | 611 | The resolver: tokens, paths, namespaces, fallbacks, filters, sandboxed conditions |
| `src/lib/executionContext.ts` | 624 | The carry-forward store and `buildScope()` |
| `src/lib/workflowLogger.ts` | 195 | Correlated structured logging with redaction |
| `src/lib/executionSnapshot.ts` | 238 | Two-tier snapshot persistence (localStorage + backend) |
| `src/lib/bindingSources.ts` | 369 | Upstream-graph-aware catalogue of bindable values |
| `src/components/BindingPicker.tsx` | 363 | Binding picker, expression editor, inline preview |
| `src/types/fileSystem.ts` | 35 | Single `LocalFileHandle` declaration (was duplicated) |
| `tests/carryForward.test.ts` | 83 | 31 assertions against the real modules |
| `scripts/run-tests.mjs` | 30 | Test runner (`npm run test:carry-forward`) |

### 3.2 Modified files

| File | Before → After | Change |
|---|---|---|
| `src/pages/WorkspaceEditorPage.tsx` | 2255 → 2515 | Executor rewritten around the context; run loop rewritten; cooperative stop; panel wiring |
| `src/components/PropertiesPanel.tsx` | 3456 → 3467 | Binding picker + inline preview; bound numeric fields; 2 baseline errors fixed |
| `src/components/ExecutionPanel.tsx` | 485 → 647 | Data Context inspector tab; real Step Metrics |
| `src/types/workflow.ts` | 383 → 515 | `NodeOutputRecord`, `ExecutionScope`, `ExecutionSnapshot`, `BindingSource`, `BindingSourceGroup`, `OutputBucket` |
| `backend/server.js` | 1757 → 1962 | Four run-snapshot endpoints |
| `src/services/serviceCache.ts` | 220 → 224 | Baseline error: `.unref()` on a browser timer |
| `src/services/serviceRegistry.ts` | 426 → 428 | Baseline error: `process` in a browser bundle |
| `src/services/serviceSelector.ts` | 184 → 184 | Baseline error: `process` in a browser bundle |
| `src/services/aiService.ts` | 421 → 421 | Baseline errors: unused binding, implicit `any` |
| `package.json` | — | Added `test:carry-forward` script |

**Every other file in the platform is untouched.**

---

## 4. UI

- **Binding picker** — grouped and searchable (Variables / Previous Node / Any
  Step / Runtime), each entry showing its token, type and last known value.
  Only offers values that will actually exist when the node runs, computed from
  the connection graph.
- **Expression editor** — per-token resolution feedback: which bindings resolve,
  what they resolve to, which do not.
- **Inline preview** — under every bound field, the resolved value. No hidden
  mapping.
- **Bindable numeric fields** — a `number` field holding `{{previous.count}}`
  switches to text input so the token survives.
- **Data Context inspector** — live tree of variables and per-node outputs, with
  click-to-copy tokens.
- **Step Metrics** — real sequence, status, duration, input and output.

---

## 5. Backend API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/workspace/workflows/:id/runs` | Persist (upsert) a snapshot |
| `GET` | `/api/workspace/workflows/:id/runs` | List runs, newest first (metadata only) |
| `GET` | `/api/workspace/workflows/:id/runs/:runId` | Fetch one full snapshot |
| `DELETE` | `/api/workspace/workflows/:id/runs/:runId` | Delete one snapshot |

Stored at `<workspace>/.runs/<workflowId>/<runId>.json`. Zod-validated,
8 MB cap, 25-run retention, path-traversal rejected on both id segments.

---

## 6. Verification

| Check | Baseline | After |
|---|---|---|
| `tsc --noEmit` (strict, `noUnusedLocals`, `noUnusedParameters`) | **9 errors** | **0 errors** |
| `vite build` | — | Succeeds (16.8s) |
| Backend boot | ok | ok |
| Runs API | did not exist | All 4 verified, incl. traversal + bad-payload rejection |
| Carry-forward suite | — | **31 / 31 passing** |

```
npm install
npm run test:carry-forward
```

### 6.1 Two real bugs the suite caught

Both were found by the tests and fixed before delivery:

1. **Execution metadata shadowed node payloads.** An HTTP node returning
   `{ status: 200 }` had `{{previous.status}}` resolve to `"completed"` — the
   engine's internal status. The payload now wins; execution metadata moved to a
   reserved `$` prefix (`$status`, `$error`, …).
2. **Filters could not supply defaults for missing paths.**
   `{{missing | default:'n/a'}}` returned the raw token instead of `'n/a'`.

---

## 7. Known issues NOT introduced by this work

- **ESLint crashes.** `eslint@9.34` against the pinned `@typescript-eslint`
  plugin throws `TypeError: ... reading 'allowShortCircuit'`. Verified
  pre-existing: it fails identically on the untouched `src/App.tsx`. Left alone
  because fixing it means bumping dependency versions, which risks breaking
  working modules. It does not affect `tsc` or `vite build`.
- **CSS build warning.** ~~A template literal inside a Tailwind gradient
  produces `Expected identifier but found "var("`.~~ **Fixed** in the
  carry-forward cleanup pass — see section 9.4.
- **Bundle size warning.** The main chunk exceeds 500 kB. Pre-existing;
  addressing it means code-splitting, which is out of scope here.

---

## 8. `node_modules`

The delivered archive contains **complete source, minus `node_modules`**, which
is a build artifact restored by `npm install` (root and `backend/`).

This is not only a size decision. The vendored copy in the uploaded archive was
installed on **Windows** and lacks the Linux-native binaries
(`@rollup/rollup-linux-x64-gnu`, `@esbuild/linux-x64`) — the build fails against
it on any non-Windows machine. A clean `npm install` on the target platform is
the correct restoration path.

```bash
npm install                 # frontend
cd backend && npm install   # backend
npm run dev                 # frontend dev server
cd backend && npm start     # backend
```

---

## 9. Carry-forward cleanup — business data vs technical detail

Carry-forward worked, but it carried *everything*. A REST step returning

```json
{ "success": true, "statusCode": 200, "message": "Success",
  "data": { "employeeId": "E101", "name": "Umesh", "department": "IT" } }
```

put `success`, `statusCode`, `message` and `data.*` into the picker and the
preview alongside the three fields a person actually wanted. Preview Data made
it worse: it rendered `[...logs].reverse().find(l => l.data)` — the last log
line that happened to carry a payload — as one raw JSON blob.

### 9.1 The rule

One module, `src/lib/carryForward.ts`, decides what is business data and what is
transport detail. Everything else reads from it, so the picker, the preview and
the resolver cannot disagree.

- **Envelope unwrapping.** A wrapper is stripped only when the payload key holds
  a plain object *and* every sibling is wrapper noise. `{ id, data }` is left
  alone — `id` is real business data, so that object is the payload.
- **Classification.** Allow-list first (`employeeId`, `rowsAffected`,
  `insertedId`, `filePath`, `messageId`, `extractedText`, `confidence`, …),
  then deny-list (`success`, `statusCode`, `headers`, `rawJson`, `stackTrace`,
  `executionTime`, `metadata`, …), then patterns. `status` and `code` are judged
  by value: `status: 200` is technical, `status: "Open"` is not.
- **Bounded.** Depth 3, 30 fields, blanks dropped. Arrays are summarised as
  `Array(n)` with the first row reachable through `rows.first.name`, never
  expanded row by row. No payload can produce hundreds of visible entries.

### 9.2 Nothing was removed from the runtime

`buildScope()` layers the unwrapped payload into each step view **below** the
raw payload:

```
metadata → business layer → raw payload → $ accessors
```

The raw payload is applied last, so a step's own response always wins a name
collision. Every token that resolved before still resolves:

| Token | Result |
|---|---|
| `{{steps.Read Employee Excel.employeeId}}` | `"E101"` — new, unwrapped |
| `{{steps.Read Employee Excel.data.employeeId}}` | `"E101"` — original path |
| `{{steps.ReadEmployeeExcel.department}}` | `"IT"` — step-key form |
| `{{steps.Read Employee Excel.statusCode}}` | `200` — technical, still bindable |
| `{{steps.Read Employee Excel.$business}}` | the clean record |
| `{{previous.$technical.executionTime}}` | the wrapper |

Transport values are demoted out of the *default view*, not deleted. A saved
workflow binding `{{statusCode}}` keeps working.

### 9.3 UI

- **Preview Data** is a step table built from `NodeOutputRecord[]`: step number,
  name, plugin/action, status, time, duration, output summary and key business
  fields, one row per executed step. Search covers step name, plugin name, field
  name and value; status chips filter; rows expand to a field/value/type/token
  table with copy-token and copy-value; technical detail and raw JSON sit behind
  a second disclosure that is closed by default. CSV export included.
- **Binding picker** groups as Variables · Previous Step · Workflow Steps ·
  Runtime · **Technical Details**, the last folded behind a quiet chip. A search
  matching only technical values says so instead of reporting no results.
- **Developer Mode** in the Execution Results header opens every technical
  section at once.
- Variables now emit `{{variables.Name}}` rather than bare `{{Name}}`; a bare
  token can be shadowed by a step's own property, the namespaced form cannot.
  Bare tokens already saved keep resolving.

### 9.4 Fixed along the way

`src/components/Sidebar.tsx` built five Tailwind classes from a template
literal (`bg-[` + `${SURFACE}` + `]`). Tailwind's JIT scans source statically,
so it emitted rules containing the raw text and the sidebar surface colour never
reached the DOM — the source of the CSS build warnings noted in section 7. The
hex is now a literal in each class; the build is warning-free.

### 9.5 Verification

```
npm run test:carry-forward     67 passed, 0 failed   (31 pre-existing + 36 new)
npx tsc --noEmit -p tsconfig.app.json                 clean, strict + noUnused*
vite build                                            built, 0 warnings
```

The suite runs against the real `src/lib` modules, so it exercises the code the
executor uses. Sections [8]–[10] cover envelope unwrapping, classification,
backward-compatible resolution, preview rows, search and catalogue grouping —
including an assertion that no technical token leaks into the default picker.
