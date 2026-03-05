import { sqliteTable, text, integer, real, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const apps = sqliteTable('apps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  hash: text('hash').notNull().unique(),
  userId: text('user_id'),
  passwordHash: text('password_hash'),
  // SHA-256 hash of the one-time creation token returned at app creation time.
  // Required to call set-password; cleared after first use.
  creationToken: text('creation_token'),
  appName: text('app_name').notNull(),
  description: text('description'),
  config: text('config', { mode: 'json' }),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  lastVisit: text('last_visit'),
});

export const appMembers = sqliteTable('app_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),        // 'owner' | 'editor' | 'viewer'
  joinedAt: text('joined_at').notNull(),
}, (table) => ({
  uniqueMember: unique().on(table.appId, table.userId),
}));

export const cronJobs = sqliteTable('cron_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id),
  name: text('name').notNull(),
  schedule: text('schedule').notNull(),
  humanReadable: text('human_readable'),
  action: text('action').notNull(),
  config: text('config', { mode: 'json' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastRun: text('last_run'),
  nextRun: text('next_run'),
}, (table) => ({
  appIdIdx: index('cron_jobs_app_id_idx').on(table.appId),
}));

export const appData = sqliteTable('app_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => ({
  appIdKeyIdx: index('app_data_app_id_key_idx').on(table.appId, table.key),
}));

export const userTables = sqliteTable('user_tables', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id),
  name: text('name').notNull(),
  columns: text('columns', { mode: 'json' }).notNull(), // Array<{ name, type, options? }>
  rlsEnabled: integer('rls_enabled').default(0),  // 0=off, 1=on
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => ({
  appIdIdx: index('user_tables_app_id_idx').on(table.appId),
}));

export const userRows = sqliteTable('user_rows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tableId: integer('table_id').notNull().references(() => userTables.id, { onDelete: 'cascade' }),
  data: text('data', { mode: 'json' }).notNull(), // Record<string, unknown> matching column defs
  createdByUserId: text('created_by_user_id'),  // nullable for backward compat
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => ({
  tableIdIdx: index('user_rows_table_id_idx').on(table.tableId),
}));

export const chatHistory = sqliteTable('chat_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').references(() => apps.id),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  phase: text('phase'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => ({
  sessionIdIdx: index('chat_history_session_id_idx').on(table.sessionId),
}));
