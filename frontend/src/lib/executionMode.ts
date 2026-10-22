/**
 * Execution mode — the two shapes a non-control node can complete in.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 *
 * This is not a second executor, a second binding system or a second context.
 * It is three small pure predicates that `WorkspaceEditorPage.executeAction`
 * consults so it can end a run *one statement earlier* for a step that has no
 * endpoint. Everything before that point — `buildScope`, `resolveDeep`,
 * `deepParseWithContract`, `coerceToContract`, `validateAgainstContract`, the
 * coercion log, the token log — is the same code path for both modes, and
 * everything after it — `recordNodeOutput`, `outputKey`, `outputMapping`,
 * retries, ports, the debugger gate — is likewise unchanged.
 *
 * Pure and framework-free: no React, no DOM, no side effects.
 */

import type { ActionExecutionMode } from '../types/pluginContract';
import { isPlainObject } from './objectUtils';

/** The minimal shape these helpers read. Kept structural so a catalogue entry,
 *  a saved node and a live `WorkflowAction` all satisfy it without casting. */
interface ExecutionModeCarrier {
  executionMode?: ActionExecutionMode;
}

/**
 * The mode an action runs in.
 *
 * Unknown and absent values both fall back to `'api'`. That default is the
 * whole backward-compatibility story: every action authored before this field
 * existed reports `'api'` and therefore keeps its exact previous behaviour,
 * including the "No API defined for this action" error when its URL is missing.
 */
export function resolveExecutionMode(
  action: ExecutionModeCarrier | null | undefined
): ActionExecutionMode {
  return action?.executionMode === 'passthrough' ? 'passthrough' : 'api';
}

/** True when the action completes locally instead of calling an endpoint. */
export function isPassthroughAction(
  action: ExecutionModeCarrier | null | undefined
): boolean {
  return resolveExecutionMode(action) === 'passthrough';
}

/**
 * Build a pass-through step's output: what arrived, updated by what this step
 * declares.
 *
 * ── The accumulation rule, stated once ────────────────────────────────────
 *
 * **A pass-through step forwards its input and layers its own resolved
 * properties on top.**
 *
 * That single rule is what lets a chain of collector steps be read by one
 * `{{previous.*}}` at the end. Four steps that each gather two fields do not
 * force the fifth to write `{{steps.Scan Context.scanId}}`,
 * `{{steps.Source Inputs.reportPath}}`, and so on against step names a user is
 * free to rename; the fifth just reads `previous`, because `previous` carries
 * everything collected so far. Renaming an upstream step therefore cannot break
 * the workflow — which is exactly the failure mode step-name bindings have.
 *
 * The full per-step view is *also* still addressable as `{{steps.<name>.…}}`
 * for anyone who wants it. Accumulation adds a path; it removes none.
 *
 * ── Why the loop rather than a spread ─────────────────────────────────────
 *
 * `{ ...carried, ...own }` would let an `undefined` own value erase a real
 * carried one, because spread copies a key whose value is `undefined`. A field
 * a step does not declare must never blank a field an earlier step collected,
 * so `undefined` is skipped explicitly.
 *
 * `false`, `0` and `''` are the opposite case: they are values a user actually
 * chose, so they overwrite. Dropping them is the classic falsy-check bug — a
 * threshold of `0` or a flag deliberately turned off would silently revert to
 * whatever an earlier step happened to carry, and the user would have no way to
 * express "off".
 */
export function buildPassthroughOutput(
  inputData: any,
  resolvedProperties: Record<string, any> | null | undefined
): Record<string, any> {
  const output: Record<string, any> = isPlainObject(inputData) ? { ...inputData } : {};

  if (isPlainObject(resolvedProperties)) {
    Object.entries(resolvedProperties).forEach(([key, value]) => {
      // An undeclared field must not erase a carried one.
      if (value === undefined) return;
      // Everything else wins, `false` / `0` / `''` included.
      output[key] = value;
    });
  }

  return output;
}
