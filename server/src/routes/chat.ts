import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, createHash } from 'crypto';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, chatHistory } from '../db/schema.js';
import { chatWithAI, validateUiComponents } from '../services/aiService.js';
import { cronManager } from '../services/cronManager.js';

export const chatRouter = Router();

/**
 * Strip sensitive cron job data (action configs like fetch_url targets) before sending
 * appConfig to the browser. At 'created' phase cronJobs are fully removed (not needed
 * client-side after the app hash is returned). At 'confirm' phase, job display fields
 * (name, schedule, action, humanReadable) are kept for the plan preview card, but the
 * 'config' sub-object containing URLs and keys is stripped.
 */
function sanitizeAppConfigForClient(appConfig: any, phase: string): any {
  if (phase === 'created') {
    const { cronJobs: _cj, ...rest } = appConfig;
    return rest;
  }
  // confirm phase: keep job metadata for plan card display, strip sensitive config
  const { cronJobs, ...rest } = appConfig;
  return {
    ...rest,
    ...(Array.isArray(cronJobs)
      ? {
          cronJobs: cronJobs.map(({ config: _c, ...jobRest }: any) => jobRest),
        }
      : {}),
  };
}

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

    const { sessionId, message, userId } = req.body as {
      sessionId: string;
      message: string;
      userId?: string;
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
    if (userId !== undefined) {
      if (typeof userId !== 'string' || !/^[A-Za-z0-9]{1,50}$/.test(userId)) {
        return res.status(400).json({ error: 'Invalid userId format' });
      }
    }

    // Load previous messages for this session (most recent 20, then reverse for chronological order).
    // Filter appId IS NULL to isolate home-chat rows and prevent session ID collisions with
    // in-app chat sessions (which use deterministic IDs like 'app-<hash>').
    const history = (
      await db
        .select()
        .from(chatHistory)
        .where(and(eq(chatHistory.sessionId, sessionId), isNull(chatHistory.appId)))
        .orderBy(desc(chatHistory.createdAt))
        .limit(20)
    ).reverse();

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

      // Strip cronJobs from the stored config so fetch_url targets and automation
      // configs are never written to apps.config (they live in the cronJobs table).
      const { cronJobs: _cj, ...appConfigToStore } = claudeResponse.appConfig as any;

      // Validate uiComponents against the allowed component whitelist.
      if (Array.isArray(appConfigToStore.uiComponents)) {
        appConfigToStore.uiComponents = validateUiComponents(appConfigToStore.uiComponents);
      } else {
        // Non-array value (null, string, object) — reset to empty so no untrusted data reaches the client.
        appConfigToStore.uiComponents = [];
      }

      const [inserted] = await db
        .insert(apps)
        .values({
          hash,
          userId: userId ?? null,
          appName: appName.trim().slice(0, 200),
          description: typeof claudeResponse.appConfig.description === 'string'
            ? claudeResponse.appConfig.description.slice(0, 500)
            : '',
          config: appConfigToStore,
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

    // If Claude skipped confirm and jumped to created (blocked server-side),
    // downgrade the phase to confirm so the client doesn't show a broken "created" state.
    // Compute this BEFORE persisting so the DB row also reflects the corrected phase —
    // otherwise the next request would read phase='created' and switch to the in-app AI prompt.
    let responsePhase = claudeResponse.phase;
    if (claudeResponse.phase === 'created' && !appHashResult) {
      responsePhase = 'confirm';
    }

    // Persist assistant response with the corrected phase
    await db.insert(chatHistory).values({
      sessionId,
      role: 'assistant',
      content: claudeResponse.message,
      phase: responsePhase,
    } as any);

    return res.json({
      mood: claudeResponse.mood,
      message: claudeResponse.message,
      phase: responsePhase,
      appConfig:
        (responsePhase === 'confirm' || responsePhase === 'created') && claudeResponse.appConfig
          ? sanitizeAppConfigForClient(claudeResponse.appConfig, responsePhase)
          : undefined,
      appHash: appHashResult,
      creationToken: creationTokenResult,
    });
  } catch (error) {
    console.error('[/api/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
