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
    release: `smailo@1.0.0`,
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

/**
 * Express middleware that enriches Sentry scope with request context.
 * Must be registered AFTER routes that set req params.
 */
export function sentryContextMiddleware(
  req: { params?: Record<string, string>; id?: string | number; userId?: string },
  _res: unknown,
  next: () => void
): void {
  if (!initialized) {
    next();
    return;
  }
  Sentry.withScope((scope) => {
    if (req.params?.hash) scope.setTag('appHash', req.params.hash);
    if (req.userId) scope.setTag('userId', req.userId);
    if (req.id) scope.setTag('requestId', String(req.id));
  });
  next();
}

export { setupExpressErrorHandler } from '@sentry/node';
