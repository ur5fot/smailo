import { desc, sql } from 'drizzle-orm';
import { db } from './index.js';
import { appData } from './schema.js';

/** Return only the most-recent row per key for a given app. */
export async function getLatestAppData(appId: number) {
  const rows = await db
    .select()
    .from(appData)
    .where(
      sql`${appData.appId} = ${appId} AND ${appData.id} IN (
        SELECT MAX(id) FROM app_data WHERE app_id = ${appId} GROUP BY key
      )`
    )
    .orderBy(desc(appData.createdAt));
  return rows;
}
