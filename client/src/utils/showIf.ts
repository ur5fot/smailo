import { evaluateFormula } from './formula';

/**
 * Evaluate a showIf expression against a data context.
 * Returns true if the component should be visible, false otherwise.
 * Missing showIf (empty string) defaults to true (always visible).
 * Any evaluation error returns false (hide the component).
 */
export function evaluateShowIf(expression: string, context: Record<string, unknown>): boolean {
  if (!expression || expression.trim() === '') return true;

  try {
    const result = evaluateFormula(expression, { row: context });
    return toBoolean(result);
  } catch {
    return false;
  }
}

function toBoolean(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  return true;
}
