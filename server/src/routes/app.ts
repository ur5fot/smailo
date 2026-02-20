import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appData, chatHistory } from '../db/schema.js';
import { chatWithClaude } from '../services/aiService.js';

export const appRouter = Router();

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

    // Fetch latest appData (most recent entry per key)
    const data = await db
      .select()
      .from(appData)
      .where(eq(appData.appId, row.id))
      .orderBy(desc(appData.createdAt));

    // Return app config + appData
    return res.json({
      hash: row.hash,
      appName: row.appName,
      description: row.description,
      config: row.config,
      createdAt: row.createdAt,
      appData: data,
    });
  } catch (error) {
    console.error('[GET /api/app/:hash] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/verify
appRouter.post('/:hash/verify', async (req, res) => {
  try {
    const { hash } = req.params;
    const { password } = req.body as { password: string };

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'password is required' });
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

    const data = await db
      .select()
      .from(appData)
      .where(eq(appData.appId, row.id))
      .orderBy(desc(appData.createdAt));

    return res.json({ appData: data });
  } catch (error) {
    console.error('[GET /api/app/:hash/data] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/app/:hash/chat
appRouter.post('/:hash/chat', requireAuthIfProtected as any, async (req: any, res) => {
  try {
    const row: typeof apps.$inferSelect = req.app_row;
    const { message } = req.body as { message: string };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Load recent chat history for this app
    const history = await db
      .select()
      .from(chatHistory)
      .where(eq(chatHistory.appId, row.id))
      .orderBy(desc(chatHistory.createdAt));

    // Reverse to chronological order, take last 20 messages
    const recentHistory = history.reverse().slice(-20);

    const previousMessages = recentHistory.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

    // Persist user message
    await db.insert(chatHistory).values({
      appId: row.id,
      sessionId: `app-${row.hash}`,
      role: 'user',
      content: message,
      phase: 'chat',
    } as any);

    const messages = [...previousMessages, { role: 'user' as const, content: message }];
    const claudeResponse = await chatWithClaude(messages, 'chat');

    // Persist assistant response
    await db.insert(chatHistory).values({
      appId: row.id,
      sessionId: `app-${row.hash}`,
      role: 'assistant',
      content: claudeResponse.message,
      phase: 'chat',
    } as any);

    return res.json({
      mood: claudeResponse.mood,
      message: claudeResponse.message,
      uiUpdate: (claudeResponse as any).uiUpdate,
    });
  } catch (error) {
    console.error('[POST /api/app/:hash/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
