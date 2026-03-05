import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appMembers } from '../db/schema.js';

export type AppRow = typeof apps.$inferSelect;
export type UserRole = 'owner' | 'editor' | 'viewer' | 'anonymous';

export interface AuthenticatedRequest extends Request {
  app_row?: AppRow;
  userId?: string;
  userRole?: UserRole;
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

/**
 * Extract userId from global JWT (Authorization: Bearer <token>).
 * Returns undefined if no valid token is present.
 */
function extractUserIdFromJwt(req: Request): string | undefined {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (payload.userId && typeof payload.userId === 'string') {
      return payload.userId;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Middleware: resolve the user's role for the given app.
 *
 * Extracts userId from global JWT, finds app by hash, looks up role
 * in app_members. Attaches app_row, userId, userRole to request.
 *
 * Backward compatibility: if app has no app_members rows at all,
 * falls back to checking apps.userId for owner detection.
 *
 * For password-protected apps: anonymous users get 401.
 * For unprotected apps: anonymous users get 'anonymous' role (read-only).
 */
export async function resolveUserAndRole(
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

    const authReq = req as AuthenticatedRequest;
    authReq.app_row = row;

    const userId = extractUserIdFromJwt(req);
    authReq.userId = userId;

    if (userId) {
      // Look up role in app_members
      const [member] = await db
        .select()
        .from(appMembers)
        .where(and(eq(appMembers.appId, row.id), eq(appMembers.userId, userId)));

      if (member) {
        authReq.userRole = member.role as UserRole;
        next();
        return;
      }

      // No member row found — check backward compatibility:
      // If app has NO app_members rows at all, use apps.userId for owner detection
      const [anyMember] = await db
        .select({ id: appMembers.id })
        .from(appMembers)
        .where(eq(appMembers.appId, row.id))
        .limit(1);

      if (!anyMember && row.userId === userId) {
        // Legacy app without members table — creator is owner
        authReq.userRole = 'owner';
        next();
        return;
      }
    }

    // No role found — user is anonymous
    if (row.passwordHash) {
      // Password-protected app: anonymous users must authenticate
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Unprotected app: anonymous access allowed (read-only enforced by requireRole)
    authReq.userRole = 'anonymous';
    next();
  } catch (error) {
    console.error('[resolveUserAndRole] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware factory: require that the user has one of the specified roles.
 * Must be used after resolveUserAndRole.
 * Returns 403 if role is insufficient.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const userRole = authReq.userRole;

    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
