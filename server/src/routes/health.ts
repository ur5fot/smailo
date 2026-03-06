import { Router } from 'express';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  try {
    db.get(sql`SELECT 1`);
    res.json({ ok: true, uptime: process.uptime() });
  } catch {
    res.status(503).json({ ok: false, error: 'db' });
  }
});
