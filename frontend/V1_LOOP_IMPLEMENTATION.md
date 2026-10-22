# AutoFlow V1 Loop Controls

This bundle is based on `AutoFlow_V1_Loop_Source_Bundle.zip` and is intended to be overlaid on the same AutoFlow frontend checkout.

## Implemented

- **For Each** — arrays, dataset-like `{ rows: [] }` / `{ data: [] }`, JSON collections, and plain objects.
- **While** — pre-condition loop using the existing safe expression evaluator.
- **Repeat Until** — executes at least once, then evaluates the Until condition.
- **Break** — exits the innermost active loop and routes from that loop's **Done** port.
- **Continue** — skips remaining queued work in the current iteration and advances the innermost loop.
- **Nested loop context** — innermost aliases plus immediate parent access.
- **Safety guards** — configurable per-loop maximum, hard-capped at 10,000; scheduler fail-safe remains separate.
- **Retry separation** — loop iterations have distinct execution identities, while retries of the same iteration keep retry semantics.

## Bindings inside a loop

- `{{currentItem}}`
- `{{currentIndex}}` — zero-based
- `{{currentKey}}`
- `{{iteration}}` — one-based
- `{{loop.currentItem}}`
- `{{loop.currentIndex}}`
- `{{loop.iteration}}`
- `{{loop.parent.currentItem}}`
- `{{loop.parent.currentIndex}}`
- `{{loop.parent.iteration}}`

The Binding Picker exposes these under **Loop Context** whenever the workflow contains a loop controller.

## Wiring

### For Each

`Start -> For Each`

`For Each [Body] -> body action(s) -> For Each`  (back-edge)

`For Each [Done] -> next action / End`

### While

`Start -> While`

`While [Body] -> body action(s) -> While`  (back-edge)

`While [Done] -> next action / End`

### Repeat Until

`Start -> Repeat Until`

`Repeat Until [Body] -> body action(s) -> Repeat Until`  (back-edge)

`Repeat Until [Done] -> next action / End`

`Break` and `Continue` target the innermost active loop. They do not require an outgoing back-edge: Break routes the active loop's Done branch; Continue schedules the next iteration.

## Verification in the real project checkout

```bat
npm run test:loops
npm run typecheck
npm test
npm run build
```

The isolated source bundle was verified with 48 targeted loop assertions passing and zero TypeScript syntax diagnostics across all modified source files. Full application typecheck/regression/build must be run in the complete project checkout because this source bundle intentionally does not contain the entire repository or installed dependencies.
