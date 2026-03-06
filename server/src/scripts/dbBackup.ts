import 'dotenv/config';
import { backupDatabase, cleanupOldBackups } from '../utils/dbBackup.js';
import { logger } from '../utils/logger.js';

const destDir = process.env.BACKUP_DIR || './backups';

async function main() {
  const path = await backupDatabase(destDir);
  logger.info({ path }, 'Backup created');

  const removed = cleanupOldBackups(destDir);
  if (removed > 0) {
    logger.info({ removed }, 'Cleaned up old backups');
  }
}

main().catch((err) => {
  logger.error({ err }, 'Backup failed');
  process.exit(1);
});
