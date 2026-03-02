// Column types and their validators — shared between routes/tables.ts and tests

export const COLUMN_TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const;
export type ColumnType = typeof COLUMN_TYPES[number];

export type ColumnDef = {
  name: string;
  type: ColumnType;
  required?: boolean;
  options?: string[]; // for 'select' type
};

const COLUMN_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/;
const MAX_VALUE_LENGTH = 5_000;

export function isValidColumnDef(col: unknown): col is ColumnDef {
  if (!col || typeof col !== 'object' || Array.isArray(col)) return false;
  const c = col as Record<string, unknown>;
  if (typeof c.name !== 'string' || !COLUMN_NAME_REGEX.test(c.name)) return false;
  if (typeof c.type !== 'string' || !COLUMN_TYPES.includes(c.type as ColumnType)) return false;
  if (c.type === 'select') {
    if (!Array.isArray(c.options) || c.options.length === 0 || c.options.length > 50) return false;
    if (!c.options.every((o: unknown) => typeof o === 'string' && o.length > 0 && o.length <= 200)) return false;
  }
  return true;
}

export function validateRowData(data: unknown, columns: ColumnDef[]): { valid: boolean; error?: string; cleaned?: Record<string, unknown> } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'data must be an object' };
  }
  const d = data as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};

  for (const col of columns) {
    const value = d[col.name];

    // Handle missing/null values
    if (value === undefined || value === null) {
      if (col.required) {
        return { valid: false, error: `Field "${col.name}" is required` };
      }
      cleaned[col.name] = null;
      continue;
    }

    // Type validation
    switch (col.type) {
      case 'text': {
        if (typeof value !== 'string') {
          return { valid: false, error: `Field "${col.name}" must be a string` };
        }
        if (value.length > MAX_VALUE_LENGTH) {
          return { valid: false, error: `Field "${col.name}" exceeds max length (${MAX_VALUE_LENGTH})` };
        }
        cleaned[col.name] = value;
        break;
      }
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return { valid: false, error: `Field "${col.name}" must be a finite number` };
        }
        cleaned[col.name] = value;
        break;
      }
      case 'date': {
        if (typeof value !== 'string') {
          return { valid: false, error: `Field "${col.name}" must be a date string` };
        }
        const parsed = Date.parse(value);
        if (isNaN(parsed)) {
          return { valid: false, error: `Field "${col.name}" is not a valid date` };
        }
        cleaned[col.name] = new Date(parsed).toISOString();
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') {
          return { valid: false, error: `Field "${col.name}" must be a boolean` };
        }
        cleaned[col.name] = value;
        break;
      }
      case 'select': {
        if (typeof value !== 'string') {
          return { valid: false, error: `Field "${col.name}" must be a string` };
        }
        if (!col.options?.includes(value)) {
          return { valid: false, error: `Field "${col.name}" must be one of: ${col.options?.join(', ')}` };
        }
        cleaned[col.name] = value;
        break;
      }
    }
  }

  return { valid: true, cleaned };
}
