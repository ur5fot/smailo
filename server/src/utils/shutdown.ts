import type { Server } from 'http';
import type Database from 'better-sqlite3';
import { cronManager } from '../services/cronManager.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let isShuttingDown = false;

export function setupGracefulShutdown(server: Server, sqlite: Database.Database): void {
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[shutdown] Received ${signal}, starting graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      console.error('[shutdown] Timeout exceeded, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    server.close(() => {
      console.log('[shutdown] HTTP server closed');

      try {
        cronManager.stopAll();
        console.log('[shutdown] Cron jobs stopped');
      } catch (err) {
        console.error('[shutdown] Error stopping cron jobs:', err);
      }

      try {
        sqlite.close();
        console.log('[shutdown] Database connection closed');
      } catch (err) {
        console.error('[shutdown] Error closing database:', err);
      }

      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { isShuttingDown };
