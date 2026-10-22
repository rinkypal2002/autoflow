# AutoFlow Frontend V1 Stabilization

## What this release fixes

### 1. Engine calls no longer fail as `403 Invalid CORS request`

All local engine calls are normalized to same-origin paths:

- `/engine/*`
- `/VulnerabilityScanner/*`
- `/voice_transcription/*`

The Vite proxy now removes browser `Origin` and `Referer` headers before the
server-to-server hop. This closes the gap where the browser correctly called a
relative URL but Tomcat still saw `Origin: http://localhost:5173` and rejected
it.

### 2. Monitor and Ollama calls are same-origin

- `/engine-monitor/*` -> engine monitor target (default `localhost:8082`)
- `/ollama/*` -> Ollama target (default `127.0.0.1:11434`)

### 3. Error messages identify CORS correctly

A `403 Invalid CORS request` is displayed as **Request blocked by CORS**, not
**Authorization failed**.

### 4. Obvious invalid workflows fail before execution

A run is blocked before the first request when a node has an empty required
field. The first invalid node is selected and its Properties panel is opened.
Runtime contract validation still runs after bindings resolve.

### 5. Dataset page requests use the engine proxy

Dataset paging/release no longer calls `http://localhost:8080` directly.

### 6. Dead source copies removed

The unused duplicate Properties panels and old data-transformation catalogue
were removed from compilation and linting.

## Local startup

```bat
cd /d "<PROJECT_FOLDER>"
copy .env.example .env
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

Open the exact Vite URL printed in the terminal, normally:

```text
http://localhost:5173
```

Restart `npm run dev` after any `.env` or `vite.config.ts` change.

## Production reverse-proxy contract

The production web tier must forward these paths:

```text
/api                  -> Node backend
/engine               -> Tomcat
/VulnerabilityScanner -> Tomcat
/voice_transcription  -> Tomcat
/engine-monitor       -> monitor service, with prefix removed
/ollama               -> Ollama, with prefix removed
```

Do not expose connector credentials through Vite environment variables. They
are shipped to the browser bundle.

## Verification gate

The frontend is launch-ready only after all of these pass:

1. Database Health Check succeeds from the workflow builder.
2. One database DDL/DML chain succeeds.
3. One Excel file-producing action returns/downloads a file.
4. One multi-step output binding resolves correctly.
5. One Teams/Outlook action reaches the engine without CORS failure.
6. Save, reload, and rerun the workflow.
