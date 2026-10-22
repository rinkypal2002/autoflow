# Audit Addendum — corrections and new findings

**Supersedes parts of `AUDIT.md`.** Read this alongside it.

Continuing the backend work turned up evidence that **corrects three claims in my
first report**. Corrections come first, because a wrong finding is worse than no
finding.

---

## 1. CORRECTION — this is one application, not 30 microservices

**AUDIT.md §1 said** each module is an independent Spring Boot app. **That is
wrong.**

Evidence: there is exactly one `@SpringBootApplication` in the engine —
`Products_Engine/src/main/java/com/products/Products_Engine/ProductsEngineApplication.java`.
The root `pom.xml` is a Maven **reactor aggregator**: it builds the 30 modules as
plain JARs, then builds `Products_Engine` as a **WAR** that depends on all of
them. `ProductsEngineApplication` lists all 30 base packages in
`scanBasePackages` and extends `SpringBootServletInitializer`.

One process. One Spring context. One `application.properties`
(`server.servlet.context-path=/engine`, `server.port=8080`).

**Why it matters:** the §9 recommendation to install `PayloadErrorAdvice` in
each module was wrong. **One advice bean covers all 30.** The shipped file has
been rewritten accordingly.

---

## 2. CORRECTION — `server.error.include-message` *is* set

**AUDIT.md §M2 said** no module sets it, so 400s return no `message`.

I grepped only `modules/*/src/main/resources/`. The WAR's own
`Products_Engine/src/main/resources/application.properties` sets:

```
server.error.include-message=always
server.error.include-stacktrace=never
server.error.whitelabel.enabled=false
spring.mvc.throw-exception-if-no-handler-found=true
spring.main.allow-bean-definition-overriding=true
```

Since this is a single application, that file governs everything. **M2 as
written is void.**

What survives: the *default* message for a Jackson failure is Jackson's own raw
text (`JSON parse error: Cannot deserialize value of type java.lang.String from
Array value at [Source: …line: 1, column: 47]`). That is accurate but not
actionable for a workflow author, and it names the Java type rather than the
canvas field. `PayloadErrorAdvice` still earns its place — but as a **readability
improvement, not a rescue from silence**. Severity drops from critical to medium.

---

## 3. RETRACTION — the `WebConfig` bean-name conflict

I flagged three `@Configuration` classes named `WebConfig` as a probable
`ConflictingBeanDefinitionException` and said it was "strongly suspected, not yet
proven". I finished the check. **It is a false positive.**

- `TextFile`'s `WebConfig` has no stereotype annotation at all — never scanned.
- `SystemManagementApiApplication`'s is `@Configuration("systemMgmtWebConfig")` —
  someone already gave it an explicit bean name.
- Only `SftpPluginApplication`'s takes the default `webConfig`.

No conflict. And `spring.main.allow-bean-definition-overriding=true` is set
regardless.

**One real thing did come out of it.** Both scanned `WebConfig` classes register
CORS for `/api/**` only. Routes such as `/drive/**`, `/sharepoint/**` and
`/excel/**` have no CORS mapping — which is consistent with the comment in
`WorkspaceEditorPage.tsx` explaining why `toEngineProxyUrl` rewrites engine calls
to relative paths to dodge preflight entirely. Worth widening the mapping, or
keeping the proxy rewrite as the permanent answer.

---

## 4. NEW FINDING (high) — six competing global exception handlers

This is the one that matters, and it is a **third independent contributor** to
your reported symptom.

There are seven `@ControllerAdvice` classes. In the single context:

| Advice | Scoped? | Catches `Exception.class`? | `@Order`? |
|---|---|---|---|
| `DatabaseGlobalExceptionHandler` | **yes** (`basePackages`) | yes | no |
| `GlobalExceptionHandler` (excel) | no | yes | no |
| `FileOperationsGlobalExceptionHandler` | no | yes | no |
| `MailServiceExceptionHandler` | no | yes | no |
| `DataTransformerExceptionHandler` | no | yes | no |
| `GuiautoExceptionHandler` | no | yes | no |
| `TextFileExceptionHandler` | no | yes | no |

Six unscoped advices, every one catching `Exception`, and **zero `@Order`
annotations anywhere**. They all apply to all 30 modules, and Spring's choice
among them is not deterministic.

Concretely: when Teams `send-chat` gets an array in `message`, Jackson throws
`HttpMessageNotReadableException`. Three unscoped advices declare a handler for
that exception. Whichever wins returns **its** envelope — file-operations'
`ApiResponse`, mail's `ApiError`, or guiauto's `{timestamp,status,message,errors}`.
Three different shapes for one failure, chosen non-deterministically.

Two pieces of evidence this is already biting:

1. `FileOperationsGlobalExceptionHandler`'s javadoc documents a real
   `ConflictingBeanDefinitionException` caused by two classes both named
   `GlobalExceptionHandler`, and then says: *"Optional hardening: annotate as
   `@RestControllerAdvice(basePackages = …)` so this advice only handles this
   module's controllers rather than every controller in the aggregated
   context."* It was called optional and never done. It is not optional.

2. `GuiautoExceptionHandler`'s javadoc explains it deliberately omits a
   top-level `error` field because *"the web editor prioritises an `error` field
   over `message` when rendering"* — a workaround written for one module that
   silently governs the other 29.

**Fixed:** `advice-scoping.patch` — six hunks, one line each, adding
`basePackages` to every unscoped advice. `PayloadErrorAdvice` carries
`@Order(Ordered.HIGHEST_PRECEDENCE)` so it wins deterministically for the two
exceptions it declares, and declares only those two so nothing else changes.

---

## 5. NEW — contract drift, measured

`tools/contract-drift.mjs` joins the frontend registry to the Java DTOs on
endpoint URL and compares declared types field by field.

```
Registry endpoints : 306   (engine-hosted, non-templated)
Java endpoints     : 403
Java DTOs          : 367
Matched            : 270   (unmatched: 36)
Fields compared    : 985
```

| Finding | Count | Severity |
|---|---|---|
| `NO_VALID` — DTO bound without `@Valid` while the UI marks fields required | 145 | INFO |
| `NO_JAVA_ENDPOINT` — registry declares a URL with no controller | 36 | WARN |
| `FIELD_NOT_IN_DTO` — UI sends a field Jackson discards | 14 | WARN |
| `TYPE_MISMATCH` — declared types disagree | 9 | WARN |
| `DTO_NOT_RESOLVED` — ambiguous, skipped rather than guessed | 6 | INFO |

**On trust.** The first run reported 278 `FIELD_NOT_IN_DTO`. I validated the
output rather than shipping it, and killed six false-positive classes: DTO
inheritance, `throws` clauses (which had hidden every Drive controller),
class-level `@RequestMapping` arrays, `@JsonProperty`/`@JsonAlias` wire names,
cross-module simple-name shadowing (two modules ship a `ConnectionRequest`), and
my own unanchored regex reading `SettingsConfig` as `Set`. 278 → 14. Treat the
remaining numbers as validated; treat any future run after a refactor as
suspect until spot-checked.

### 5a. Endpoints with no controller — 36

| Module | Count |
|---|---|
| Adobe Sign | 10 |
| Outlook Mail | 10 |
| OneDrive | 9 |
| JumpCloud | 6 |
| Asana | 1 |

**OneDrive is confirmed.** The registry points 9 nodes at `/engine/onedrive/*`.
Zero files in the entire engine contain the string `onedrive`. The SharePoint
module maps `/sharepoint`. **All 9 OneDrive actions 404 at run time.**

**Adobe Sign** has no module in the reactor at all — the 30 modules do not
include one. Its 10 endpoints point at `/api/v1/adobe/*`.

Outlook Mail and JumpCloud have modules present, so those 16 are more likely
path-prefix drift than missing code — worth checking before acting.

### 5b. Fields silently discarded — 14

The clearest one ties straight back to code I read in the first pass:

```
/api/restclient/advance-rest-client › responseFields
/api/restclient/advance-rest-client › rowData
```

`AdvancedRestClientRequest` declares exactly six fields: `url`, `httpMethod`,
`authorization`, `headers`, `requestBody`, `settings`. But `executeAction` in
`WorkspaceEditorPage.tsx` goes to real trouble building `normalizedResponseFields`
and `normalizedRowData` into `restPayload` — and Jackson drops both on the floor.
(`rowData` exists on `HttpClientRequest`, a different class.)

The rest:

```
/drive/copy › sourcePath, destinationPath
/api/automation/inject-javascript › technology
/api/automation/dispatch-js-event › actionType
/api/ec2/instance/launch › instanceId
/api/docker/update-container › removeImageForcefully, removeUntaggedParentImages
/api/jenkings/get-builds › build
/api/jenkings/stop-build › build
/asana/create-team › apiBaseUrl, resourceId
/analytics/sample-rows › sampleSize
```

### 5c. Type mismatches — 9

Seven are `ui:file` vs `java:String` on fields that are really *paths*
(`saveAsFilename`, `outputFilePath`, `localFilePath`). Low severity — the UI
type is arguably mislabelled, not the Java. Two are `ui:string` against a nested
DTO (`Aws3Region`, `AbortAction`), which only bind if the text happens to be
valid JSON.

---

## 6. `database_plugin` is the reference implementation

Worth saying plainly, because my tool's early false positives were all it doing
things *right*: DTO inheritance (`LookupRequest` → `PageableRequest` →
`ConnectionRequest`), `@Valid` on 30 handlers, 100 Bean Validation constraints,
`@JsonProperty` + `@JsonAlias` so the UI's `database_type` binds to
`databaseType`, and the only correctly-scoped `@ControllerAdvice` in the
codebase.

It is the template for the other 29. `SftpPluginApplication` is second.

---

## 7. Revised order of work

1. Apply the frontend fix (`payloadContract.ts` + executor patch). Unchanged —
   still the thing that clears your reported 400.
2. **Apply `advice-scoping.patch`** (6 one-line changes). Makes every error
   response come from the module that actually failed. Do this before item 3.
3. Drop in `PayloadErrorAdvice.java` at
   `Products_Engine/src/main/java/com/products/platform/common/`. No config
   change needed — `com.products` is already scanned.
4. Fix the 9 OneDrive URLs, and decide whether Adobe Sign is meant to exist.
5. Add the 14 missing DTO fields, starting with the REST client's
   `responseFields` / `rowData`.
6. Add `@Valid` to the 145 handlers that bind a DTO with required fields.
7. Wire `contract-drift.mjs` into CI (`--json`, exit 1 on ERROR) so drift cannot
   re-accumulate. This is the item that makes hundreds of plugins viable.

Items 1–3 address the reported failure. 4–5 remove live bugs. 6–7 stop
recurrence.
