import type { FilterCondition, FilterOperator } from '../services/aiService.js';

type RowWithMeta = { id: number; data: Record<string, unknown>; createdAt: string; updatedAt: string | null };

export const VALID_OPERATORS: Set<string> = new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'contains']);

function applyCondition(rowData: Record<string, unknown>, condition: FilterCondition): boolean {
  const { column, value } = condition;
  const operator: FilterOperator = condition.operator ?? 'eq';

  if (!(column in rowData)) {
    // Unknown column — condition passes (don't exclude rows for missing data)
    return true;
  }

  const cellValue = rowData[column];

  switch (operator) {
    case 'eq':
      // eslint-disable-next-line eqeqeq
      return cellValue == value;
    case 'ne':
      // eslint-disable-next-line eqeqeq
      return cellValue != value;
    case 'lt':
      if (cellValue === null || cellValue === undefined) return false;
      return compareOrdered(cellValue, value) < 0;
    case 'lte':
      if (cellValue === null || cellValue === undefined) return false;
      return compareOrdered(cellValue, value) <= 0;
    case 'gt':
      if (cellValue === null || cellValue === undefined) return false;
      return compareOrdered(cellValue, value) > 0;
    case 'gte':
      if (cellValue === null || cellValue === undefined) return false;
      return compareOrdered(cellValue, value) >= 0;
    case 'contains':
      if (cellValue === null || cellValue === undefined) return false;
      return String(cellValue).toLowerCase().includes(String(value).toLowerCase());
    default:
      // Unknown operator — condition passes
      return true;
  }
}

export function applyFilter(
  rows: RowWithMeta[],
  filter: FilterCondition | FilterCondition[]
): RowWithMeta[] {
  const conditions = Array.isArray(filter) ? filter : [filter];

  if (conditions.length === 0) return rows;

  return rows.filter((row) =>
    conditions.every((condition) => {
      // Skip conditions with unknown operators
      if (condition.operator !== undefined && !VALID_OPERATORS.has(condition.operator)) {
        return true;
      }
      return applyCondition(row.data, condition);
    })
  );
}

/**
 * Parse a raw filter query param value into FilterCondition | FilterCondition[].
 * Returns null if invalid (so the caller can ignore and return all rows).
 */
export function parseFilterParam(raw: unknown): FilterCondition | FilterCondition[] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    const conditions = parsed.filter(isValidCondition);
    return conditions.length > 0 ? conditions : null;
  }

  if (isValidCondition(parsed)) {
    return parsed as FilterCondition;
  }

  return null;
}

/**
 * Compare two values for ordering. Uses numeric comparison when both parse as
 * finite numbers; otherwise falls back to lexicographic string comparison.
 * Returns negative, 0, or positive (like localeCompare / Array.sort comparator).
 */
function compareOrdered(a: unknown, b: unknown): number {
  const numA = Number(a);
  const numB = Number(b);
  if (isFinite(numA) && isFinite(numB)) {
    return numA - numB;
  }
  // Lexicographic fallback (works for ISO date strings YYYY-MM-DD)
  const strA = String(a);
  const strB = String(b);
  if (strA < strB) return -1;
  if (strA > strB) return 1;
  return 0;
}

export function isValidCondition(v: unknown): v is FilterCondition {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;

  if (typeof obj.column !== 'string' || obj.column.trim() === '') return false;

  const valueType = typeof obj.value;
  if (valueType !== 'string' && valueType !== 'number' && valueType !== 'boolean') return false;

  if (obj.operator !== undefined && !VALID_OPERATORS.has(obj.operator as string)) return false;

  return true;
}
