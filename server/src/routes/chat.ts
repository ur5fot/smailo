import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, createHash } from 'crypto';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, chatHistory, users } from '../db/schema.js';
import { chatWithAI, validateUiComponents, type CronJobConfig } from '../services/aiService.js';
import { cronManager } from '../services/cronManager.js';

type AppsInsert = typeof apps.$inferInsert;
type ChatHistoryInsert = typeof chatHistory.$inferInsert;

export const chatRouter = Router();

const CHAT_HISTORY_LIMIT = 20;

/**
 * Validate action-specific config for a cron job.
 * Returns true if the config has the required fields for the given action type.
 */
function isValidCronJobConfig(action: string, config: unknown): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const c = config as Record<string, unknown>;

  switch (action) {
    case 'fetch_url':
      return typeof c.url === 'string' && c.url.startsWith('https://') &&
        typeof c.outputKey === 'string' && c.outputKey.length > 0;
    case 'send_reminder':
      return typeof c.text === 'string';
    case 'aggregate_data':
      return typeof c.dataKey === 'string' && typeof c.operation === 'string' &&
        typeof c.outputKey === 'string' && c.outputKey.length > 0;
    case 'compute':
      return typeof c.operation === 'string' &&
        typeof c.outputKey === 'string' && c.outputKey.length > 0 &&
        Array.isArray(c.inputKeys) && c.inputKeys.length >= 1;
    case 'log_entry':
      return true; // log_entry has no required config fields
    default:
      return false;
  }
}

/**
 * Strip sensitive cron job data (action configs like fetch_url targets) before sending
 * appConfig to the browser. At 'created' phase cronJobs are fully removed (not needed
 * client-side after the app hash is returned). At 'confirm' phase, job display fields
 * (name, schedule, action, humanReadable) are kept for the plan preview card, but the
 * 'config' sub-object containing URLs and keys is stripped.
 */
function sanitizeAppConfigForClient(appConfig: Record<string, unknown>, phase: string): Record<string, unknown> {
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
          cronJobs: cronJobs.map(({ config: _c, ...jobRest }: Record<string, unknown>) => jobRest),
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
      // Prevent cross-user session injection: the home-chat sessionId is always derived
      // from userId on the client, so any mismatch is either a bug or an attack.
      if (sessionId !== `home-${userId}`) {
        return res.status(400).json({ error: 'sessionId does not match userId' });
      }
      const [userRow] = await db.select({ userId: users.userId }).from(users).where(eq(users.userId, userId));
      if (!userRow) {
        return res.status(400).json({ error: 'User not found' });
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
        .limit(CHAT_HISTORY_LIMIT)
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
    // After app creation, restart brainstorm for the next app — the home chat always uses
    // the brainstorm prompt and must never switch to the in-app chat prompt (no appContext here).
    // Cast to string to work around TypeScript control-flow narrowing collapsing the union type.
    if ((currentPhase as string) === 'created' || (currentPhase as string) === 'chat') {
      currentPhase = 'brainstorm';
    }

    // Build messages array for AI (do NOT persist user message yet — persist only after successful AI call
    // so retries don't produce duplicate user turns in the conversation history)
    const messages = [...previousMessages, { role: 'user' as const, content: message }];

    // Call AI
    const claudeResponse = await chatWithAI(messages, currentPhase);

    let appHashResult: string | undefined;
    let creationTokenResult: string | undefined;
    let validJobs: CronJobConfig[] = [];
    let insertedAppId: number | undefined;

    // Pre-compute app creation data outside the transaction (no DB side effects)
    let appCreationData: {
      hash: string;
      creationToken: string;
      creationTokenHash: string;
      appConfigToStore: Record<string, unknown>;
      appName: string;
    } | undefined;

    if (claudeResponse.phase === 'created' && claudeResponse.appConfig && (currentPhase as string) === 'confirm') {
      const appName = claudeResponse.appConfig.appName;
      if (!appName || typeof appName !== 'string' || appName.trim().length === 0) {
        console.error('[/api/chat] AI returned created phase with missing appName');
        return res.status(500).json({ error: 'Internal server error' });
      }

      const hash = randomBytes(32).toString('hex');
      const creationToken = randomBytes(24).toString('hex');
      const creationTokenHash = createHash('sha256').update(creationToken).digest('hex');

      const { cronJobs: _cj, ...appConfigToStore } = claudeResponse.appConfig as Record<string, unknown>;
      if (Array.isArray(appConfigToStore.uiComponents)) {
        appConfigToStore.uiComponents = validateUiComponents(appConfigToStore.uiComponents);
      } else {
        appConfigToStore.uiComponents = [];
      }

      validJobs = Array.isArray(claudeResponse.appConfig.cronJobs)
        ? (claudeResponse.appConfig.cronJobs.filter(
            (j: Record<string, unknown>) =>
              j &&
              typeof j.name === 'string' &&
              typeof j.schedule === 'string' &&
              typeof j.action === 'string' &&
              isValidCronJobConfig(j.action as string, j.config)
          ) as unknown as CronJobConfig[])
        : [];

      appCreationData = { hash, creationToken, creationTokenHash, appConfigToStore, appName: appName.trim() };
      appHashResult = hash;
      creationTokenResult = creationToken;
    }

    // If Claude skipped confirm and jumped to created (blocked server-side),
    // downgrade the phase to confirm so the client doesn't show a broken "created" state.
    // Compute this BEFORE persisting so the DB row also reflects the corrected phase —
    // otherwise the next request would read phase='created' and switch to the in-app AI prompt.
    const responsePhase = claudeResponse.phase === 'created' && !appHashResult
      ? 'confirm'
      : claudeResponse.phase;

    // Wrap all DB writes in a transaction so a crash between user-message and
    // assistant-message inserts cannot leave orphaned rows that corrupt conversation state.
    db.transaction((tx) => {
      // Persist user message only after a successful AI response
      tx.insert(chatHistory).values({
        sessionId,
        role: 'user',
        content: message,
        phase: currentPhase,
      } satisfies ChatHistoryInsert).run();

      if (appCreationData) {
        const { hash, creationTokenHash, appConfigToStore, appName } = appCreationData;
        const inserted = tx
          .insert(apps)
          .values({
            hash,
            userId: userId ?? null,
            appName: appName.slice(0, 200),
            description: typeof claudeResponse.appConfig!.description === 'string'
              ? claudeResponse.appConfig!.description.slice(0, 500)
              : '',
            config: appConfigToStore,
            creationToken: creationTokenHash,
          } satisfies AppsInsert)
          .returning({ id: apps.id })
          .get();
        if (inserted) insertedAppId = inserted.id;
      }

      tx.insert(chatHistory).values({
        sessionId,
        role: 'assistant',
        content: claudeResponse.message,
        phase: responsePhase,
      } satisfies ChatHistoryInsert).run();
    });

    // Schedule cron jobs after the transaction commits — if this fails the app exists
    // but has no automation; the user can recreate via chat.
    if (insertedAppId !== undefined && validJobs.length > 0) {
      await cronManager.addJobs(insertedAppId, validJobs);
    }

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

chatRouter.get('/', limiter, async (req, res) => {
  const { sessionId, userId } = req.query as { sessionId?: string; userId?: string };
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (sessionId.length > 128) {
    return res.status(400).json({ error: 'sessionId too long' });
  }
  // Require userId and validate it matches the sessionId to prevent unauthorized history reads.
  // Home-chat sessions always use the pattern 'home-<userId>'.
  if (!userId || typeof userId !== 'string' || !/^[A-Za-z0-9]{1,50}$/.test(userId)) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (sessionId !== `home-${userId}`) {
    return res.status(403).json({ error: 'sessionId does not match userId' });
  }
  try {
    const rows = (
      await db
        .select()
        .from(chatHistory)
        .where(and(eq(chatHistory.sessionId, sessionId), isNull(chatHistory.appId)))
        .orderBy(desc(chatHistory.createdAt))
        .limit(CHAT_HISTORY_LIMIT)
    ).reverse();
    return res.json({
      history: rows.map((r) => ({ role: r.role, content: r.content, phase: r.phase })),
    });
  } catch (error) {
    console.error('[GET /api/chat] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
