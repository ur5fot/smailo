import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Global Express error-handling middleware.
 * Must be registered LAST in the middleware chain.
 *
 * - Logs the error (Sentry captures via setupExpressErrorHandler upstream)
 * - Returns a safe 500 response without leaking internals
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({ err }, 'Unhandled route error');

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
