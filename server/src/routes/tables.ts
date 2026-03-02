import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userTables, userRows } from '../db/schema.js';
import { requireAuthIfProtected, type AuthenticatedRequest } from '../middleware/auth.js';

export const tablesRouter = Router({ mergeParams: true });

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Column types and their validators
const COLUMN_TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const;
type ColumnType = typeof COLUMN_TYPES[number];

type ColumnDef = {
  name: string;
  type: ColumnType;
  required?: boolean;
  options?: string[]; // for 'select' type
};

const COLUMN_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/;
const MAX_COLUMNS = 30;
const MAX_TABLES_PER_APP = 20;
const MAX_ROWS_PER_TABLE = 10_000;
const MAX_VALUE_LENGTH = 5_000;

function isValidColumnDef(col: unknown): col is ColumnDef {
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

function validateRowData(data: unknown, columns: ColumnDef[]): { valid: boolean; error?: string; cleaned?: Record<string, unknown> } {
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

const TABLE_NAME_REGEX = /^[a-zA-Z\u0400-\u04FF][a-zA-Z0-9\u0400-\u04FF_ ]{0,99}$/;

// POST /api/app/:hash/tables — create a new table
tablesRouter.post('/', limiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const { name, columns } = req.body as { name: unknown; columns: unknown };

    if (!name || typeof name !== 'string' || !TABLE_NAME_REGEX.test(name)) {
      return res.status(400).json({ error: 'name must be a string matching /^[a-zA-Z\\u0400-\\u04FF][a-zA-Z0-9\\u0400-\\u04FF_ ]{0,99}$/' });
    }

    if (!Array.isArray(columns) || columns.length === 0 || columns.length > MAX_COLUMNS) {
      return res.status(400).json({ error: `columns must be an array of 1-${MAX_COLUMNS} column definitions` });
    }

    if (!columns.every(isValidColumnDef)) {
      return res.status(400).json({ error: 'Each column must have a valid name (alphanumeric, starts with letter, max 50 chars) and type (text, number, date, boolean, select)' });
    }

    // Check for duplicate column names
    const names = columns.map((c: ColumnDef) => c.name);
    if (new Set(names).size !== names.length) {
      return res.status(400).json({ error: 'Duplicate column names are not allowed' });
    }

    // Check table limit per app
    const existing = await db.select({ id: userTables.id }).from(userTables).where(eq(userTables.appId, row.id));
    if (existing.length >= MAX_TABLES_PER_APP) {
      return res.status(400).json({ error: `Maximum ${MAX_TABLES_PER_APP} tables per app` });
    }

    const inserted = await db.insert(userTables).values({
      appId: row.id,
      name: name.trim(),
      columns: columns as ColumnDef[],
    }).returning({ id: userTables.id });

    return res.json({ id: inserted[0].id, name: name.trim(), columns });
  } catch (error) {
    console.error('[POST /tables] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/tables — list all tables for an app
tablesRouter.get('/', requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tables = await db.select().from(userTables).where(eq(userTables.appId, row.id));

    return res.json({
      tables: tables.map((t) => ({
        id: t.id,
        name: t.name,
        columns: t.columns,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('[GET /tables] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/tables/:tableId — get a table with its rows
tablesRouter.get('/:tableId', requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tableId = parseInt(req.params.tableId as string, 10);
    if (isNaN(tableId)) {
      return res.status(400).json({ error: 'Invalid tableId' });
    }

    const [table] = await db.select().from(userTables).where(
      and(eq(userTables.id, tableId), eq(userTables.appId, row.id))
    );
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const rows = await db.select().from(userRows)
      .where(eq(userRows.tableId, tableId))
      .orderBy(desc(userRows.createdAt));

    return res.json({
      id: table.id,
      name: table.name,
      columns: table.columns,
      createdAt: table.createdAt,
      rows: rows.map((r) => ({ id: r.id, data: r.data, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    });
  } catch (error) {
    console.error('[GET /tables/:tableId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/app/:hash/tables/:tableId — update table schema (name and/or columns)
tablesRouter.put('/:tableId', limiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tableId = parseInt(req.params.tableId as string, 10);
    if (isNaN(tableId)) {
      return res.status(400).json({ error: 'Invalid tableId' });
    }

    const [table] = await db.select().from(userTables).where(
      and(eq(userTables.id, tableId), eq(userTables.appId, row.id))
    );
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const updates: Partial<{ name: string; columns: ColumnDef[] }> = {};
    const { name, columns } = req.body as { name?: unknown; columns?: unknown };

    if (name !== undefined) {
      if (typeof name !== 'string' || !TABLE_NAME_REGEX.test(name)) {
        return res.status(400).json({ error: 'Invalid table name' });
      }
      updates.name = name.trim();
    }

    if (columns !== undefined) {
      if (!Array.isArray(columns) || columns.length === 0 || columns.length > MAX_COLUMNS) {
        return res.status(400).json({ error: `columns must be an array of 1-${MAX_COLUMNS} column definitions` });
      }
      if (!columns.every(isValidColumnDef)) {
        return res.status(400).json({ error: 'Each column must have a valid name and type' });
      }
      const colNames = columns.map((c: ColumnDef) => c.name);
      if (new Set(colNames).size !== colNames.length) {
        return res.status(400).json({ error: 'Duplicate column names are not allowed' });
      }
      updates.columns = columns as ColumnDef[];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update — provide name and/or columns' });
    }

    await db.update(userTables).set(updates).where(eq(userTables.id, tableId));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[PUT /tables/:tableId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/app/:hash/tables/:tableId — delete a table and all its rows
tablesRouter.delete('/:tableId', limiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tableId = parseInt(req.params.tableId as string, 10);
    if (isNaN(tableId)) {
      return res.status(400).json({ error: 'Invalid tableId' });
    }

    const [table] = await db.select().from(userTables).where(
      and(eq(userTables.id, tableId), eq(userTables.appId, row.id))
    );
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    // Rows are cascade-deleted by FK constraint
    await db.delete(userTables).where(eq(userTables.id, tableId));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /tables/:tableId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/tables/:tableId/rows — add a row to a table
tablesRouter.post('/:tableId/rows', limiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tableId = parseInt(req.params.tableId as string, 10);
    if (isNaN(tableId)) {
      return res.status(400).json({ error: 'Invalid tableId' });
    }

    const [table] = await db.select().from(userTables).where(
      and(eq(userTables.id, tableId), eq(userTables.appId, row.id))
    );
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const { data } = req.body as { data: unknown };
    const columns = table.columns as ColumnDef[];
    const result = validateRowData(data, columns);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    // Check row count limit
    const [{ count }] = await db.select({ count: db.$count(userRows) }).from(userRows).where(eq(userRows.tableId, tableId));
    if (count >= MAX_ROWS_PER_TABLE) {
      return res.status(400).json({ error: `Maximum ${MAX_ROWS_PER_TABLE} rows per table` });
    }

    const inserted = await db.insert(userRows).values({
      tableId,
      data: result.cleaned!,
    }).returning({ id: userRows.id, createdAt: userRows.createdAt });

    return res.json({ id: inserted[0].id, data: result.cleaned, createdAt: inserted[0].createdAt });
  } catch (error) {
    console.error('[POST /tables/:tableId/rows] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/app/:hash/tables/:tableId/rows/:rowId — update a row
tablesRouter.put('/:tableId/rows/:rowId', limiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tableId = parseInt(req.params.tableId as string, 10);
    const rowId = parseInt(req.params.rowId as string, 10);
    if (isNaN(tableId) || isNaN(rowId)) {
      return res.status(400).json({ error: 'Invalid tableId or rowId' });
    }

    const [table] = await db.select().from(userTables).where(
      and(eq(userTables.id, tableId), eq(userTables.appId, row.id))
    );
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const [existingRow] = await db.select().from(userRows).where(
      and(eq(userRows.id, rowId), eq(userRows.tableId, tableId))
    );
    if (!existingRow) {
      return res.status(404).json({ error: 'Row not found' });
    }

    const { data } = req.body as { data: unknown };
    const columns = table.columns as ColumnDef[];
    const result = validateRowData(data, columns);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    await db.update(userRows).set({
      data: result.cleaned!,
      updatedAt: new Date().toISOString(),
    }).where(eq(userRows.id, rowId));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[PUT /tables/:tableId/rows/:rowId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/app/:hash/tables/:tableId/rows/:rowId — delete a row
tablesRouter.delete('/:tableId/rows/:rowId', limiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tableId = parseInt(req.params.tableId as string, 10);
    const rowId = parseInt(req.params.rowId as string, 10);
    if (isNaN(tableId) || isNaN(rowId)) {
      return res.status(400).json({ error: 'Invalid tableId or rowId' });
    }

    const [table] = await db.select().from(userTables).where(
      and(eq(userTables.id, tableId), eq(userTables.appId, row.id))
    );
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const deleted = await db.delete(userRows).where(
      and(eq(userRows.id, rowId), eq(userRows.tableId, tableId))
    ).returning({ id: userRows.id });

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Row not found' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /tables/:tableId/rows/:rowId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
