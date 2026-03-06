import { Request, Response, NextFunction } from 'express';

/**
 * Global Express error-handling middleware.
 * Must be registered LAST in the middleware chain.
 *
 * - Logs the error (with stack in development, without in production)
 * - Returns a safe 500 response without leaking internals
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    console.error('[errorHandler]', err.message);
  } else {
    console.error('[errorHandler]', err.stack || err.message);
  }

  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
