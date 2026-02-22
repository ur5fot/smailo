import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, desc, sql, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appData, chatHistory } from '../db/schema.js';
import { chatWithAI, validateUiComponents } from '../services/aiService.js';
import { cronManager } from '../services/cronManager.js';

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

/** Return only the most-recent row per key for a given app. */
async function getLatestAppData(appId: number) {
  // Use a subquery to find the max id per key, then join back
  const rows = await db
    .select()
    .from(appData)
    .where(
      sql`${appData.appId} = ${appId} AND ${appData.id} IN (
        SELECT MAX(id) FROM app_data WHERE app_id = ${appId} GROUP BY key
      )`
    )
    .orderBy(desc(appData.createdAt));
  return rows;
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

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is not set');

// Middleware: verify JWT if the app has a password
async function requireAuthIfProtected(
  req: Request & { app_row?: typeof apps.$inferSelect },
  res: Response,
  next: () => void
) {
  const hash = req.params['hash'] as string;

  const [row] = await db.select().from(apps).where(eq(apps.hash, hash));
  if (!row) {
    res.status(404).json({ error: 'App not found' });
    return;
  }

  (req as any).app_row = row;

  if (!row.passwordHash) {
    // For write operations on unprotected apps, verify userId ownership
    // so that only the app creator can modify data. Read ops remain open.
    if (req.method === 'POST' && row.userId) {
      const headerUserId = req.headers['x-user-id'];
      if (headerUserId !== row.userId) {
        res.status(403).json({ error: 'Not the owner of this app' });
        return;
      }
    }
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { hash: string };
    if (payload.hash !== hash) {
      res.status(401).json({ error: 'Invalid token for this app' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// GET /api/app/:hash
appRouter.get('/:hash', requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;

    // Update lastVisit
    await db
      .update(apps)
      .set({ lastVisit: new Date().toISOString() } as any)
      .where(eq(apps.id, row.id));

    // Fetch latest appData (most recent entry per key, deduplicated)
    const data = await getLatestAppData(row.id);

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
      .set({ passwordHash: hashed, creationToken: null } as any)
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
appRouter.get('/:hash/data', requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;

    const data = await getLatestAppData(row.id);

    return res.json({ appData: data });
  } catch (error) {
    console.error('[GET /api/app/:hash/data] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/app/:hash/chat
appRouter.get('/:hash/chat', requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;
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

appRouter.post('/:hash/data', chatLimiter, requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;
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
        tx.insert(appData).values({ appId: row.id, key, value: updated } as any).run();
      });
      return res.json({ ok: true });
    }

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }

    let storedValue: unknown = value;

    if (mode === 'append') {
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

        tx.insert(appData).values({ appId: row.id, key, value: storedValue } as any).run();
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
      } as any);
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

// POST /api/app/:hash/chat
appRouter.post('/:hash/chat', chatLimiter, requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;
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

    // Build app context for the AI (config + latest data + notes memory)
    const latestData = await getLatestAppData(row.id);
    const appContext = {
      config: row.config,
      data: latestData.map((r) => ({ key: r.key, value: r.value })),
      notes: row.notes ?? undefined,
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
    } as any);

    // Persist assistant response
    await db.insert(chatHistory).values({
      appId: row.id,
      sessionId: `app-${row.hash}`,
      role: 'assistant',
      content: claudeResponse.message,
      phase: 'chat',
    } as any);

    // If the AI returned an updated UI layout, validate it before persisting.
    // Filter uiUpdate to only allowed components; save whatever passes the whitelist.
    // validItems is hoisted so the response can reuse it without re-filtering.
    let validUiItems: any[] | undefined;
    if (claudeResponse.uiUpdate && Array.isArray(claudeResponse.uiUpdate)) {
      validUiItems = validateUiComponents(claudeResponse.uiUpdate);
      if (validUiItems.length > 0) {
        const updatedConfig = { ...(row.config as Record<string, unknown> ?? {}), uiComponents: validUiItems };
        await db.update(apps).set({ config: updatedConfig } as any).where(eq(apps.id, row.id));
      } else {
        console.warn(`[POST /api/app/:hash/chat] uiUpdate had no valid components for app ${row.id}`);
      }
    }

    // Save memory update if the AI provided one
    if (claudeResponse.memoryUpdate !== undefined) {
      await db.update(apps)
        .set({ notes: claudeResponse.memoryUpdate } as any)
        .where(eq(apps.id, row.id));
    }

    return res.json({
      mood: claudeResponse.mood,
      message: claudeResponse.message,
      // Only include uiUpdate when at least one component passed validation so the client
      // does not call fetchApp() when the AI's proposed update was entirely rejected.
      uiUpdate: validUiItems && validUiItems.length > 0 ? validUiItems : undefined,
    });
  } catch (error) {
    console.error('[POST /api/app/:hash/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
