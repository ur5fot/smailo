import { readdirSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { sqlite } from '../db/index.js';
import { logger } from './logger.js';

const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function backupDatabase(destDir: string): Promise<string> {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  const filename = `smailo-backup-${formatTimestamp(new Date())}.sqlite`;
  const destPath = join(destDir, filename);

  await sqlite.backup(destPath);
  logger.info({ destPath }, 'Database backup created');

  return destPath;
}

export function cleanupOldBackups(destDir: string): number {
  if (!existsSync(destDir)) {
    return 0;
  }

  const now = Date.now();
  let removed = 0;

  const files = readdirSync(destDir);
  for (const file of files) {
    if (!file.startsWith('smailo-backup-') || !file.endsWith('.sqlite')) {
      continue;
    }

    // Parse timestamp from filename: smailo-backup-YYYY-MM-DD-HHmmss.sqlite
    const match = file.match(/^smailo-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite$/);
    if (!match) continue;

    const [, year, month, day, hour, min, sec] = match;
    const fileDate = new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour), parseInt(min), parseInt(sec)
    );

    if (now - fileDate.getTime() > BACKUP_MAX_AGE_MS) {
      try {
        unlinkSync(join(destDir, file));
        removed++;
        logger.debug({ file }, 'Removed old backup');
      } catch (err) {
        logger.warn({ file, err }, 'Failed to remove old backup');
      }
    }
  }

  if (removed > 0) {
    logger.info({ removed }, 'Cleaned up old backups');
  }

  return removed;
}
