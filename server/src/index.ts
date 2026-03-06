import { loadEnvConfig } from './utils/env.js';

const envConfig = loadEnvConfig();

import { initSentry, captureException, flushSentry, setupExpressErrorHandler } from './utils/sentry.js';

initSentry(envConfig.sentryDsn);

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { chatRouter } from './routes/chat.js';
import { appRouter, pruneOldAppData } from './routes/app.js';
import { tablesRouter } from './routes/tables.js';
import { usersRouter } from './routes/users.js';
import { membersRouter } from './routes/members.js';
import { healthRouter } from './routes/health.js';
import { cronManager } from './services/cronManager.js';
import { migrateOwnerRecords } from './db/migrateOwners.js';
import { errorHandler } from './middleware/errorHandler.js';
import { sqlite } from './db/index.js';
import { setupGracefulShutdown } from './utils/shutdown.js';
import { httpLogger, logger } from './utils/logger.js';

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

// Structured logging middleware
app.use(httpLogger);

// Return request ID to client for log correlation
app.use((req, res, next) => {
  const reqId = req.id;
  if (reqId) {
    res.setHeader('X-Request-Id', String(reqId));
  }
  next();
});

app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);
app.use('/api/app', appRouter);
app.use('/api/app/:hash/tables', tablesRouter);
app.use('/api/users', usersRouter);
app.use('/api/app/:hash/members', membersRouter);

// Sentry error handler — captures exceptions before our custom handler
setupExpressErrorHandler(app);

// Global error handler — must be last middleware
app.use(errorHandler);

// Migrate existing apps: ensure every app with userId has an owner in app_members
try {
  const migrated = migrateOwnerRecords();
  if (migrated > 0) {
    logger.info({ migrated }, 'Created owner records for apps');
  }
} catch (err) {
  logger.error({ err }, 'migrateOwners migration failed');
}

cronManager.loadAll().catch((err) => {
  logger.error({ err }, 'Failed to load cron jobs on startup');
});

// Prune old app_data rows on startup and then hourly
pruneOldAppData().catch((err) => {
  logger.error({ err }, 'Startup prune of old app data failed');
});
setInterval(() => {
  pruneOldAppData().catch((err) => {
    logger.error({ err }, 'Hourly prune of old app data failed');
  });
}, 60 * 60 * 1000);

// Process-level error handlers
process.on('uncaughtException', async (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  captureException(err);
  await flushSentry(2000);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening');
});

setupGracefulShutdown(server, sqlite);
