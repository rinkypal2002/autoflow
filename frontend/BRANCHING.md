# Named Output Ports — Branching

**Verified on this tree:** `tsc --strict` 0 errors · 272 tests passing
(68 carry-forward, 123 enterprise, 33 payload-contract, 48 ports) ·
`vite build` succeeds.

---

## 1. What was wrong

`Filter Rows` already returned both halves. The plugin populates `data` (kept
rows) and `unmatchedData` (rejected rows), and `outputSchema` declared both.
**Nothing was being discarded.**

The defect was in routing. The run loop pushed the same value down every edge:

```ts
executionQueue.push({ nodeId: connection.targetId, inputData: actionOutput });
```

`Connection.sourcePort` existed in the schema and was editable in the Connection
modal, and **nothing read it** — the same class of dead configuration as the
`retries` / `fallbackActionId` fields the Phase 4 audit found.

The consequence was not a crash. It was worse than a crash: the unmatched branch
worked only if the author remembered to bind `{{previous.unmatchedData}}` rather
than `{{previous.data}}`. Get it wrong and **both bindings still resolve**, so an
exception report quietly reports on the rows that succeeded. Nothing warns you,
because from the engine's point of view nothing went wrong.

### The second defect

`previous` meant "the last node executed anywhere in the run", not "the node
upstream of me". In a fan-out:

```
Filter Rows ──▶ Matched Data
            └─▶ Unmatched Data
```

the queue runs `Matched Data` first, so by the time `Unmatched Data` runs the
most recent record is Matched's — and `{{previous.data}}` inside the unmatched
branch resolved against **the wrong step**. It resolved cleanly, which is what
made it dangerous. This affected every branching workflow.

---

## 2. The compatibility rule

> **A connection with no `sourcePort` receives the node's entire output, byte for
> byte as before.**

This is the whole backward-compatibility story and it is deliberately blunt.
Every saved workflow on disk has `sourcePort` unset, so every saved workflow
keeps its exact data flow — including `{{previous.data}}` bindings already
written against the full envelope. Ports change behaviour only for edges drawn
from a named handle, which cannot exist in a file written before this feature.

The cleaner-looking alternative — making the primary port implicit, so an
unported edge on a Filter node starts receiving only the matched slice — was
rejected. It would make `{{previous.data}}` resolve to `undefined` on every
existing Filter workflow, because `previous` *would be* the rows. Ports are
opt-in per edge for that reason. Six tests in section [2] of
`tests/ports.test.ts` exist solely to hold that line.

---

## 3. What a port is

`OutputField` and `OutputPort` answer different questions and both are needed:

| | Question | Effect |
|---|---|---|
| `OutputField` | "What may I reference?" | **Bindable** — appears in the picker |
| `OutputPort` | "Where does execution leave?" | **Routable** — draws a handle, carries a slice |

Filter Rows declares `unmatchedData` as a *field* so any later step can inspect
it, and as a *port* so an exception branch can be driven by it without the author
knowing the field's name.

```ts
outputPorts: [
  { id: 'matched',   label: 'Matched',   payloadPath: 'data',
    isDefault: true, tone: 'primary' },
  { id: 'unmatched', label: 'Unmatched', payloadPath: 'unmatchedData',
    tone: 'exception', skipWhenEmpty: true },
]
```

`payloadPath` is relative to the **business** payload — the same frame
`OutputField.path` uses — so a plugin wrapping its result in
`{ success, message, data: { … } }` declares `rows`, not `data.rows`. The wrapper
is stripped with the same `unwrapEnvelope` the carry-forward layer uses, so the
two agree by construction rather than by convention.

### Steps that declare ports today

| Step | Ports |
|---|---|
| Filter Rows | `matched` → `data` · `unmatched` → `unmatchedData` |
| Validate Rows | `valid` → `data` · `invalid` → `rejectedRows` |

Both are built from one shared `passRejectPorts()` helper, so the semantics
cannot drift between them. An author who learns that the lower amber handle
means "rows a person still has to look at" finds that true of every splitting
step, not just the one they learned it on.

---

## 4. Nothing is hidden

A port narrows what a branch **receives by default**. It never removes a value
from the run context. After routing down the matched edge, a downstream step can
still reach everything:

```
{{steps.FilterRows.unmatchedData[0].Project}}   the other branch, by step name
{{previous.$output.unmatchedRowCount}}          the complete upstream payload
{{previous.$port}}                              which branch delivered this
```

"Do not discard unmatched rows" is enforced by construction, and asserted by
test.

---

## 5. Empty branches

A port may declare `skipWhenEmpty`, so a clean run does not fire a nightly
exception report containing nothing — the classic complaint against generated
process automation. Three guards keep it from surprising anyone:

1. **Opt-in per port**, never inferred.
2. **Countable slices only.** A branch carrying a scalar or an object is never
   suppressed, because "empty" is not defined for it. `countPortRecords`
   deliberately distinguishes `0` ("carries rows, there are none") from `null`
   ("rows are not a concept here") and only the first may suppress.
3. **Overridable per edge** with `metadata.routeWhenEmpty` for the genuine
   "always send the report, even if it says zero" case.

The run log states it plainly: `Branch not taken: Filter rows → CSV Report.
Unmatched carried 0 records — branch not taken.`

---

## 6. Validation

`validatePortWiring(actions, connections)` reports:

| Severity | Condition |
|---|---|
| error | Edge routes from a port the step no longer declares |
| warning | Exception port unconnected — *rows dropped without review* |
| warning | Two branches into the same step — *it will run twice* |
| info | Ported step whose edges are all unported (pre-upgrade shape) |

All advisory. The executor never consults it and nothing blocks a run: a
half-wired workflow is a normal state while someone is building, and a tool that
refuses to run one is a tool people work around.

---

## 7. Files

**New**

- `src/lib/ports.ts` — port discovery, payload slicing, routing decisions,
  wiring validation. Pure: no React, no DOM, no side effects.
- `tests/ports.test.ts` — 48 tests, backward compatibility first.

**Modified**

| File | Change |
|---|---|
| `src/types/pluginContract.ts` | `OutputPort` type; `outputPorts` on the contract |
| `src/types/workflow.ts` | `branches` on `NodeOutputRecord` |
| `src/lib/executionContext.ts` | Branch-aware `previous`; captures branch counts |
| `src/lib/carryForward.ts` | Carries `branches` onto the preview row (3 lines) |
| `src/pages/WorkspaceEditorPage.tsx` | Port-aware routing; branch provenance in the queue |
| `src/data/actions/dataTransformOperations.ts` | Ports on Filter and Validate |
| `src/components/WorkflowNode.tsx` | `PortHandle` — one labelled handle per port |
| `src/components/WorkflowCanvas.tsx` | Per-port edge geometry and tone |
| `src/components/ConnectionLine.tsx` | Amber for exception branches |
| `src/components/ConnectionPropertiesModal.tsx` | Port dropdown derived from the step |
| `src/components/ExecutionPanel.tsx` | Branch counts on the step result |
| `package.json` | `test:ports`; added to `test` |

---

## 8. Not changed, deliberately

**Server-side execution.** The engine still runs in the browser, so closing the
tab still kills a run and `lib/scheduler.ts` still dies with it. That is a
re-architecture, not a repair.

**Response envelope shapes.** `carryForward.ts` still reverse-engineers seven
backend envelopes. Normalising them changes what every existing binding resolves
to — a migration, not a patch.

**Other multi-output steps.** `Join`, `Lookup` and `Deduplicate` all have a
natural second branch (unmatched keys, missed lookups, the duplicates that were
dropped) and none declare ports yet. Adding them is now a data change in
`dataTransformOperations.ts` — no engine work — but each needs its backend
response confirmed first, and I did not confirm them.

---

## 9. Environment note

The delivered ZIP previously contained a 166 MB `node_modules` built on Windows,
despite `.gitignore` excluding it. Its `esbuild` binary is `win32-x64`, so
`npm test` fails on any Linux or CI machine with a platform error. This ZIP ships
without it.

```bash
npm ci        # or npm install
npm test
npm run build
```
