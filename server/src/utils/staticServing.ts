import express, { type Express } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * In production, serve the built Vue client from client/dist.
 * Hashed assets get long-lived cache headers; index.html is never cached.
 * Non-API GET requests fall through to index.html for SPA routing.
 */
export function setupStaticServing(app: Express): void {
  const clientDistPath = path.resolve(__dirname, '../../../client/dist');

  // Hashed assets (js, css) — immutable cache
  app.use(
    '/assets',
    express.static(path.join(clientDistPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }),
  );

  // Other static files (favicon, etc.) — no-cache for html, short cache for rest
  app.use(
    express.static(clientDistPath, {
      maxAge: 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  // SPA fallback: non-API GET requests serve index.html
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}
