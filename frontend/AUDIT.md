# Platform Audit — Products Engine v10 + product_v4 Enterprise Runtime

**Date:** 29 July 2026
**Scope inspected:** 475 Java files across 30 plugin modules; 71 TypeScript/TSX files in the runtime; the Node proxy (`backend/server.js`, 1,962 lines).

---

## 0. Read this first — what this audit is and is not

Every finding below is backed by code I read or by a measurement I ran against your files. The root cause in §6 is **reproduced**, not inferred, and the fix ships with a passing test suite.

Two honest limits:

1. **I did not read all 475 Java files line by line.** I read the Teams module in full (the one you reported failing), and measured the other 29 modules systematically — controller counts, `@Valid` usage, `@ExceptionHandler` presence, DTO field types, response envelope shapes. Module findings in §2 are grounded in those measurements; they are not a line-by-line review of every service method.
2. **I have not returned 546 rewritten files.** That was requested, and I want to be straight with you: a blind rewrite of code I have not read would break working plugins, which is your own stated constraint. What I have done instead is fix the defect that actually causes your failure, at the one layer where it belongs, and give you a mechanical procedure for the backend hardening.

---

## 1. Architecture as it actually is

Worth stating plainly, because it shapes every other finding:

**The workflow engine runs in the browser.** `WorkspaceEditorPage.tsx` (3,192 lines) contains the executor. It resolves bindings, builds request bodies, and calls the 30 Java plugin microservices directly over HTTP. The Java side has no orchestrator — each module is an independent Spring Boot app exposing plugin endpoints.

Consequences:

- There is **one** place where a request body is built (`executeAction`), which is good: the fix has a single home.
- There is **no server-side execution**. Closing the tab kills the run. Scheduling (`lib/scheduler.ts`) is client-side and dies with the tab.
- Secrets (client secrets, refresh tokens, DB passwords) live in workflow definitions and travel through the browser. `application-hardening.properties` does not fix this; see §5.

The client-side execution layer is genuinely well built. `carryForward.ts`, `executionContext.ts` and `expression.ts` are careful, well documented, and correct. The business/technical split, the `$`-prefixed metadata namespace, the memoised projections, the no-`eval` resolver — this is real engineering, not a demo. **The defect is not in the carry-forward design.** It is in the single missing stage between carry-forward and the wire.

---

## 2. Module-by-module findings

Measured across all 30 modules:

| Module | Ctrls | @RequestBody | @Valid | String fields | ExcHandler | Bean-Val |
|---|---|---|---|---|---|---|
| database_plugin | 2 | 20 | 30 | 90 | 1 | 100 |
| guiauto | 2 | 27 | 6 | 117 | 1 | 37 |
| LinuxOpration | 1 | 8 | **0** | **169** | **0** | **0** |
| TeamPlugings_updated | 1 | 18 | **0** | 76 | **0** | **0** |
| RestPlugin_5thMAR2026 | 1 | 1 | **0** | 79 | **0** | **0** |
| Amazon_Plugins | 1 | 22 | 7 | 81 | **0** | 14 |
| SftpPluginApplication | 1 | 15 | 15 | 76 | 1 | 30 |
| agentic_ai_mail_services | 2 | 10 | 5 | 67 | 1 | 13 |
| googledriveplugin | **12** | 10 | **0** | 40 | **0** | **0** |
| excelplugin | 2 | 0 | **0** | 43 | 1 | **0** |
| JavaFilter_6thMar2026 | 1 | 14 | **0** | 37 | **0** | **0** |
| SystemManagementApiApplication | 1 | 5 | 4 | 29 | **0** | 3 |
| TextFile | 2 | 1 | **0** | 27 | 1 | **0** |
| DockerPlugin | 1 | 14 | **0** | 26 | **0** | 2 |
| DataTransformerApplication | 2 | 6 | 7 | 25 | 1 | 20 |
| zohodeskplugin | 1 | 6 | **0** | 22 | **0** | **0** |
| sharepoint-plugin | 1 | 18 | **0** | 20 | **0** | **0** |
| googlesheetsplugin | 1 | 7 | **0** | 19 | **0** | **0** |
| AmazonS3 | 1 | 15 | 1 | 18 | **0** | 3 |
| Jenking_Plugin | 1 | 11 | 6 | 18 | **0** | 3 |
| Mongodb_Plugin | 1 | 6 | **0** | 17 | **0** | **0** |
| ai-bridge-service | 1 | 1 | 1 | 14 | **0** | 5 |
| AnalyticsPlugin | 1 | 5 | **0** | 12 | **0** | **0** |
| JumpCloud | 1 | 6 | **0** | 11 | **0** | **0** |
| asanaplugin | 1 | 12 | **0** | 11 | **0** | **0** |
| jsonplugin | 1 | 2 | **0** | 10 | **0** | **0** |
| FileOperationsApiApplication13 | 2 | 1 | **0** | 9 | 1 | **0** |
| FastSMS | 1 | 2 | **0** | 8 | **0** | **0** |
| xmlplugin | 1 | 1 | **0** | 6 | **0** | **0** |
| TotpGenerator | 1 | 2 | **0** | 6 | **0** | **0** |

### M1 — 22 of 30 modules have no exception handling at all *(critical)*

No `@ControllerAdvice`, no `@ExceptionHandler`. Combined with M2, this is why your failures are unreadable.

### M2 — No module sets `server.error.include-message` *(critical)*

I grepped every `application.properties` and `application.yml`. Spring Boot's default is `never`. So a Jackson binding failure returns:

```json
{"timestamp":"…","status":400,"error":"Bad Request","path":"/api/v1/teams/send-chat"}
```

**No `message` field.** This is exactly your reported symptom: "a 400 or invalid JSON error" with nothing to act on. The backend knows precisely which field failed and why — and throws that information away before responding.

### M3 — `@Valid` is present on only 8 of 30 modules

22 modules never trigger Bean Validation. Worse, several modules *declare* constraints that are never enforced because the `@Valid` annotation is missing at the controller parameter — `Amazon_Plugins` has 14 constraint annotations and 7 `@Valid`; `SystemManagementApiApplication` has 3 and 4. The annotations are decoration.

`database_plugin` (100 constraints / 30 `@Valid`) and `SftpPluginApplication` (30 / 15) are the two modules doing this properly. They are the template the others should follow.

### M4 — Seven different response envelope shapes *(architectural)*

Across all controllers:

| Return type | Count |
|---|---|
| `ResponseEntity<Map<String, Object>>` | 288 |
| `ResponseEntity<String>` | 65 |
| `ResponseEntity<>` (diamond) | 49 |
| `ResponseEntity<Object>` | 32 |
| `ResponseEntity<ApiResponse>` | 32 |
| `ResponseEntity<Map>` (raw) | 25 |
| `ResponseEntity<ApiResponse<Object>>` | 16 |

This is the reason `carryForward.ts` has to *guess*. `unwrapEnvelope` maintains a 40-key `TECHNICAL_KEYS` set, a 25-key `WRAPPER_COMPANION_KEYS` set and a 13-key `ENVELOPE_KEYS` set purely to reverse-engineer which of seven shapes a given plugin used. That heuristic is well written, but it is compensating for a backend contract that does not exist.

**The 65 `ResponseEntity<String>` endpoints are the worst case for you.** A bare string response has no fields, so `projectBusinessData` falls to its scalar branch and offers exactly one binding — `{{steps.X.value}}`. Those endpoints carry forward almost nothing. Concentrated in `sharepoint-plugin` (27), `asanaplugin` (13) and `agentic_ai_mail_services` (12).

### M5 — `googledriveplugin` has 12 controllers for 42 files

No other module exceeds 2. Endpoint surface is fragmented across a dozen classes with no shared base or advice, which is why it also scores 0 on validation and error handling.

---

## 3. Variable mapping findings

**This layer is in good shape.** Verified by reading the code and by the 67-test `carryForward` suite plus the 123-test `enterprise` suite, both of which pass.

Confirmed working:

- `{{variables.X}}`, `{{vars.X}}`, `{{previous.X}}`, `{{steps.Name.X}}`, `{{steps['Quoted Name'].X}}`, `{{nodes.<id>.output.X}}` all resolve from one scope built in `executionContext.buildScope()`.
- Precedence is deliberate and documented: business layer → raw payload → `$`-prefixed metadata. An HTTP node whose response contains `status` correctly resolves `{{steps.X.status}}` to `200`, not to the engine's internal `"completed"`. That is a subtle trap, and it was handled.
- Business/technical separation is real. `isTechnicalKey()` judges `status` and `code` **by value** — HTTP `status: 200` is technical, ticket `status: "Open"` is not. That is the right call.
- Names are business-friendly. `humanizeFieldLabel` turns `employeeId` → `Employee ID` with a proper acronym set.
- Secrets are masked in snapshots via `secretVariableNames()`.
- No `eval` / `new Function` anywhere in the resolver. A malformed binding cannot execute code.

One design consequence to be aware of (not a bug): `resolveString` returns the **native** value when a string is exactly one token. This is correct — it is what lets a node bind a whole array. But it is the input to the defect in §6.

---

## 4. Carry-forward findings

Also sound. `recordNodeOutput` indexes each result by node id, by binding-safe step key **and** by raw node name; refreshes `previous`; files the output into a typed bucket (`apiResponse` / `databaseResult` / `fileReference` / `extractedText` / `computed`); and memoises the business/technical projection against the output reference.

Verified behaviours:

- Every node's output is stored, including **failures** (`recordNodeError` keeps `{{steps.X.error}}` bindable) and **control nodes**.
- Later nodes can read *any* earlier node, on any branch — not just the immediately connected one.
- Retries overwrite in place and preserve the original sequence number, so the preview table does not skip 1, 3, 4.
- Flattening is bounded (`maxDepth: 4`, `maxArrayItems: 10`) rather than exploding large payloads.

Two things worth tightening later (neither causes your failure):

- **C1** — `getBusinessValues()` merges every step's top-level business keys into one flat map, newest wins. Two steps that both emit `id` will silently collide for a bare `{{id}}`. Namespaced tokens are unaffected. Prefer `{{steps.X.id}}` in generated bindings.
- **C2** — the run lives in browser memory. `persistSnapshot` writes to the Node proxy, but an interrupted run cannot resume server-side.

---

## 5. Architecture risks

| # | Risk | Severity |
|---|---|---|
| R1 | Execution engine is client-side. No server-side runs, no durable scheduling, tab close kills the workflow. | High |
| R2 | Credentials (client secrets, refresh tokens, DB passwords) are stored in workflow definitions and pass through the browser. | High |
| R3 | No response contract across 30 modules (§M4) forces heuristic envelope unwrapping. | High |
| R4 | 22 modules cannot report *why* a request failed (§M1, §M2). | High |
| R5 | `WorkspaceEditorPage.tsx` is 3,192 lines and holds the entire executor. Every plugin behaviour change edits this file. | Medium |
| R6 | Plugin contracts live in the frontend registry (`automationCategories.ts`) and DTOs live in Java, with nothing keeping them in sync. Drift is silent. | Medium |
| R7 | `normalizeExecutionAliases` hardcodes a `talentId` → `tenantId` rename for one plugin's typo, in the shared path for all 30. | Low |

On **scalability to hundreds of plugins**: R6 is the blocker, not throughput. Field types are declared twice — 1,106 `"type": "string"` entries in the frontend registry, ~1,200 `private String` fields in Java — with no generation step or contract test binding them together. At 30 plugins this is manageable by hand. At 300 it is not.

---

## 6. Root cause of your failure — proven, not guessed

> *"A workflow succeeds up to the final node, but the last node fails with a 400 or invalid JSON error."*

**Cause: there is no transformation layer between resolved binding values and plugin request bodies.** Three distinct defects, all in the same missing stage.

### Why the *last* node specifically

Because the last node is the one that consumes upstream data. Every node before it was configured with literals typed into the properties panel. The final node — the Teams message, the summary email — is where a `{{previous.…}}` binding first carries a real value from a real response. Your failure is not positional; it correlates with *being the first node to consume a binding*.

### Defect 1 — containers land in text fields

`expression.ts:resolveString` returns the native value when the whole string is one token. Correct by design. But `BindingPicker` offers whole containers as bindable (`carryForward.ts:walkArray` pushes the array itself with `isContainer: true`), so `{{previous.rows}}` is a one-click binding.

Nothing then reconciles that array with `TeamsEntity.java`:

```java
private String message;    // TeamsEntity.java line 25
```

Reproduced against your own logic:

```
A: bind whole array   {{previous.rows}}
   declared type : string
   actual type   : array
   POSTed JSON   : {"channelId":"C1","message":[{"employeeId":"E101",…}]}
   Jackson result: >>> 400  Cannot deserialize value of type `java.lang.String` from Array value
```

Jackson coerces numbers and booleans to `String` silently, but **objects and arrays throw**. Hence a 400 with no message (§M2).

This is not a Teams problem. It is **~1,200 `private String` fields across all 30 modules**, each reachable by a one-click container binding.

### Defect 2 — `deepParse` corrupts legitimate JSON text

`objectUtils.ts:deepParse` converts *any* string starting with `{` or `[` into a real object, and the executor applied it to every resolved property:

```
Teams message quoting a JSON payload
   before : string  "{\"orderId\":\"A-77\",\"status\":\"shipped\"}"
   after  : object
   result : >>> 400 Cannot deserialize `java.lang.String` from Object value
```

A message quoting a JSON payload, an email body containing a JSON report, a REST `rawContent` held as text — all silently converted to structure, all rejected.

### Defect 3 — scalars land in list fields

`TeamsEntity.emails` is `List<String>`; the registry declares `"type": "array"`. Bind `{{previous.employeeEmail}}` (a string) and Jackson rejects `String` → `List<String>` the same way.

### The amplifier

Defects 1–3 produce a 400. §M1 + §M2 ensure that 400 arrives with **no message**. The executor's response parser then does:

```js
if (respCT.includes('application/json') || rawText.trim().startsWith('{') …)
```

so it parses the bare error body, finds no `message`, and surfaces `API error: 400 - …`. That is your "400 or invalid JSON error."

### Not the cause

Ruled out by inspection: the carry-forward design, the execution context, the expression resolver, the previous-step model, and the Teams plugin implementation itself. All correct.

---

## 7. Files changed

| File | Status | Lines |
|---|---|---|
| `src/lib/payloadContract.ts` | **new** | 604 |
| `tests/payloadContract.test.ts` | **new** | 214 |
| `src/pages/WorkspaceEditorPage.tsx` | **modified** | +79 / −11 (4 hunks) |
| `PayloadErrorAdvice.java` | **new** (backend) | 232 |
| `application-hardening.properties` | **new** (backend) | 27 |

Nothing was deleted. No existing function signature changed.

### Test results

```
carryForward         67 passed, 0 failed     (pre-existing — no regression)
enterprise          123 passed, 0 failed     (pre-existing — no regression)
payloadContract      33 passed, 0 failed     (new)
─────────────────────────────────────────
                    223 passed, 0 failed
```

---

## 8. What the fix does

`payloadContract.ts` is the missing stage. Three functions:

**`coerceToContract(payload, propertyConfig)`** reconciles resolved values with declared types and reports every adjustment.

| Declared | Received | Result |
|---|---|---|
| `string` | array of scalars | `"a@x.com, b@x.com"` — readable, not `["a@x.com",…]` |
| `string` | object / array of objects | compact JSON (`textarea` → indented) |
| `string` | number / boolean | `String(value)` |
| `array` | scalar | `[scalar]` |
| `array` | `"a, b"` | `["a","b"]` |
| `array` | `"[1,2]"` | `[1,2]` |
| `number` | `"60"` | `60` |
| `number` | `"soon"` | **blocking error before send** |
| `boolean` | `"true"` | `true` |
| `file` | anything | untouched |
| *undeclared* | anything | untouched |

**`deepParseWithContract(value, propertyConfig)`** replaces the bare `deepParse`. Text fields stay text; `object`/`array` fields are still parsed; undeclared fields keep the old permissive behaviour.

**`validateAgainstContract(payload, propertyConfig)`** runs pre-flight: missing required fields and unresolved `{{bindings}}` are caught with a readable message before any request leaves the browser.

Safety properties, all covered by tests:

- Fields absent from `propertyConfig` are never touched.
- A node with no `propertyConfig` is a complete no-op.
- `File` / `Blob` values are never touched — multipart uploads are unaffected.
- A payload that was already valid is returned **byte-identical**, with zero issues reported.
- No data is lost: a serialised array round-trips through `JSON.parse`.

### Executor integration (4 hunks)

1. Import `payloadContract`.
2. Replace `deepParse(...)` with `deepParseWithContract(..., contract)` on resolved properties, then run `coerceToContract`, then pre-flight validation.
3. Apply the same treatment to `api.body` templates.
4. Drop the now-unused `deepParse` import.

Every adjustment is logged at `debug` with the before/after types, so the transformation is never invisible.

---

## 9. Backend hardening — the mechanical part

`PayloadErrorAdvice.java` converts an unreadable body into:

```json
{
  "success": false,
  "status": 400,
  "message": "Field 'message' expects text but received an array.",
  "fieldErrors": [{ "field": "message", "expected": "String", "received": "an array",
    "detail": "A binding is passing a whole step output into a text field — bind a single value (for example {{previous.employeeId}}) instead of the whole step ({{previous}})." }]
}
```

The `{ success: false, message }` shape is deliberate: the executor already recognises `success === false` and surfaces `message` verbatim to the user.

**Per module:** copy the file in, change the `package` line, append `application-hardening.properties`. Nothing else. It only adds handlers — a module with its own `@ExceptionHandler` for a given exception keeps precedence.

Start with the 22 modules that have none. Priority by blast radius: `LinuxOpration` (169 String fields, zero validation), `TeamPlugings_updated` (76, your reported failure), `RestPlugin_5thMAR2026` (79), `JavaFilter_6thMar2026` (37).

---

## 10. Recommended order of work

1. **Apply the frontend fix.** Run `npm run test:payload-contract`, then re-run your failing workflow. This alone should clear the 400.
2. **Install `PayloadErrorAdvice` in Teams and LinuxOpration.** Confirms the diagnosis end-to-end and gives you readable errors on the two highest-risk modules.
3. **Roll the advice out to the remaining 20 modules.** Mechanical, low risk.
4. **Add `@Valid` to the 22 modules missing it** — many already carry unenforced constraint annotations.
5. **Standardise the response envelope** (§M4). Pick one shape; `ApiResponse<T>` already exists in several modules. Retire the 65 `ResponseEntity<String>` endpoints first — they are the ones producing unusable carry-forward.
6. **Generate `propertyConfig` from the Java DTOs**, or add a contract test that fails when they drift (§R6). This is the change that makes hundreds of plugins viable.
7. **Move execution server-side** (§R1, §R2) when you need durable runs and credentials out of the browser.

Items 1–3 fix your reported bug. Items 4–7 are what separates this from a demo.
