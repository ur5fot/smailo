import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, createHash } from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, chatHistory } from '../db/schema.js';
import { chatWithAI } from '../services/aiService.js';
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
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be JSON' });
    }

    const { sessionId, message } = req.body as {
      sessionId: string;
      message: string;
    };

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (sessionId.length > 128) {
      return res.status(400).json({ error: 'sessionId too long' });
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    // Load previous messages for this session (most recent 40, then reverse for chronological order)
    const history = (
      await db
        .select()
        .from(chatHistory)
        .where(eq(chatHistory.sessionId, sessionId))
        .orderBy(desc(chatHistory.createdAt))
        .limit(40)
    ).reverse();

    const previousMessages = history.slice(-20).map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

    // Determine current phase from latest assistant message
    let currentPhase: 'brainstorm' | 'confirm' | 'created' | 'chat' = 'brainstorm';
    const lastAssistant = [...history].reverse().find((r) => r.role === 'assistant');
    if (lastAssistant?.phase) {
      currentPhase = lastAssistant.phase as typeof currentPhase;
    }
    // Once the app has been created, further messages are plain chat — never re-create
    if ((currentPhase as string) === 'created') {
      currentPhase = 'chat';
    }

    // Build messages array for AI (do NOT persist user message yet — persist only after successful AI call
    // so retries don't produce duplicate user turns in the conversation history)
    const messages = [...previousMessages, { role: 'user' as const, content: message }];

    // Call AI
    const claudeResponse = await chatWithAI(messages, currentPhase);

    // Persist user message only after a successful AI response
    await db.insert(chatHistory).values({
      sessionId,
      role: 'user',
      content: message,
      phase: currentPhase,
    } as any);

    let appHashResult: string | undefined;
    let creationTokenResult: string | undefined;

    // If Claude says the app is created, persist the app and schedule cron jobs.
    // Enforce server-side that creation can only follow confirmation — the AI cannot
    // skip the confirm phase by returning phase='created' from brainstorm.
    if (claudeResponse.phase === 'created' && claudeResponse.appConfig && (currentPhase as string) === 'confirm') {
      const appName = claudeResponse.appConfig.appName;
      if (!appName || typeof appName !== 'string' || appName.trim().length === 0) {
        console.error('[/api/chat] AI returned created phase with missing appName');
        return res.status(500).json({ error: 'Internal server error' });
      }

      const hash = randomBytes(32).toString('hex');
      appHashResult = hash;
      // Generate a one-time creation token so the client can call set-password without
      // an unauthenticated race window. Store only the hash; return the plain token once.
      const creationToken = randomBytes(24).toString('hex');
      creationTokenResult = creationToken;
      const creationTokenHash = createHash('sha256').update(creationToken).digest('hex');

      const [inserted] = await db
        .insert(apps)
        .values({
          hash,
          appName: appName.trim().slice(0, 200),
          description: typeof claudeResponse.appConfig.description === 'string'
            ? claudeResponse.appConfig.description.slice(0, 500)
            : '',
          config: claudeResponse.appConfig as any,
          creationToken: creationTokenHash,
        } as any)
        .returning({ id: apps.id });

      const validJobs = Array.isArray(claudeResponse.appConfig.cronJobs)
        ? claudeResponse.appConfig.cronJobs.filter(
            (j) =>
              j &&
              typeof j.name === 'string' &&
              typeof j.schedule === 'string' &&
              typeof j.action === 'string'
          )
        : [];
      if (inserted && validJobs.length > 0) {
        await cronManager.addJobs(inserted.id, validJobs);
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
      creationToken: creationTokenResult,
    });
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
