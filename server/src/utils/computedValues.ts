import { evaluateFormula } from './formula/index.js';
import type { FormulaContext } from './formula/index.js';
import type { UiComponent } from '../services/aiService.js';

/**
 * Extract table names referenced in computedValue formulas.
 * Looks for patterns like "tableName.column" in the formula text.
 * Returns a deduplicated set of table names.
 */
export function extractReferencedTableNames(components: UiComponent[]): Set<string> {
  const names = new Set<string>();
  for (const comp of components) {
    if (!comp.computedValue) continue;
    // Match identifiers followed by a dot (table.column references), including Cyrillic
    const matches = comp.computedValue.matchAll(/([a-zA-Z_\u0400-\u04FF][a-zA-Z0-9_\u0400-\u04FF]*)\.([a-zA-Z_\u0400-\u04FF][a-zA-Z0-9_\u0400-\u04FF]*)/g);
    for (const m of matches) {
      names.add(m[1]);
    }
    // Also match standalone identifiers in COUNT(tableName) pattern, including Cyrillic
    const countMatches = comp.computedValue.matchAll(/\bCOUNT\s*\(\s*([a-zA-Z_\u0400-\u04FF][a-zA-Z0-9_\u0400-\u04FF]*)\s*\)/gi);
    for (const m of countMatches) {
      // Only add if it doesn't contain a dot (already handled above)
      if (!m[1].includes('.')) {
        names.add(m[1]);
      }
    }
  }
  return names;
}

type TableData = {
  columns: Array<{ name: string; type: string; required?: boolean; options?: string[]; formula?: string }>;
  rows: Array<Record<string, unknown>>;
};

/**
 * Evaluate all computedValue formulas in the UI components array.
 * Returns a map of component index -> computed value.
 * Failed evaluations produce null.
 */
export function evaluateComputedValues(
  components: UiComponent[],
  tables: Record<string, TableData>
): Record<number, unknown> {
  const result: Record<number, unknown> = {};
  const context: FormulaContext = { tables };

  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    if (!comp.computedValue) continue;

    try {
      result[i] = evaluateFormula(comp.computedValue, context);
    } catch (err) {
      console.warn(`[formula] Failed to evaluate computedValue "${comp.computedValue}" for component ${i}:`, err);
      result[i] = null;
    }
  }

  return result;
}
