import { Router, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, desc, sql, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appData, chatHistory, userTables, userRows } from '../db/schema.js';
import { getLatestAppData } from '../db/queries.js';
import { chatWithAI, validateUiComponents, validatePages } from '../services/aiService.js';
import type { UiComponent, AppConfig } from '../services/aiService.js';
import { cronManager } from '../services/cronManager.js';
import { requireAuthIfProtected, JWT_SECRET, type AuthenticatedRequest } from '../middleware/auth.js';
import { extractReferencedTableNames, evaluateComputedValues, getGlobalComponents } from '../utils/computedValues.js';
import { evaluateFormulaColumns } from '../utils/formulaColumns.js';
import type { ColumnDef } from '../utils/tableValidation.js';
import { fetchSafe, extractDataPath } from '../utils/fetchProxy.js';

type AppDataInsert = typeof appData.$inferInsert;
type ChatHistoryInsert = typeof chatHistory.$inferInsert;

export const appRouter = Router();

const CHAT_HISTORY_LIMIT = 20;

/** Delete old app_data rows, keeping only the N most recent per (app_id, key). */
export async function pruneOldAppData(maxRowsPerKey = 100) {
  await db.run(sql`
    DELETE FROM app_data WHERE id NOT IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY app_id, key ORDER BY id DESC) AS rn
        FROM app_data
      ) WHERE rn <= ${maxRowsPerKey}
    )
  `);
}


const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});


// GET /api/app/:hash
appRouter.get('/:hash', requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;

    // Update lastVisit
    await db
      .update(apps)
      .set({ lastVisit: new Date().toISOString() })
      .where(eq(apps.id, row.id));

    // Fetch latest appData (most recent entry per key, deduplicated)
    const data = await getLatestAppData(row.id);

    // Fetch user-defined table schemas
    const tables = await db.select({
      id: userTables.id,
      name: userTables.name,
      columns: userTables.columns,
      createdAt: userTables.createdAt,
    }).from(userTables).where(eq(userTables.appId, row.id));

    // Return app config + appData; strip server-side-only cronJobs from the config
    // to avoid exposing fetch_url targets and automation configs to the browser.
    const { cronJobs: _cronJobs, ...clientConfig } = (row.config as Record<string, unknown>) ?? {};
    return res.json({
      hash: row.hash,
      userId: row.userId ?? null,
      appName: row.appName,
      description: row.description,
      config: clientConfig,
      createdAt: row.createdAt,
      appData: data,
      tables,
    });
  } catch (error) {
    console.error('[GET /api/app/:hash] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/set-password
appRouter.post('/:hash/set-password', verifyLimiter, async (req: Request<{ hash: string }>, res) => {
  try {
    const { hash } = req.params;
    const { password, creationToken } = req.body as { password: string; creationToken: string };

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    // bcrypt truncates at 72 bytes (not chars); check byte length so multi-byte Unicode passwords
    // cannot produce hash collisions by differing only after byte 72
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'password must be at most 72 bytes' });
    }
    if (!creationToken || typeof creationToken !== 'string') {
      return res.status(400).json({ error: 'creationToken is required' });
    }
    if (creationToken.length > 128) {
      return res.status(400).json({ error: 'creationToken too long' });
    }

    const [row] = await db.select().from(apps).where(eq(apps.hash, hash));
    if (!row) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (row.passwordHash) {
      return res.status(400).json({ error: 'This app already has a password set' });
    }

    // Validate the one-time creation token to prevent race-condition password hijacking
    if (!row.creationToken) {
      return res.status(403).json({ error: 'Password protection is not available for this app' });
    }
    const tokenHash = createHash('sha256').update(creationToken).digest('hex');
    const storedHash = row.creationToken as string;
    if (
      tokenHash.length !== storedHash.length ||
      !timingSafeEqual(Buffer.from(tokenHash), Buffer.from(storedHash))
    ) {
      return res.status(403).json({ error: 'Invalid creation token' });
    }

    const hashed = await bcrypt.hash(password, 12);
    // Conditional UPDATE: only succeeds if passwordHash is still NULL.
    // This prevents a TOCTOU race where two concurrent requests both pass the
    // passwordHash IS NULL check above but only one should set the password.
    const updated = await db.update(apps)
      .set({ passwordHash: hashed, creationToken: null })
      .where(and(eq(apps.hash, hash), isNull(apps.passwordHash)))
      .returning({ id: apps.id });

    if (updated.length === 0) {
      return res.status(400).json({ error: 'This app already has a password set' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/app/:hash/set-password] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/verify
appRouter.post('/:hash/verify', verifyLimiter, async (req: Request<{ hash: string }>, res) => {
  try {
    const { hash } = req.params;
    const { password } = req.body as { password: string };

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required' });
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'password must be at most 72 bytes' });
    }

    const [row] = await db.select().from(apps).where(eq(apps.hash, hash));
    if (!row) {
      return res.status(404).json({ error: 'App not found' });
    }

    if (!row.passwordHash) {
      return res.status(400).json({ error: 'This app is not password protected' });
    }

    const valid = await bcrypt.compare(password, row.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ hash }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch (error) {
    console.error('[POST /api/app/:hash/verify] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/data
appRouter.get('/:hash/data', requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;

    const data = await getLatestAppData(row.id);

    // Evaluate computedValue formulas from UI components
    const config = row.config as AppConfig | null;
    const allComponents = config ? getGlobalComponents(config) : [];
    const componentsWithComputed = allComponents.filter(c => c.computedValue);

    let computedValues: Record<number, unknown> | undefined;
    if (componentsWithComputed.length > 0) {
      try {
        // Find which tables are referenced by the formulas
        const tableNames = extractReferencedTableNames(allComponents);

        if (tableNames.size > 0) {
          // Fetch referenced tables by name
          const appTables = await db.select({
            id: userTables.id,
            name: userTables.name,
            columns: userTables.columns,
          }).from(userTables).where(eq(userTables.appId, row.id));

          // Build tables context: map table name -> { columns, rows }
          const tablesContext: Record<string, { columns: Array<{ name: string; type: string }>; rows: Array<Record<string, unknown>> }> = {};
          for (const table of appTables) {
            if (tableNames.has(table.name)) {
              const columns = table.columns as ColumnDef[];
              const dbRows = await db.select({
                id: userRows.id,
                data: userRows.data,
                createdAt: userRows.createdAt,
                updatedAt: userRows.updatedAt,
              }).from(userRows).where(eq(userRows.tableId, table.id));
              const mappedRows = dbRows.map(r => ({
                id: r.id,
                data: r.data as Record<string, unknown>,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              }));
              // Evaluate formula columns so computedValue formulas can reference them
              const evaluatedRows = evaluateFormulaColumns(mappedRows, columns);
              tablesContext[table.name] = {
                columns,
                rows: evaluatedRows.map(r => r.data),
              };
            }
          }

          computedValues = evaluateComputedValues(allComponents, tablesContext);
        } else {
          // No table references, but formulas might use literals or non-table functions
          computedValues = evaluateComputedValues(allComponents, {});
        }
      } catch (err) {
        console.error('[GET /api/app/:hash/data] computedValues error:', err);
      }
    }

    return res.json({
      appData: data,
      ...(computedValues && Object.keys(computedValues).length > 0 ? { computedValues } : {}),
    });
  } catch (error) {
    console.error('[GET /api/app/:hash/data] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/app/:hash/config
appRouter.put('/:hash/config', chatLimiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const body = req.body as Record<string, unknown>;

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }

    const hasUiComponents = 'uiComponents' in body;
    const hasPages = 'pages' in body;

    if (!hasUiComponents && !hasPages) {
      return res.status(400).json({ error: 'Must provide uiComponents or pages' });
    }
    if (hasUiComponents && hasPages) {
      return res.status(400).json({ error: 'Cannot provide both uiComponents and pages' });
    }

    const currentConfig = (row.config as Record<string, unknown>) ?? {};

    if (hasUiComponents) {
      if (!Array.isArray(body.uiComponents)) {
        return res.status(400).json({ error: 'uiComponents must be an array' });
      }
      const validated = validateUiComponents(body.uiComponents);
      if (validated.length === 0 && body.uiComponents.length > 0) {
        return res.status(400).json({ error: 'No valid components found' });
      }
      const { pages: _removed, ...configWithoutPages } = currentConfig;
      const updatedConfig = { ...configWithoutPages, uiComponents: validated };
      await db.update(apps).set({ config: updatedConfig }).where(eq(apps.id, row.id));
      return res.json({ ok: true, config: updatedConfig });
    }

    // hasPages
    if (!Array.isArray(body.pages)) {
      return res.status(400).json({ error: 'pages must be an array' });
    }
    const validated = validatePages(body.pages);
    if (validated.length === 0 && body.pages.length > 0) {
      return res.status(400).json({ error: 'No valid pages found' });
    }
    const { uiComponents: _removedUi, ...configWithoutComponents } = currentConfig;
    const updatedConfig = { ...configWithoutComponents, pages: validated };
    await db.update(apps).set({ config: updatedConfig }).where(eq(apps.id, row.id));
    return res.json({ ok: true, config: updatedConfig });
  } catch (error) {
    console.error('[PUT /api/app/:hash/config] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/chat
appRouter.get('/:hash/chat', requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const rows = await db
      .select()
      .from(chatHistory)
      .where(and(eq(chatHistory.appId, row.id), eq(chatHistory.sessionId, `app-${row.hash}`)))
      .orderBy(desc(chatHistory.createdAt))
      .limit(CHAT_HISTORY_LIMIT);
    return res.json({
      history: [...rows].reverse().map((r) => ({ role: r.role, content: r.content })),
    });
  } catch (error) {
    console.error('[GET /api/app/:hash/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/data
const KEY_REGEX = /^[a-zA-Z0-9_]{1,100}$/;
const VALUE_MAX_BYTES = 10_000;

appRouter.post('/:hash/data', chatLimiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const { key, value, mode, index } = req.body as { key: unknown; value: unknown; mode?: unknown; index?: unknown };

    if (!key || typeof key !== 'string' || !KEY_REGEX.test(key)) {
      return res.status(400).json({ error: 'key must be alphanumeric/underscore, max 100 chars' });
    }

    // delete-item: remove item at index from stored array
    if (mode === 'delete-item') {
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        return res.status(400).json({ error: 'index must be a non-negative integer' });
      }
      // Wrap read-modify-write in a transaction to prevent race conditions.
      // better-sqlite3 transactions are synchronous — no interleaving possible.
      db.transaction((tx) => {
        const existing = tx
          .select()
          .from(appData)
          .where(
            sql`${appData.appId} = ${row.id} AND ${appData.id} IN (
              SELECT MAX(id) FROM app_data WHERE app_id = ${row.id} AND key = ${key}
            )`
          )
          .get();
        const current = Array.isArray(existing?.value) ? existing.value : [];
        const updated = current.filter((_: unknown, i: number) => i !== index);
        tx.insert(appData).values({ appId: row.id, key, value: updated } satisfies AppDataInsert).run();
      });
      return res.json({ ok: true });
    }

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }

    let storedValue: unknown = value;

    if (mode === 'increment') {
      if (typeof value !== 'number') {
        return res.status(400).json({ error: 'value must be a number for increment mode' });
      }
      db.transaction((tx) => {
        const existing = tx
          .select()
          .from(appData)
          .where(
            sql`${appData.appId} = ${row.id} AND ${appData.id} IN (
              SELECT MAX(id) FROM app_data WHERE app_id = ${row.id} AND key = ${key}
            )`
          )
          .get();
        const current = typeof existing?.value === 'number' ? existing.value : 0;
        storedValue = current + value;
        tx.insert(appData).values({ appId: row.id, key, value: storedValue } satisfies AppDataInsert).run();
      });
    } else if (mode === 'append') {
      // Wrap read-modify-write in a transaction to prevent race conditions.
      // better-sqlite3 transactions are synchronous — no interleaving possible.
      const tooLarge = db.transaction((tx) => {
        const existing = tx
          .select()
          .from(appData)
          .where(
            sql`${appData.appId} = ${row.id} AND ${appData.id} IN (
              SELECT MAX(id) FROM app_data WHERE app_id = ${row.id} AND key = ${key}
            )`
          )
          .get();
        const current = existing?.value;
        // Wrap primitive values as objects so DataTable can bind to named fields.
        const item = (typeof value === 'string' || typeof value === 'number')
          ? { value, timestamp: new Date().toISOString() }
          : value;
        storedValue = Array.isArray(current) ? [...current, item] : [item];

        const serialized = JSON.stringify(storedValue);
        if (Buffer.byteLength(serialized, 'utf8') > VALUE_MAX_BYTES) {
          return true;
        }

        tx.insert(appData).values({ appId: row.id, key, value: storedValue } satisfies AppDataInsert).run();
        return false;
      });

      if (tooLarge) {
        return res.status(413).json({ error: 'value too large' });
      }
    } else {
      const serialized = JSON.stringify(storedValue);
      if (Buffer.byteLength(serialized, 'utf8') > VALUE_MAX_BYTES) {
        return res.status(413).json({ error: 'value too large' });
      }

      // Pass value directly — Drizzle's mode:'json' column handles serialization.
      // Do NOT pre-serialize: passing an already-stringified value causes double-encoding.
      await db.insert(appData).values({
        appId: row.id,
        key,
        value: storedValue,
      } satisfies AppDataInsert);
    }

    // Run triggered jobs and wait for them so the client gets fresh data on the next
    // fetchData() call. Cap at 15s to avoid blocking indefinitely on slow external APIs.
    await Promise.race([
      cronManager.runTriggeredJobs(row.id, key),
      new Promise<void>((resolve) => setTimeout(resolve, 15_000)),
    ]).catch((err) => {
      console.error('[POST /api/app/:hash/data] runTriggeredJobs error:', err);
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/app/:hash/data] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/actions/fetch-url
appRouter.post('/:hash/actions/fetch-url', chatLimiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const { url, outputKey, dataPath } = req.body as { url: unknown; outputKey: unknown; dataPath?: unknown };

    if (!url || typeof url !== 'string' || url.length > 2048 || !url.startsWith('https://')) {
      return res.status(400).json({ error: 'url must be an HTTPS URL (max 2048 chars)' });
    }
    if (!outputKey || typeof outputKey !== 'string' || !KEY_REGEX.test(outputKey)) {
      return res.status(400).json({ error: 'outputKey must be alphanumeric/underscore, max 100 chars' });
    }
    if (dataPath !== undefined && (typeof dataPath !== 'string' || dataPath === '' || dataPath.length > 500)) {
      return res.status(400).json({ error: 'dataPath must be a non-empty string if provided (max 500 chars)' });
    }

    let result: { body: string };
    try {
      result = await fetchSafe(url);
    } catch (err) {
      console.warn('[POST /api/app/:hash/actions/fetch-url] fetchSafe error:', (err as Error).message);
      return res.status(502).json({ error: 'Failed to fetch URL' });
    }

    const value = extractDataPath(result.body, typeof dataPath === 'string' ? dataPath : undefined);

    if (typeof dataPath === 'string' && value === undefined) {
      return res.status(400).json({ error: `dataPath "${dataPath}" not found in response` });
    }

    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > VALUE_MAX_BYTES) {
      return res.status(413).json({ error: 'fetched value too large' });
    }

    await db.insert(appData).values({
      appId: row.id,
      key: outputKey,
      value,
    } satisfies AppDataInsert);

    // Store fetch timestamp (consistent with cron fetch_url behavior)
    const updatedAtKey = `${outputKey.slice(0, 89)}_updated_at`;
    if (KEY_REGEX.test(updatedAtKey)) {
      await db.insert(appData).values({
        appId: row.id,
        key: updatedAtKey,
        value: new Date().toISOString(),
      } satisfies AppDataInsert);
    }

    return res.json({ ok: true, value });
  } catch (error) {
    console.error('[POST /api/app/:hash/actions/fetch-url] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/chat
appRouter.post('/:hash/chat', chatLimiter, requireAuthIfProtected, async (req, res) => {
  try {
    const row = (req as AuthenticatedRequest).app_row!;
    const { message } = req.body as { message: string };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    // Load recent chat history for this app (most recent 20, in chronological order).
    // Filter by both appId AND sessionId to match the stored convention ('app-<hash>')
    // and prevent orphaned rows with a different sessionId from polluting the context.
    const history = await db
      .select()
      .from(chatHistory)
      .where(and(eq(chatHistory.appId, row.id), eq(chatHistory.sessionId, `app-${row.hash}`)))
      .orderBy(desc(chatHistory.createdAt))
      .limit(CHAT_HISTORY_LIMIT);

    // Reverse to chronological order
    const recentHistory = [...history].reverse();

    const previousMessages = recentHistory.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

    // Build app context for the AI (config + latest data + notes memory + table schemas + row counts)
    const latestData = await getLatestAppData(row.id);
    const appTables = await db.select({
      id: userTables.id,
      name: userTables.name,
      columns: userTables.columns,
    }).from(userTables).where(eq(userTables.appId, row.id));

    // Fetch row counts per table so AI knows which tables have data
    let tablesWithCounts: Array<{ id: number; name: string; columns: unknown; rowCount: number }> | undefined;
    if (appTables.length > 0) {
      const rowCounts = await db
        .select({ tableId: userRows.tableId, count: sql<number>`count(*)` })
        .from(userRows)
        .where(sql`${userRows.tableId} IN (${sql.join(appTables.map(t => sql`${t.id}`), sql`, `)})`)
        .groupBy(userRows.tableId);
      const countMap = new Map(rowCounts.map(r => [r.tableId, r.count]));
      tablesWithCounts = appTables.map(t => ({
        ...t,
        rowCount: countMap.get(t.id) ?? 0,
      }));
    }

    const appContext = {
      config: row.config,
      data: latestData.map((r) => ({ key: r.key, value: r.value })),
      notes: row.notes ?? undefined,
      tables: tablesWithCounts,
    };

    const messages = [...previousMessages, { role: 'user' as const, content: message }];
    const claudeResponse = await chatWithAI(messages, 'chat', appContext);

    // Persist user message only after a successful AI response so a failed AI call does
    // not leave an orphaned user turn with no corresponding assistant reply in history.
    await db.insert(chatHistory).values({
      appId: row.id,
      sessionId: `app-${row.hash}`,
      role: 'user',
      content: message,
      phase: 'chat',
    } satisfies ChatHistoryInsert);

    // Persist assistant response
    await db.insert(chatHistory).values({
      appId: row.id,
      sessionId: `app-${row.hash}`,
      role: 'assistant',
      content: claudeResponse.message,
      phase: 'chat',
    } satisfies ChatHistoryInsert);

    // If the AI returned an updated UI layout or pages, validate and persist.
    // uiUpdate and pagesUpdate are mutually exclusive: if both are present, uiUpdate takes priority.
    let validUiItems: ReturnType<typeof validateUiComponents> | undefined;
    let validPages: ReturnType<typeof validatePages> | undefined;
    let revertedToSinglePage = false;
    if (claudeResponse.uiUpdate && Array.isArray(claudeResponse.uiUpdate)) {
      validUiItems = validateUiComponents(claudeResponse.uiUpdate);
      if (validUiItems.length > 0) {
        const updatedConfig = { ...(row.config as Record<string, unknown> ?? {}), uiComponents: validUiItems };
        await db.update(apps).set({ config: updatedConfig }).where(eq(apps.id, row.id));
      } else {
        console.warn(`[POST /api/app/:hash/chat] uiUpdate had no valid components for app ${row.id}`);
      }
    } else if (claudeResponse.pagesUpdate && Array.isArray(claudeResponse.pagesUpdate)) {
      // pagesUpdate replaces the entire config.pages array.
      // Empty array means "revert to single-page mode" (remove pages from config).
      if (claudeResponse.pagesUpdate.length === 0) {
        const { pages: _removed, ...configWithoutPages } = (row.config as Record<string, unknown> ?? {});
        await db.update(apps).set({ config: configWithoutPages }).where(eq(apps.id, row.id));
        revertedToSinglePage = true;
      } else {
        validPages = validatePages(claudeResponse.pagesUpdate);
        if (validPages.length > 0) {
          const updatedConfig = { ...(row.config as Record<string, unknown> ?? {}), pages: validPages };
          await db.update(apps).set({ config: updatedConfig }).where(eq(apps.id, row.id));
        } else {
          console.warn(`[POST /api/app/:hash/chat] pagesUpdate had no valid pages for app ${row.id}`);
        }
      }
    }

    // Save memory update if the AI provided one
    if (claudeResponse.memoryUpdate !== undefined) {
      await db.update(apps)
        .set({ notes: claudeResponse.memoryUpdate })
        .where(eq(apps.id, row.id));
    }

    return res.json({
      mood: claudeResponse.mood,
      message: claudeResponse.message,
      // Only include uiUpdate when at least one component passed validation so the client
      // does not call fetchApp() when the AI's proposed update was entirely rejected.
      uiUpdate: validUiItems && validUiItems.length > 0 ? validUiItems : undefined,
      // Include pagesUpdate when at least one page passed validation, or as empty array
      // when reverting to single-page mode so the client triggers a refresh.
      pagesUpdate: revertedToSinglePage ? [] : (validPages && validPages.length > 0 ? validPages : undefined),
    });
  } catch (error) {
    console.error('[POST /api/app/:hash/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
