import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userTables, userRows } from '../db/schema.js';
import { resolveUserAndRole, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { isValidColumnDef, validateRowData } from '../utils/tableValidation.js';
import type { ColumnDef } from '../utils/tableValidation.js';
import { evaluateFormulaColumns } from '../utils/formulaColumns.js';
import { applyFilter, parseFilterParam } from '../utils/filterRows.js';

export const tablesRouter = Router({ mergeParams: true });

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const MAX_COLUMNS = 30;
const MAX_TABLES_PER_APP = 20;
const MAX_ROWS_PER_TABLE = 10_000;

const TABLE_NAME_REGEX = /^[a-zA-Z\u0400-\u04FF][a-zA-Z0-9\u0400-\u04FF_ ]{0,99}$/;

// POST /api/app/:hash/tables — create a new table
tablesRouter.post('/', limiter, resolveUserAndRole, requireRole('owner'), async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const { name, columns } = req.body as { name: unknown; columns: unknown };

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }
    const trimmedName = name.trim();
    if (!TABLE_NAME_REGEX.test(trimmedName)) {
      return res.status(400).json({ error: 'name must be a string matching /^[a-zA-Z\\u0400-\\u04FF][a-zA-Z0-9\\u0400-\\u04FF_ ]{0,99}$/' });
    }

    if (!Array.isArray(columns) || columns.length === 0 || columns.length > MAX_COLUMNS) {
      return res.status(400).json({ error: `columns must be an array of 1-${MAX_COLUMNS} column definitions` });
    }

    if (!columns.every(isValidColumnDef)) {
      return res.status(400).json({ error: 'Each column must have a valid name (alphanumeric, starts with letter, max 50 chars) and type (text, number, date, boolean, select, formula)' });
    }

    // Check for duplicate column names
    const names = columns.map((c: ColumnDef) => c.name);
    if (new Set(names).size !== names.length) {
      return res.status(400).json({ error: 'Duplicate column names are not allowed' });
    }

    // Check table limit per app and duplicate names
    const existing = await db.select({ id: userTables.id, name: userTables.name }).from(userTables).where(eq(userTables.appId, row.id));
    if (existing.length >= MAX_TABLES_PER_APP) {
      return res.status(400).json({ error: `Maximum ${MAX_TABLES_PER_APP} tables per app` });
    }
    if (existing.some((t) => t.name === trimmedName)) {
      return res.status(400).json({ error: 'A table with this name already exists' });
    }

    // Sanitize columns to only known fields
    const cleanedColumns: ColumnDef[] = (columns as ColumnDef[]).map((c) => {
      const result: ColumnDef = { name: c.name, type: c.type };
      if (c.required === true) result.required = true;
      if (c.type === 'select' && Array.isArray(c.options)) result.options = c.options;
      if (c.type === 'formula' && typeof c.formula === 'string') result.formula = c.formula;
      return result;
    });

    const inserted = await db.insert(userTables).values({
      appId: row.id,
      name: trimmedName,
      columns: cleanedColumns,
    }).returning({ id: userTables.id });

    return res.json({ id: inserted[0].id, name: trimmedName, columns: cleanedColumns });
  } catch (error) {
    console.error('[POST /tables] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/tables — list all tables for an app
tablesRouter.get('/', resolveUserAndRole, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const tables = await db.select().from(userTables).where(eq(userTables.appId, row.id));

    return res.json({
      tables: tables.map((t) => ({
        id: t.id,
        name: t.name,
        columns: t.columns,
        rlsEnabled: t.rlsEnabled === 1,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('[GET /tables] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/tables/:tableId — get a table with its rows
tablesRouter.get('/:tableId', resolveUserAndRole, async (req, res) => {
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

    const authReq = req as AuthenticatedRequest;
    const userRole = authReq.userRole;
    const userId = authReq.userId;

    // RLS filtering: viewer/anonymous see only their own rows in RLS-enabled tables
    const isRlsRestricted = (userRole === 'viewer' || userRole === 'anonymous') && table.rlsEnabled === 1;
    let rowFilter;
    if (isRlsRestricted) {
      rowFilter = userId
        ? and(eq(userRows.tableId, tableId), eq(userRows.createdByUserId, userId))
        : and(eq(userRows.tableId, tableId), sql`0`); // anonymous sees nothing
    } else {
      rowFilter = eq(userRows.tableId, tableId);
    }

    const dbRows = await db.select().from(userRows)
      .where(rowFilter)
      .orderBy(desc(userRows.createdAt));

    const columns = table.columns as ColumnDef[];
    const mappedRows = dbRows.map((r) => ({
      id: r.id,
      data: r.data as Record<string, unknown>,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    const rowsWithFormulas = evaluateFormulaColumns(mappedRows, columns);

    const filterParam = parseFilterParam(req.query.filter);
    const filteredRows = filterParam ? applyFilter(rowsWithFormulas, filterParam) : rowsWithFormulas;

    return res.json({
      id: table.id,
      name: table.name,
      columns: table.columns,
      rlsEnabled: table.rlsEnabled === 1,
      createdAt: table.createdAt,
      rows: filteredRows,
    });
  } catch (error) {
    console.error('[GET /tables/:tableId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/app/:hash/tables/:tableId — update table schema (name and/or columns)
tablesRouter.put('/:tableId', limiter, resolveUserAndRole, requireRole('owner'), async (req, res) => {
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

    const updates: Partial<{ name: string; columns: ColumnDef[]; rlsEnabled: number }> = {};
    const { name, columns, rlsEnabled } = req.body as { name?: unknown; columns?: unknown; rlsEnabled?: unknown };

    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'Invalid table name' });
      }
      const trimmedUpdateName = name.trim();
      if (!TABLE_NAME_REGEX.test(trimmedUpdateName)) {
        return res.status(400).json({ error: 'Invalid table name' });
      }
      // Check for duplicate table name within the same app (exclude current table)
      const existing = await db.select({ id: userTables.id, name: userTables.name }).from(userTables).where(eq(userTables.appId, row.id));
      if (existing.some((t) => t.name === trimmedUpdateName && t.id !== tableId)) {
        return res.status(400).json({ error: 'A table with this name already exists' });
      }
      updates.name = trimmedUpdateName;
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
      updates.columns = (columns as ColumnDef[]).map((c) => {
        const result: ColumnDef = { name: c.name, type: c.type };
        if (c.required === true) result.required = true;
        if (c.type === 'select' && Array.isArray(c.options)) result.options = c.options;
        if (c.type === 'formula' && typeof c.formula === 'string') result.formula = c.formula;
        return result;
      });
    }

    if (rlsEnabled !== undefined) {
      if (typeof rlsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'rlsEnabled must be a boolean' });
      }
      updates.rlsEnabled = rlsEnabled ? 1 : 0;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update — provide name, columns, and/or rlsEnabled' });
    }

    await db.update(userTables).set(updates).where(eq(userTables.id, tableId));

    return res.json({ ok: true });
  } catch (error) {
    console.error('[PUT /tables/:tableId] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/app/:hash/tables/:tableId — delete a table and all its rows
tablesRouter.delete('/:tableId', limiter, resolveUserAndRole, requireRole('owner'), async (req, res) => {
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
tablesRouter.post('/:tableId/rows', limiter, resolveUserAndRole, requireRole('editor', 'owner'), async (req, res) => {
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
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(userRows).where(eq(userRows.tableId, tableId));
    if (count >= MAX_ROWS_PER_TABLE) {
      return res.status(400).json({ error: `Maximum ${MAX_ROWS_PER_TABLE} rows per table` });
    }

    const authReq = req as AuthenticatedRequest;
    const inserted = await db.insert(userRows).values({
      tableId,
      data: result.cleaned!,
      createdByUserId: authReq.userId || null,
    }).returning({ id: userRows.id, createdAt: userRows.createdAt });

    return res.json({ id: inserted[0].id, data: result.cleaned, createdAt: inserted[0].createdAt });
  } catch (error) {
    console.error('[POST /tables/:tableId/rows] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/app/:hash/tables/:tableId/rows/:rowId — update a row
tablesRouter.put('/:tableId/rows/:rowId', limiter, resolveUserAndRole, requireRole('viewer', 'editor', 'owner'), async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const row = authReq.app_row!;
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

    // Viewer can only update rows in RLS-enabled tables (and only their own)
    if (authReq.userRole === 'viewer') {
      if (table.rlsEnabled !== 1) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const [existingRow] = await db.select().from(userRows).where(
      and(eq(userRows.id, rowId), eq(userRows.tableId, tableId))
    );
    if (!existingRow) {
      return res.status(404).json({ error: 'Row not found' });
    }

    // Viewer can only update their own rows
    if (authReq.userRole === 'viewer' && existingRow.createdByUserId !== authReq.userId) {
      return res.status(403).json({ error: 'Forbidden' });
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
tablesRouter.delete('/:tableId/rows/:rowId', limiter, resolveUserAndRole, requireRole('viewer', 'editor', 'owner'), async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const row = authReq.app_row!;
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

    // Viewer can only delete rows in RLS-enabled tables (and only their own)
    if (authReq.userRole === 'viewer') {
      if (table.rlsEnabled !== 1) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      // Check ownership before deleting
      const [existingRow] = await db.select().from(userRows).where(
        and(eq(userRows.id, rowId), eq(userRows.tableId, tableId))
      );
      if (!existingRow) {
        return res.status(404).json({ error: 'Row not found' });
      }
      if (existingRow.createdByUserId !== authReq.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
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
