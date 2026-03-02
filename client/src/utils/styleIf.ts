import { evaluateFormula } from './formula';

export interface StyleIfCondition {
  condition: string;
  class: string;
}

/**
 * Evaluate styleIf conditions against a data context.
 * Returns an array of CSS class names whose conditions evaluated to truthy.
 * Invalid conditions are silently skipped.
 */
export function evaluateStyleIf(
  conditions: StyleIfCondition[],
  context: Record<string, unknown>
): string[] {
  if (!Array.isArray(conditions) || conditions.length === 0) return [];

  const classes: string[] = [];

  for (const item of conditions) {
    if (!item || typeof item.condition !== 'string' || typeof item.class !== 'string') continue;
    if (!item.condition.trim() || !item.class.trim()) continue;

    try {
      const result = evaluateFormula(item.condition, { row: context });
      if (toBoolean(result)) {
        classes.push(item.class);
      }
    } catch {
      // Skip invalid conditions silently
    }
  }

  return classes;
}

function toBoolean(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  return true;
}
