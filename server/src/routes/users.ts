import { Router } from 'express';
import { randomBytes } from 'crypto';
import rateLimit from 'express-rate-limit';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, apps } from '../db/schema.js';

export const usersRouter = Router();

const usersLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
usersRouter.use(usersLimiter);

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateUserId(length = 10): string {
  const threshold = 248; // 62 * 4 — largest multiple of ALPHABET.length fitting in a byte
  let result = '';
  while (result.length < length) {
    const bytes = randomBytes(length - result.length + 16);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      if (bytes[i] < threshold) {
        result += ALPHABET[bytes[i] % ALPHABET.length];
      }
      // bytes >= 248 are discarded (rejection sampling)
    }
  }
  return result;
}

// POST /api/users — create a new anonymous user
usersRouter.post('/', async (req, res) => {
  try {
    let userId = generateUserId();
    // Retry on collision (extremely unlikely but safe)
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await db.select().from(users).where(eq(users.userId, userId));
      if (existing.length === 0) break;
      if (attempt === 2) throw new Error('Failed to generate unique userId after retries');
      userId = generateUserId();
    }

    await db.insert(users).values({ userId });
    res.json({ userId });
  } catch (err) {
    console.error('[users] POST /api/users error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/users/:userId — get user info
usersRouter.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^[A-Za-z0-9]{1,50}$/.test(userId)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const [row] = await db.select().from(users).where(eq(users.userId, userId));
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ userId: row.userId, createdAt: row.createdAt });
  } catch (err) {
    console.error('[users] GET /api/users/:userId error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// GET /api/users/:userId/apps — list user's apps
usersRouter.get('/:userId/apps', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!/^[A-Za-z0-9]{1,50}$/.test(userId)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const [user] = await db.select().from(users).where(eq(users.userId, userId));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userApps = await db
      .select({
        hash: apps.hash,
        appName: apps.appName,
        description: apps.description,
        createdAt: apps.createdAt,
        lastVisit: apps.lastVisit,
      })
      .from(apps)
      .where(eq(apps.userId, userId))
      .orderBy(desc(apps.createdAt));

    res.json(userApps);
  } catch (err) {
    console.error('[users] GET /api/users/:userId/apps error:', err);
    res.status(500).json({ error: 'Failed to get user apps' });
  }
});
