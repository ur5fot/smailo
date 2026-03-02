import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps } from '../db/schema.js';

export type AppRow = typeof apps.$inferSelect;

export interface AuthenticatedRequest extends Request {
  app_row?: AppRow;
}

export const JWT_SECRET: string = (() => {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error('JWT_SECRET env var is not set');
  return v;
})();

/** Middleware: verify JWT if the app has a password; check X-User-Id ownership for unprotected apps on POST. */
export async function requireAuthIfProtected(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const hash = req.params['hash'] as string;

    const [row] = await db.select().from(apps).where(eq(apps.hash, hash));
    if (!row) {
      res.status(404).json({ error: 'App not found' });
      return;
    }

    (req as AuthenticatedRequest).app_row = row;

    if (!row.passwordHash) {
      // For write operations on unprotected apps, verify userId ownership
      // so that only the app creator can modify data. Read ops remain open.
      if (['POST', 'PUT', 'DELETE'].includes(req.method) && row.userId) {
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
      const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      if (payload.hash !== hash) {
        res.status(401).json({ error: 'Invalid token for this app' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('[requireAuthIfProtected] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
