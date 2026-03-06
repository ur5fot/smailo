import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Initialize Sentry error tracking.
 * Only activates if SENTRY_DSN is set. Safe to call without DSN — becomes a no-op.
 */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: `smailo@${process.env.npm_package_version || '0.0.0'}`,
  });
  initialized = true;
}

export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * Capture an exception in Sentry with optional context tags.
 * No-op if Sentry is not initialized.
 */
export function captureException(
  err: unknown,
  context?: Record<string, string>
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureException(err);
  });
}

/**
 * Flush pending Sentry events. Call before process exit.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs);
}

export { setupExpressErrorHandler } from '@sentry/node';
