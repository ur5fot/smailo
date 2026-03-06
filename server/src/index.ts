import { loadEnvConfig } from './utils/env.js';

const envConfig = loadEnvConfig();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { chatRouter } from './routes/chat.js';
import { appRouter, pruneOldAppData } from './routes/app.js';
import { tablesRouter } from './routes/tables.js';
import { usersRouter } from './routes/users.js';
import { membersRouter } from './routes/members.js';
import { cronManager } from './services/cronManager.js';
import { migrateOwnerRecords } from './db/migrateOwners.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sqlite } from './db/index.js';
import { setupGracefulShutdown } from './utils/shutdown.js';

const app = express();
app.set('trust proxy', 1);
const PORT = envConfig.port;
const CLIENT_URL = envConfig.clientUrl;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '50kb' }));

app.use('/api/chat', chatRouter);
app.use('/api/app', appRouter);
app.use('/api/app/:hash/tables', tablesRouter);
app.use('/api/users', usersRouter);
app.use('/api/app/:hash/members', membersRouter);

// Global error handler — must be last middleware
app.use(errorHandler);

// Migrate existing apps: ensure every app with userId has an owner in app_members
try {
  const migrated = migrateOwnerRecords();
  if (migrated > 0) {
    console.log(`[migrateOwners] Created owner records for ${migrated} apps`);
  }
} catch (err) {
  console.error('[migrateOwners] Migration failed:', err);
}

cronManager.loadAll().catch((err) => {
  console.error('[cronManager] Failed to load jobs on startup:', err);
});

// Prune old app_data rows on startup and then hourly
pruneOldAppData().catch((err) => {
  console.error('[pruneOldAppData] Startup prune failed:', err);
});
setInterval(() => {
  pruneOldAppData().catch((err) => {
    console.error('[pruneOldAppData] Hourly prune failed:', err);
  });
}, 60 * 60 * 1000);

// Process-level error handlers
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Fatal error:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const server = app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});

setupGracefulShutdown(server, sqlite);
