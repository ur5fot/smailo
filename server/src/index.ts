import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { chatRouter } from './routes/chat.js';
import { appRouter, pruneOldAppData } from './routes/app.js';
import { usersRouter } from './routes/users.js';
import { cronManager } from './services/cronManager.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '50kb' }));

app.use('/api/chat', chatRouter);
app.use('/api/app', appRouter);
app.use('/api/users', usersRouter);

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

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
