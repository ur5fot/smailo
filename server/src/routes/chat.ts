import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, chatHistory } from '../db/schema.js';
import { chatWithClaude } from '../services/claude.js';
import { cronManager } from '../services/cronManager.js';

export const chatRouter = Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

chatRouter.post('/', limiter, async (req, res) => {
  try {
    const { sessionId, message, appHash } = req.body as {
      sessionId: string;
      message: string;
      appHash?: string;
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Load previous messages for this session
    const history = await db
      .select()
      .from(chatHistory)
      .where(eq(chatHistory.sessionId, sessionId));

    const previousMessages = history.map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

    // Determine current phase from latest assistant message
    let currentPhase: 'brainstorm' | 'confirm' | 'created' | 'chat' = 'brainstorm';
    const lastAssistant = [...history].reverse().find((r) => r.role === 'assistant');
    if (lastAssistant?.phase) {
      currentPhase = lastAssistant.phase as typeof currentPhase;
    }

    // Persist incoming user message
    await db.insert(chatHistory).values({
      sessionId,
      role: 'user',
      content: message,
      phase: currentPhase,
    } as any);

    // Build messages array for Claude
    const messages = [...previousMessages, { role: 'user' as const, content: message }];

    // Call Claude
    const claudeResponse = await chatWithClaude(messages, currentPhase);

    let appHashResult: string | undefined;

    // If Claude says the app is created, persist the app and schedule cron jobs
    if (claudeResponse.phase === 'created' && claudeResponse.appConfig) {
      const hash = randomBytes(32).toString('hex');
      appHashResult = hash;

      const [inserted] = await db
        .insert(apps)
        .values({
          hash,
          appName: claudeResponse.appConfig.appName,
          description: claudeResponse.appConfig.description,
          config: claudeResponse.appConfig as any,
        } as any)
        .returning({ id: apps.id });

      if (inserted && claudeResponse.appConfig.cronJobs?.length > 0) {
        await cronManager.addJobs(inserted.id, claudeResponse.appConfig.cronJobs);
      }
    }

    // Persist assistant response
    await db.insert(chatHistory).values({
      sessionId,
      role: 'assistant',
      content: claudeResponse.message,
      phase: claudeResponse.phase,
    } as any);

    return res.json({
      mood: claudeResponse.mood,
      message: claudeResponse.message,
      phase: claudeResponse.phase,
      appHash: appHashResult,
    });
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
