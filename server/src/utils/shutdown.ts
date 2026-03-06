import type { Server } from 'http';
import type Database from 'better-sqlite3';
import { cronManager } from '../services/cronManager.js';
import { logger } from './logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let isShuttingDown = false;

export function setupGracefulShutdown(server: Server, sqlite: Database.Database): void {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Received signal, starting graceful shutdown');

    const forceTimer = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    server.close(() => {
      logger.info('HTTP server closed');

      try {
        cronManager.stopAll();
        logger.info('Cron jobs stopped');
      } catch (err) {
        logger.error({ err }, 'Error stopping cron jobs');
      }

      try {
        sqlite.close();
        logger.info('Database connection closed');
      } catch (err) {
        logger.error({ err }, 'Error closing database');
      }

      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
