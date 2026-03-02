import { evaluateFormula } from './formula/index.js';
import type { FormulaContext } from './formula/index.js';
import type { ColumnDef } from './tableValidation.js';

type RowWithMeta = { id: number; data: Record<string, unknown>; createdAt: string; updatedAt: string | null };

/**
 * Evaluate formula columns for a set of rows, injecting computed values into each row's data.
 * If a formula evaluation fails, the value is set to null.
 */
export function evaluateFormulaColumns(
  rows: RowWithMeta[],
  columns: ColumnDef[]
): RowWithMeta[] {
  const formulaColumns = columns.filter(c => c.type === 'formula' && c.formula);
  if (formulaColumns.length === 0) return rows;

  // Build table-level context for aggregate functions within formula columns
  const allRowData = rows.map(r => r.data);
  const currentTable = { columns, rows: allRowData };

  return rows.map(r => {
    const data = { ...r.data };
    for (const col of formulaColumns) {
      const context: FormulaContext = {
        row: data,
        currentTable,
      };
      try {
        data[col.name] = evaluateFormula(col.formula!, context);
      } catch (err) {
        console.warn(`[formula] Failed to evaluate formula column "${col.name}" (${col.formula}):`, err);
        data[col.name] = null;
      }
    }
    return { ...r, data };
  });
}
