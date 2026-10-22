# AutoFlow Frontend V1 Stabilization Release

## Primary correction

The workflow editor was returning `403 - Invalid CORS request` even though database credentials were valid. Local browser requests now use same-origin Vite proxy routes. The proxy removes browser-only `Origin` and `Referer` headers before forwarding requests to local Tomcat services.

Supported development proxy routes:

- `/engine/**` -> Products Engine on Tomcat
- `/VulnerabilityScanner/**` -> Vulnerability Scanner on Tomcat
- `/voice_transcription/**` -> voice endpoint on Tomcat
- `/api/**` -> Node/backend API
- `/engine-monitor/**` -> engine monitoring service
- `/ollama/**` -> local Ollama service

Remote customer/server URLs are not rewritten.

## Workflow execution and UX

- Local engine URLs are normalized to same-origin browser paths.
- CORS failures are reported as CORS/proxy problems instead of misleading authorization failures.
- Required node properties are validated before workflow execution.
- The first invalid node is selected and its property panel is opened.
- Engine control operations now surface non-success HTTP responses.

## Architecture cleanup

- Removed obsolete duplicate property-panel and transformation source files.
- Centralized service URL defaults and proxy handling.
- Added frontend stability regression tests.
- Cleaned lint violations and stale suppressions.
- Added Windows verification and startup scripts.

## Verification performed during preparation

- TypeScript application type-check: passed.
- Vite configuration type-check: passed.
- ESLint: passed with zero errors and zero warnings.
- Existing workflow test suites: passed in the portable verification environment.
- New frontend stability suite: 10 passed, 0 failed.

A native Windows `npm run build` and browser-to-Tomcat smoke test must still be completed on the target machine because the uploaded dependency directory contains Windows platform binaries.

## Required Windows release check

Run:

```bat
VERIFY_FRONTEND_V1.cmd
```

Then restart Vite with:

```bat
START_FRONTEND_V1.cmd
```

Hard-refresh the browser and execute the Database Health Check again.
