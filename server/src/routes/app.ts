import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appData, chatHistory } from '../db/schema.js';
import { chatWithAI } from '../services/aiService.js';

export const appRouter = Router();

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

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return secret;
}

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
    const payload = jwt.verify(token, getJwtSecret()) as { hash: string };
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
    // bcrypt silently truncates at 72 bytes; reject longer inputs to prevent DoS via slow hashing
    if (password.length > 72) {
      return res.status(400).json({ error: 'password must be at most 72 characters' });
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
    // Clear the creation token after successful use (one-time only)
    await db.update(apps)
      .set({ passwordHash: hashed, creationToken: null } as any)
      .where(eq(apps.hash, hash));

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
    if (password.length > 72) {
      return res.status(400).json({ error: 'password must be at most 72 characters' });
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

    const token = jwt.sign({ hash }, getJwtSecret(), { expiresIn: '7d' });
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

// POST /api/app/:hash/data
const KEY_REGEX = /^[a-zA-Z0-9_]{1,100}$/;
const VALUE_MAX_BYTES = 10_000;

appRouter.post('/:hash/data', chatLimiter, requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;
    const { key, value } = req.body as { key: unknown; value: unknown };

    if (!key || typeof key !== 'string' || !KEY_REGEX.test(key)) {
      return res.status(400).json({ error: 'key must be alphanumeric/underscore, max 100 chars' });
    }
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > VALUE_MAX_BYTES) {
      return res.status(413).json({ error: 'value too large' });
    }

    // Pass value directly — Drizzle's mode:'json' column handles serialization.
    // Do NOT pre-serialize: passing an already-stringified value causes double-encoding.
    await db.insert(appData).values({
      appId: row.id,
      key,
      value,
    } as any);

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

    // Load recent chat history for this app (most recent 20, in chronological order)
    const history = await db
      .select()
      .from(chatHistory)
      .where(eq(chatHistory.appId, row.id))
      .orderBy(desc(chatHistory.createdAt))
      .limit(20);

    // Reverse to chronological order
    const recentHistory = [...history].reverse();

    const previousMessages = recentHistory.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

    // Build app context for the AI (config + latest data)
    const latestData = await getLatestAppData(row.id);
    const appContext = {
      config: row.config,
      data: latestData.map((r) => ({ key: r.key, value: r.value })),
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
      const ALLOWED_COMPONENTS = ['Card', 'Chart', 'Timeline', 'Carousel', 'Knob', 'Tag', 'ProgressBar', 'Calendar', 'DataTable', 'Button', 'InputText', 'Form'];
      const UI_KEY_REGEX = /^[a-zA-Z0-9_]{1,100}$/;
      validUiItems = (claudeResponse.uiUpdate as any[])
        .filter((item: any) =>
          item &&
          typeof item.component === 'string' &&
          ALLOWED_COMPONENTS.includes(item.component) &&
          (item.props == null || (typeof item.props === 'object' && !Array.isArray(item.props))) &&
          // Button and InputText require action with a valid key — without it they silently vanish in the renderer
          ((['Button', 'InputText'].includes(item.component))
            ? (typeof item.action?.key === 'string' && UI_KEY_REGEX.test(item.action.key))
            : (item.action == null || (typeof item.action?.key === 'string' && UI_KEY_REGEX.test(item.action.key)))) &&
          // Form requires outputKey and a non-empty fields array — without them it silently vanishes in the renderer
          // 'timestamp' is reserved: AppForm always injects it as the submission time; a field with that name would silently lose user input
          (item.component === 'Form'
            ? (typeof item.outputKey === 'string' && UI_KEY_REGEX.test(item.outputKey) &&
               Array.isArray(item.fields) && item.fields.length > 0 &&
               item.fields.every((f: any) => typeof f?.name === 'string' && UI_KEY_REGEX.test(f.name) && f.name !== 'timestamp'))
            : (item.outputKey == null || (typeof item.outputKey === 'string' && UI_KEY_REGEX.test(item.outputKey))) &&
              (!Array.isArray(item.fields) || item.fields.every((f: any) => typeof f?.name === 'string' && UI_KEY_REGEX.test(f.name) && f.name !== 'timestamp')))
        )
        .slice(0, 20);
      if (validUiItems.length > 0) {
        const updatedConfig = { ...(row.config as Record<string, unknown> ?? {}), uiComponents: validUiItems };
        await db.update(apps).set({ config: updatedConfig } as any).where(eq(apps.id, row.id));
      } else {
        console.warn(`[POST /api/app/:hash/chat] uiUpdate had no valid components for app ${row.id}`);
      }
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
