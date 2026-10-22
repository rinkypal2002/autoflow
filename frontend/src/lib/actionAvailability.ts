import type {
  ActionAvailability,
  AutomationCategory,
  WorkflowAction,
} from '../types/workflow';

export const BACKEND_CONNECTOR_NOT_INSTALLED = 'BACKEND_CONNECTOR_NOT_INSTALLED';
export const DEFAULT_UNAVAILABLE_REASON = 'Backend connector not installed';

const AVAILABLE: ActionAvailability = Object.freeze({ state: 'available' });

function normalizedUnavailable(
  value?: ActionAvailability,
): ActionAvailability {
  return {
    state: 'unavailable',
    code: value?.code || BACKEND_CONNECTOR_NOT_INSTALLED,
    reason: value?.reason || DEFAULT_UNAVAILABLE_REASON,
  };
}

/**
 * Resolve package availability from the catalogue contract.
 *
 * `control.enabled === false` is authoritative. The explicit availability
 * object carries the user-facing reason and machine-readable code.
 */
export function getCategoryAvailability(
  category: Pick<AutomationCategory, 'control'> | null | undefined,
): ActionAvailability {
  const configured = category?.control?.availability;

  if (category?.control?.enabled === false || configured?.state === 'unavailable') {
    return normalizedUnavailable(configured);
  }

  return AVAILABLE;
}

export function isCategoryExecutable(
  category: Pick<AutomationCategory, 'control'> | null | undefined,
): boolean {
  return getCategoryAvailability(category).state === 'available';
}

function findCategory(
  action: Pick<WorkflowAction, 'category'> | null | undefined,
  categories: readonly AutomationCategory[],
): AutomationCategory | undefined {
  const categoryId = String(action?.category || '').trim();
  return categoryId
    ? categories.find((category) => category.id === categoryId)
    : undefined;
}

/**
 * Resolve a saved or catalogue action against the current package catalogue.
 * This is what keeps previously-saved OneDrive/Adobe nodes blocked even though
 * old workflow JSON does not carry the newer package availability metadata.
 */
export function getWorkflowActionAvailability(
  action: Partial<WorkflowAction> | null | undefined,
  categories: readonly AutomationCategory[],
): ActionAvailability {
  if (action?.availability?.state === 'unavailable') {
    return normalizedUnavailable(action.availability);
  }

  const category = findCategory(action as Pick<WorkflowAction, 'category'>, categories);
  return category ? getCategoryAvailability(category) : AVAILABLE;
}

export function isWorkflowActionExecutable(
  action: Partial<WorkflowAction> | null | undefined,
  categories: readonly AutomationCategory[],
): boolean {
  return getWorkflowActionAvailability(action, categories).state === 'available';
}

export interface UnavailableWorkflowAction {
  nodeId: string;
  nodeName: string;
  categoryId: string;
  code: string;
  reason: string;
}

export function findUnavailableWorkflowActions(
  actions: readonly WorkflowAction[],
  categories: readonly AutomationCategory[],
): UnavailableWorkflowAction[] {
  const unavailable: UnavailableWorkflowAction[] = [];

  for (const action of actions ?? []) {
    if (action?.isControlNode) continue;

    const availability = getWorkflowActionAvailability(action, categories);
    if (availability.state !== 'unavailable') continue;

    unavailable.push({
      nodeId: String(action.id || ''),
      nodeName: String(action.name || action.type || 'Untitled node'),
      categoryId: String(action.category || ''),
      code: availability.code || BACKEND_CONNECTOR_NOT_INSTALLED,
      reason: availability.reason || DEFAULT_UNAVAILABLE_REASON,
    });
  }

  return unavailable;
}
