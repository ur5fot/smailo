import { evaluateFormula } from './formula/index.js';
import type { FormulaContext } from './formula/index.js';
import type { ColumnDef } from './tableValidation.js';
import { logger } from './logger.js';

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

  // Work with mutable copies of row data
  const rowDataCopies = rows.map(r => ({ ...r.data }));

  // Process one formula column at a time across ALL rows, so that aggregate
  // functions (e.g. SUM(col)) in later formula columns can see earlier ones.
  for (const col of formulaColumns) {
    const currentTable = { columns, rows: rowDataCopies };
    for (let i = 0; i < rows.length; i++) {
      const context: FormulaContext = {
        row: rowDataCopies[i],
        currentTable,
      };
      try {
        rowDataCopies[i][col.name] = evaluateFormula(col.formula!, context);
      } catch (err) {
        logger.warn({ columnName: col.name, formula: col.formula, err }, 'Failed to evaluate formula column');
        rowDataCopies[i][col.name] = null;
      }
    }
  }

  return rows.map((r, i) => ({ ...r, data: rowDataCopies[i] }));
}
