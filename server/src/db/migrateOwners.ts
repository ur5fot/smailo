import { db } from './index.js';
import { apps, appMembers } from './schema.js';
import { isNotNull, eq, sql } from 'drizzle-orm';

/**
 * Ensure every app with a userId has an owner record in app_members.
 * Idempotent: uses INSERT OR IGNORE to skip duplicates.
 * Skips legacy apps without userId.
 */
export function migrateOwnerRecords(): number {
  // Find all apps with userId that don't have an owner in app_members
  const appsWithoutOwner = db
    .select({ id: apps.id, userId: apps.userId })
    .from(apps)
    .where(isNotNull(apps.userId))
    .all()
    .filter((app) => {
      const [existing] = db
        .select({ id: appMembers.id })
        .from(appMembers)
        .where(
          sql`${appMembers.appId} = ${app.id} AND ${appMembers.role} = 'owner'`
        )
        .all();
      return !existing;
    });

  if (appsWithoutOwner.length === 0) return 0;

  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const app of appsWithoutOwner) {
      // INSERT OR IGNORE handles the unique(appId, userId) constraint
      tx.run(
        sql`INSERT OR IGNORE INTO app_members (app_id, user_id, role, joined_at)
            VALUES (${app.id}, ${app.userId}, 'owner', ${now})`
      );
    }
  });

  return appsWithoutOwner.length;
}
