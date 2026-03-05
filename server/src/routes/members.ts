import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { apps, appMembers, appInvites } from '../db/schema.js';
import { resolveUserAndRole, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';

export const membersRouter = Router({ mergeParams: true });

const membersLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/app/:hash/members/invite — create invite (owner only)
membersRouter.post(
  '/invite',
  membersLimiter,
  resolveUserAndRole,
  requireRole('owner'),
  async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const appRow = authReq.app_row!;

      const { role } = req.body;
      if (!role || !['editor', 'viewer'].includes(role)) {
        res.status(400).json({ error: 'Role must be "editor" or "viewer"' });
        return;
      }

      const token = randomBytes(16).toString('hex'); // 32-char hex
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

      await db.insert(appInvites).values({
        appId: appRow.id,
        role,
        token,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      res.json({
        token,
        inviteUrl: `/invite/${appRow.hash}/${token}`,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      console.error('[members/invite] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/app/:hash/members/invite/:token/accept — accept invite
membersRouter.post(
  '/invite/:token/accept',
  membersLimiter,
  async (req, res) => {
    try {
      const hash = req.params['hash'] as string;
      const token = req.params['token'] as string;

      // Extract userId from global JWT — must be authenticated
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Use resolveUserAndRole-style JWT extraction
      const jwt = await import('jsonwebtoken');
      const { JWT_SECRET } = await import('../middleware/auth.js');
      let userId: string;
      try {
        const payload = jwt.default.verify(authHeader.slice(7), JWT_SECRET) as { userId?: string };
        if (!payload.userId || typeof payload.userId !== 'string') {
          res.status(401).json({ error: 'Invalid token' });
          return;
        }
        userId = payload.userId;
      } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }

      // Find the invite
      const [invite] = await db
        .select()
        .from(appInvites)
        .where(eq(appInvites.token, token));

      if (!invite) {
        res.status(404).json({ error: 'Invite not found' });
        return;
      }

      // Verify the invite belongs to the correct app
      const [appRow] = await db.select().from(apps).where(eq(apps.hash, hash));
      if (!appRow || invite.appId !== appRow.id) {
        res.status(404).json({ error: 'Invite not found' });
        return;
      }

      // Check if invite is expired
      if (new Date(invite.expiresAt) < new Date()) {
        res.status(410).json({ error: 'Invite has expired' });
        return;
      }

      // Check if invite is already used (single-use)
      if (invite.acceptedByUserId) {
        res.status(410).json({ error: 'Invite has already been used' });
        return;
      }

      // Check if user is already a member
      const [existingMember] = await db
        .select()
        .from(appMembers)
        .where(and(eq(appMembers.appId, appRow.id), eq(appMembers.userId, userId)));

      if (existingMember) {
        res.json({ appHash: appRow.hash, role: existingMember.role, alreadyMember: true });
        return;
      }

      // Accept: mark invite as used and add member
      await db
        .update(appInvites)
        .set({ acceptedByUserId: userId })
        .where(eq(appInvites.id, invite.id));

      await db.insert(appMembers).values({
        appId: appRow.id,
        userId,
        role: invite.role,
        joinedAt: new Date().toISOString(),
      });

      res.json({ appHash: appRow.hash, role: invite.role });
    } catch (error) {
      console.error('[members/invite/accept] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
