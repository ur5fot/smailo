import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
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
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  lastVisit: text('last_visit'),
});

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
});

export const appData = sqliteTable('app_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').notNull().references(() => apps.id),
  key: text('key').notNull(),
  value: text('value', { mode: 'json' }),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const chatHistory = sqliteTable('chat_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id').references(() => apps.id),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  phase: text('phase'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
