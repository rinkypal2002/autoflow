# Frontend changes

## Vulnerability Triage & Analysis — scanner intake actions (latest revision)

Replaces the five generic vulnerability collector actions from the previous
revision with the four scanner-report intake actions and the one verdict
analysis call this project actually requires.

Verified on this tree: `npm run typecheck` (0 errors), `npm test`
(**661 passed, 0 failed** across five suites), `npm run build` (production
bundle built). See `TEST_RESULTS.md` for per-command output and exit codes.

### What changed in this revision

Three files differ from the previous revision. Nothing else in the tree was
touched — verified by a full recursive diff against the pristine input archive:

| File | Change |
| --- | --- |
| `src/data/actions/vulnerabilityTriage.ts` | Rewritten. Five new actions, new category identity, new declared outputs, explicit request body. |
| `src/data/automationCategories.ts` | Comment only — the registration block now describes the intake/analysis shape. The two lines of registration logic are unchanged. |
| `tests/vulnerabilityTriage.test.ts` | Rewritten and expanded: 85 -> **389 assertions**. |

The following were already correct in the input archive and are **preserved
unchanged**, not rebuilt:

| File | Why it needed no change |
| --- | --- |
| `src/types/pluginContract.ts` | `ActionExecutionMode` and the optional `executionMode` field already exist. |
| `src/lib/executionMode.ts` | The generic pass-through helpers already exist and already handle the `false` / `0` / `''` cases correctly. |
| `src/pages/WorkspaceEditorPage.tsx` | The single generic pass-through branch and the mode-aware API guard already exist. **No scanner-specific branch was added.** |
| `src/components/PropertiesPanel.tsx` | Boolean, dropdown and number binding branches already token-aware; `hidden: true` already honoured before render *and* before validation. |
| `src/lib/engineProxyUrl.ts` | Already rewrites both `/engine` and `/VulnerabilityScanner`. |
| `vite.config.ts` | The `/VulnerabilityScanner` proxy already exists, driven by the same `ENGINE_BACKEND` as `/engine`. No duplicated hardcoded target was introduced. |
| `package.json` | `test:vulnerability-triage` already registered and already part of `npm test`. |

### Removed: the superseded generic actions

These five action types are gone from the catalogue entirely. The suite asserts
their absence rather than merely not referencing them:

```
vulnerability-scan-context
vulnerability-source-inputs
vulnerability-triage-policy
vulnerability-triage-options
vulnerability-triage-run
```

They split one request across four configuration nodes, which made the minimum
viable workflow five nodes long. Their two workflow-policy fields —
`alertOnHighConfidenceTp` and `reportAutoClosedFindings` — are removed with
them; they were never part of the request contract.

### Added: four scanner intake actions

| Type | Name | `scannerType` |
| --- | --- | --- |
| `vuln-report-ness-input` | NESS Report Input | `NESS` |
| `vuln-report-cisco-input` | Cisco Report Input | `CISCO` |
| `vuln-report-checkpoint-input` | Check Point Report Input | `CHECKPOINT` |
| `vuln-report-checkmarx-input` | Checkmarx Report Input | `CHECKMARX` |

Each is **self-sufficient**: it collects all ten values and carries them
forward, so this is a complete workflow —

```
Start -> Checkmarx Report Input -> Analyze Vulnerability Verdicts -> End
```

No Scan Context / Source Inputs / Policy / Options nodes are required. All four
workflows are executed end-to-end in the suite.

The four are generated from a single `SCANNERS` table, so they cannot drift
apart, but each is built with its **own** `propertyConfig` object rather than a
shared reference — a shared mutable object is one accidental in-place edit away
from changing four actions at once. The suite asserts the four objects are
distinct.

Adding a fifth scanner is one row in `SCANNERS` and no change to any executor,
panel or lib file.

#### Properties collected by each intake action

`scannerType` (hidden constant), `scanId`, `project`, `reportPath`,
`repositoryPath`, `sanitizerConfigPath`, `outputDirectory`,
`confidenceThreshold`, `enableCrossFileFlow`, `language`.

Grouped in the panel as **Scan Identification** / **Report & Repository** /
**Analysis Settings** / **Output**, using the existing grouped property-panel
system.

Defaults: `sanitizerConfigPath` = `classpath:rules/sanitizers.yml`,
`confidenceThreshold` = numeric `70`, `enableCrossFileFlow` = boolean `true`,
`language` = `java`. Every path field starts **blank** — the HDFC paths appear
only as placeholders, never as values, because one customer's directory layout
is silently wrong on every other machine.

`reportPath` is a text input, not a file picker: the backend opens the path
itself, on its own filesystem. A browser upload would produce bytes the service
was never asked for and a name it cannot resolve.

`scannerType` is configured `hidden: true`, so the panel keeps it out of the
form *and* out of validation — including for older saved nodes that snapshotted
the field.

### Added: the verdict analysis action

`vuln-analyze-verdicts` — "Analyze Vulnerability Verdicts",
`executionMode: 'api'`, `complexity: 'advanced'`, `estimatedTime: 10000`,
`timeout: 300000`, `retryable: true`, icon `ShieldCheck`, colour
`bg-emerald-500`.

```
POST http://localhost:8080/VulnerabilityScanner/api/triage/run
Content-Type: application/json
```

### Pass-through execution behaviour

The four intake actions declare `executionMode: 'passthrough'` and carry **no
`api` object at all** — deliberately absent rather than set to a placeholder
URL, because a URL nobody calls is a lie that eventually gets called.

They run through the existing generic branch in `executeAction`, which is
unchanged and contains nothing scanner-specific. That branch already:

1. hydrates the action from the service registry (`resolveService`, which is
   collision-safe by category — the five new types are globally unique anyway);
2. builds the scope with `context.buildScope(...)`;
3. resolves bindings with `resolveDeep`;
4. parses with `deepParseWithContract`;
5. coerces with `coerceToContract`;
6. validates with `validateAgainstContract`;
7. never calls `fetch`;
8. builds a flat output with `buildPassthroughOutput`;
9. stores it with `context.recordNodeOutput(...)`;
10. publishes it to `previous`, `steps`, the binding picker and the inspector.

The `No API defined for this action` guard is mode-aware, so it fires only for
`api` actions. The suite asserts this for each of the four placed intake nodes,
and asserts the guard still fires for an `api` action with no URL.

### Binding behaviour

Every one of the nine request fields is bindable, on both the intake actions and
the analysis action.

- **Boolean** (`enableCrossFileFlow`, `uiType: 'switch'`) — the panel's existing
  boolean branch detects a token with `containsToken` and swaps the toggle for
  the verbatim token plus a `BindingPreview`, with a clear-binding control that
  restores an explicit `false`. `Boolean("{{...}}")` is never used. The suite
  proves a bound `false` reaches the wire as JSON `false`.
- **Select** (`language`) — a bound value is preserved verbatim even though it
  is not one of the eight options, shown with a preview, and clearable back to
  manual selection. `CustomDropdown`'s upper-casing no longer mangles the token.
- **Number** (`confidenceThreshold`) — declared `type: 'number'`, so a
  whole-token binding keeps its native type and hand-typed text is coerced.
  `{{previous.confidenceThreshold}}` serialises as `70`, not `"70"`.

These panel behaviours were already present and correct in the input archive;
this revision preserves them and adds regression coverage.

### Typed request handling

The request body is an **explicit template** on `api.body` rather than an
implicit "send the resolved properties":

```ts
{
  scanId: '{{scanId}}',
  project: '{{project}}',
  reportPath: '{{reportPath}}',
  repositoryPath: '{{repositoryPath}}',
  sanitizerConfigPath: '{{sanitizerConfigPath}}',
  outputDirectory: '{{outputDirectory}}',
  confidenceThreshold: '{{confidenceThreshold}}',
  enableCrossFileFlow: '{{enableCrossFileFlow}}',
  language: '{{language}}',
}
```

Written explicitly so the wire contract is legible in one place and cannot
silently acquire a field. It is typed `Record<keyof TriageRunRequest, string>`,
so a field added to the contract without a template entry fails to compile.

`{{name}}` resolves against the node's own resolved properties, which the
executor layers in as `selfValues`. Types survive by the existing pipeline —
`resolveDeep` -> `deepParseWithContract` -> `coerceToContract` ->
`validateAgainstContract`. **No vulnerability-specific type conversion was
added.**

`scannerType` is carried forward by every intake action (so a downstream step or
connection condition can branch on which scanner produced a report) but is
deliberately **not** in the template: the backend contract does not declare it.

`TriageRunRequest` is declared as `interface TriageRunRequest extends
TriageRequest` against the documented eight-field contract in
`src/pages/agents/types.ts`, adding only `enableCrossFileFlow`. Declaring it by
extension rather than restatement means it stops compiling if the documented
contract changes. It is declared in the action module rather than by widening
`TriageRequest`, because the standalone agent page's form does not offer the
flag and that page is out of scope for this work.

### Default previous-node bindings

All nine properties on the analysis action default to `{{previous.<field>}}`.
No default names a node, so renaming an upstream step cannot break a workflow,
and nothing assumes the upstream scanner is Checkmarx — all four intake actions
produce the same field names.

These are defaults only. The suite proves a user can still replace any field
with a literal, a workflow variable, a different earlier node
(`{{steps.<Name>.<field>}}`), or anything chosen in `BindingPicker`, and that a
hand-typed numeric string is reconciled rather than rejected.

### Declared outputs

Each intake action declares all ten collected fields through the existing
`outputSchema` structure, so every field is bindable **before the workflow has
ever run** — `buildDeclaredCatalogue` offers
`{{steps.Checkmarx Report Input.scanId}}` on a blank canvas. The suite asserts
all ten, for all four actions, with zero execution records.

The analysis action declares `scanId`, `project`, `generatedAt`, `summary` (both
as a whole object and as its five counts), and `findings` with `itemFields` for
`id`, `rule`, `severity`, `file`, `line`, `verdict`, `confidence`, `reason`,
`sanitizerMatched` and `pathEvidence`.

Two details taken from the real contract rather than guessed:

- `sanitizerMatched` is `string | null` in `Finding`, so it is declared
  `kind: 'string'` **and** `optional: true` — not invented as a boolean.
- `pathEvidence` is `PathEvidence[]`, declared as an array with its real element
  shape (`file`, `line`, `nodeType`, `symbol`, `methodFqn`, `code`).

No output report path is declared, because the response does not return one.
The suite asserts no such field was fabricated.

The complete raw response is retained by the execution record, so the inspector
and the technical binding group still show everything.

### Proxy configuration

`vite.config.ts` is unchanged. It already proxies `/api` -> `NODE_BACKEND` and
both `/engine` and `/VulnerabilityScanner` -> `ENGINE_BACKEND`, all env-driven.

`src/lib/engineProxyUrl.ts` is unchanged and already rewrites
`http://localhost:8080/VulnerabilityScanner/api/triage/run` ->
`/VulnerabilityScanner/api/triage/run`, and the existing `/engine/...` form
identically. The rewrite is narrow (localhost / 127.0.0.1 only), idempotent,
non-string safe, and case-normalising. All of this is re-asserted by the suite,
including against the catalogue's own URL.

### Backward-compatibility protections

Asserted in the suite, not merely intended:

- No pre-existing action declares an `executionMode`; every one still resolves
  to `'api'`; none became pass-through.
- `workflow-control-001`, `microsoft-teams-010`, `excel-automation-011`,
  `data-transform-017`, `rest-integration-025` and `database-plugins-039` are
  all still present and populated.
- The Excel `read-dataset` action still declares both its output schema and its
  API URL.
- Pre-existing boolean and dropdown fields across the catalogue still exist and
  no dropdown lost its options.
- An action with no `outputSchema` still contributes no declared binding group.
- Each of the five new action types is globally unique across all categories.

Also held to: no conditional React hooks were introduced (no React file was
modified at all), `WorkspaceEditorPage.tsx` and `PropertiesPanel.tsx` were not
replaced or reduced, no second binding system / expression syntax / execution
context / output catalogue / property panel / API executor was created, no
workflow node IDs are hardcoded, and no duplicate replacement source files were
added.

The action module contributes exactly **one** `no-explicit-any` lint error —
the same pre-existing `import.meta` cast the previous revision had. Project-wide
lint errors went **down** from 794 to 787; see `TEST_RESULTS.md`.

---

## Previous revision (superseded)

The previous revision's notes are retained below for provenance. Its five
generic collector actions no longer exist; the executor, panel, lib and proxy
work it describes does, and is preserved unchanged by this revision.


### Vulnerability triage — pass-through execution + scanner actions (latest)

Brings the SAST triage scanner into the workflow builder as five actions, and
adds the one executor capability that made them possible: a step that completes
without calling an endpoint.

Verified on this tree: `npm run typecheck` (0 errors), `npm test`
(357 passed, 0 failed across five suites), `npm run build` (production bundle
built). See `TEST_RESULTS.md` for per-command output.

### Files modified

| File | Change |
| --- | --- |
| `src/types/pluginContract.ts` | Added `ActionExecutionMode` (`'api' \| 'passthrough'`) and the optional `executionMode` field on `PluginContract`. `WorkflowAction extends Partial<PluginContract>`, so this one addition types both saved nodes and catalogue entries. |
| `src/pages/WorkspaceEditorPage.tsx` | Made the API guard mode-aware; added a single pass-through completion branch; extracted `publishNodeOutputs`; replaced the inline `toEngineProxyUrl` with an import of the shared module. |
| `src/components/PropertiesPanel.tsx` | The existing `boolean` and dropdown render branches now accept bound values. |
| `src/data/automationCategories.ts` | Two lines: import and register the new category, guarded against double registration. |
| `vite.config.ts` | Added a `/VulnerabilityScanner` proxy entry against the existing `ENGINE_BACKEND`. |
| `package.json` | Added `test:vulnerability-triage`; appended the suite to `npm test`. |

### Files added

| File | Purpose |
| --- | --- |
| `src/lib/executionMode.ts` | `resolveExecutionMode`, `isPassthroughAction`, `buildPassthroughOutput`. Pure, no React. |
| `src/lib/engineProxyUrl.ts` | `toEngineProxyUrl`, moved out of `WorkspaceEditorPage.tsx` unchanged in behaviour, plus the `PROXIED_PATH_PREFIXES` list. |
| `src/data/actions/vulnerabilityTriage.ts` | The five actions and the category, following the `excelDataset.ts` convention. |
| `tests/vulnerabilityTriage.test.ts` | 85 tests across the nine required areas. |

### Pass-through execution behaviour

`executionMode: 'passthrough'` marks a step that has no endpoint. The executor
gained **one** branch, placed after the shared property pipeline and before
anything reads `action.api`:

```
buildScope → resolveDeep → deepParseWithContract → coerceToContract
           → validateAgainstContract → coercion log → token log
           → [passthrough? record output and return]      ← the new branch
           → URL / headers / body / fetch                  ← unchanged
```

Everything above the branch runs for both modes, so a pass-through step is held
to exactly the same contract as an API step: a missing required field still
blocks it, a bound value still lands as its declared type, and every coercion is
still reported to the execution log. Everything below is untouched. Nothing in
the executor is scanner-specific — the four hardcoded per-plugin branches that a
naive version of this feature would need do not exist, and adding a sixth
collector requires no change to `WorkspaceEditorPage.tsx`.

**The accumulation rule:** a pass-through step forwards its input and layers its
own resolved properties on top. That is what lets a chain of collectors be read
by a single `{{previous.*}}` at the end, instead of forcing the final step to
name each upstream step — bindings that break the moment somebody renames a
node. The per-step view stays addressable as `{{steps.<name>.…}}`; accumulation
adds a path and removes none.

`undefined` is skipped during the merge so an undeclared field cannot erase a
carried one. `false`, `0` and `''` overwrite, because they are values a user
chose — dropping them is the falsy-check bug that would make a threshold of `0`
or a flag deliberately turned off silently revert.

### Scanner input actions

Four pass-through collectors, each declaring an `outputSchema`:

| Action | Collects |
| --- | --- |
| **Scan Context** | `scanId`, `project`, `language` (dropdown) |
| **Source Inputs** | `reportPath`, `repositoryPath` |
| **Triage Policy** | `sanitizerConfigPath`, `outputDirectory` |
| **Triage Options** | `confidenceThreshold` (number, default `70`), `alertOnHighConfidenceTp` (boolean, default `false`), `reportAutoClosedFindings` (boolean, default `true`) |

The eight request fields were split four ways because they have four different
lifetimes — an identity that changes every run, paths that change per
repository, a policy that changes per team, thresholds that change when tuning.
Splitting them lets each be sourced from where it actually lives rather than
forcing all eight through one form.

None of the four carries an `api` block at all. A placeholder URL that nobody
calls is a lie that eventually gets called.

### Final API action

**Run Triage Scan** — `POST {ENGINE}/VulnerabilityScanner/api/triage/run`,
`executionMode: 'api'` stated explicitly next to four pass-through siblings so
it does not read as an oversight. Its eight properties default to
`{{previous.<field>}}`, which after a collector chain resolves against the
accumulated payload. Declares the full `ScanResponse` output schema, derived
from `src/pages/agents/types.ts` so the workflow action and the existing
standalone agent page cannot drift apart.

### Boolean / select binding changes

Both were previously unbindable, and both destroyed a binding by rendering it:

- **Boolean.** `checked={Boolean(value)}` collapsed a bound
  `{{variables.strictMode}}` to `true` on first render, and the next edit wrote
  that literal back. The branch now detects `containsToken(value)`, shows the
  token in place of the toggle, and offers the same `BindingPicker` every text
  field has. Clearing restores an explicit `false` rather than deleting the key.
- **Select.** `CustomDropdown` upper-cases its display value, so a bound
  `{{previous.language}}` rendered as `{{PREVIOUS.LANGUAGE}}` and read like a
  broken token. A bound dropdown now shows the token verbatim, and the picker's
  hand-written-expression mode remains available for any value the option list
  does not enumerate.

`PremiumToggle`, `CustomDropdown`, `BindingPicker`, `BindingPreview`,
`renderVariablePicker`, `effectiveBindingGroups` and `effectivePreviewScope` are
all reused as they stand. Nothing was duplicated.

### Typed request-body handling

**Run Triage Scan** declares no `api.body` template. Without one the executor
sends the action's own resolved properties, which are exactly the eight
documented `TriageRequest` fields. Two consequences, both deliberate:

1. `confidenceThreshold` is declared `number` in `propertyConfig`, so a
   whole-token binding resolves to a real `70` and reaches Jackson as a JSON
   number rather than as `"70"`.
2. The two workflow-policy flags collected by Triage Options **cannot leak onto
   the wire**, because they are not among the final action's own properties.
   They are carried forward for connection conditions and downstream bindings
   only. Inventing fields on someone else's wire contract is how a frontend
   starts failing against a backend it never agreed with.

### Declared output schemas

All five actions declare `outputSchema` using the existing `OutputSchema` /
`OutputField` types, read by the existing `buildDeclaredCatalogue`. The picker
therefore offers `{{steps.Scan Context.scanId}}`,
`{{steps.Run Triage Scan.summary.highConfidenceTp}}` and
`{{steps.Run Triage Scan.findings.first.verdict}}` **on a blank canvas**, before
any run — without them a user would have to execute a half-built scan against a
real repository just to learn the field names. Observed still beats declared:
once a step has run, its recorded output replaces the promised one.

### Proxy changes

`vite.config.ts` gained `/VulnerabilityScanner` against the existing
`ENGINE_BACKEND` — no second env var, no duplicate target. `toEngineProxyUrl`
now rewrites both prefixes:

```
http://localhost:8080/VulnerabilityScanner/api/triage/run
  → /VulnerabilityScanner/api/triage/run
http://localhost:8080/engine/excel/sheets
  → /engine/excel/sheets                    (unchanged)
```

It stays narrow (localhost / 127.0.0.1 only), idempotent, and non-string safe.
Matching remains case-insensitive and the matched prefix is normalised to the
casing the proxy is keyed by, because Vite's proxy keys are case-sensitive and
`/VULNERABILITYSCANNER/...` would otherwise forward nowhere.

`PROXIED_PATH_PREFIXES` in `src/lib/engineProxyUrl.ts` and the `server.proxy`
keys in `vite.config.ts` are the same contract seen from the client and server
sides; each file points at the other.

### Backward-compatibility measures

- **`executionMode` is optional and defaults to `'api'`.** Every action authored
  before this field reports `'api'` and keeps its exact previous behaviour,
  including the unchanged `"No API defined for this action"` error text and the
  position of the guard that raises it. Asserted over the whole catalogue: no
  pre-existing action declares a mode, and none resolves to pass-through.
- **The API path is byte-for-byte unchanged** below the new branch — REST
  client, multipart, file responses, retries, ports, debugger, drift detection.
- **`toEngineProxyUrl` moved without a behaviour change.** The `/engine` cases
  are covered by their own test section.
- **The new category is appended, never replacing anything**, and the
  registration is guarded so a hot reload cannot double-register it.
- **The Properties Panel changes are additive branches.** An unbound boolean
  still renders the toggle; an unbound dropdown still renders `CustomDropdown`.
- **The standalone agent page is untouched.** Its free-text form and its
  endpoint still work exactly as before.
- **`publishNodeOutputs` is an extraction, not a rewrite** — the same
  `outputKey` / `outputMapping` code, now shared by both modes so they cannot
  drift.

---

### Branching — named output ports (previous)

See `BRANCHING.md` for the full write-up. Summary:

- `src/lib/ports.ts` (new) — resolves which slice of a step's output each
  outgoing edge carries. `Connection.sourcePort` existed in the schema and was
  editable in the UI; nothing read it, so a Filter step handed its whole
  envelope to both branches and the exception path worked only if the author
  remembered to bind `unmatchedData` by hand.
- Branch-aware `previous`. It previously meant "last node executed anywhere",
  which is wrong the moment a workflow fans out — the unmatched branch resolved
  `{{previous.data}}` against the matched branch's output, cleanly and silently.
- `tests/ports.test.ts` (new) — 48 tests, backward compatibility first.

**Compatibility:** an edge with no `sourcePort` carries the full output exactly
as before. Every saved workflow is unaffected.

Verified: `tsc --strict` 0 errors, 272 tests passing, `vite build` succeeds.

Verified on this tree: `npm run typecheck` (0 errors), `npm test` (223 passed),
`npm run build` (production bundle built).

### New

- `src/lib/payloadContract.ts` — the transformation layer between resolved
  binding values and plugin request bodies. Reconciles values with the type each
  plugin declares in `propertyConfig`, so a whole-container binding
  (`{{previous.rows}}`) no longer reaches a Java `String` field as a JSON array.
  Also provides `deepParseWithContract` (never re-parses a declared text field)
  and `validateAgainstContract` (pre-flight errors before a request is sent).
- `tests/payloadContract.test.ts` — 33 tests covering both root causes,
  readability of rendered text, and no-regression on already-valid payloads.
- `scripts/contract-drift.mjs` — joins this registry to the Java DTOs and
  reports every field where they disagree. Run it in CI; `--json` exits 1 on
  ERROR-level drift.

### Modified

- `src/pages/WorkspaceEditorPage.tsx` — 4 hunks in `executeAction`:
  contract-aware parsing, type coercion, pre-flight validation, and the same
  treatment for `api.body` templates. Every adjustment is logged at `debug`.
- `src/data/automationCategories.ts` — `rowData` on the REST client node was
  declared `string` but the executor builds it as an object and the DTO now
  declares `Map<String,Object>`. Corrected to `object` so all three agree.
- `package.json` — added `test:payload-contract` and `contract-drift` scripts;
  `test` now runs all three suites.

### Not changed, deliberately

The response-envelope shapes. `carryForward.ts` currently reverse-engineers
seven different backend envelopes. Normalising them is the right long-term fix,
but it changes what every existing binding resolves to, so it is a migration,
not a patch.
