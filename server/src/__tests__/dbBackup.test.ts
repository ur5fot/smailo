import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock sqlite backup
vi.mock('../db/index.js', () => ({
  sqlite: { backup: vi.fn().mockResolvedValue({}) },
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { backupDatabase, cleanupOldBackups } from '../utils/dbBackup.js'
import { sqlite } from '../db/index.js'

const mockBackup = vi.mocked(sqlite.backup)

describe('dbBackup', () => {
  let tempDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    tempDir = mkdtempSync(join(tmpdir(), 'smailo-backup-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('backupDatabase', () => {
    it('creates backup file with timestamp in name', async () => {
      const destPath = await backupDatabase(tempDir)

      expect(destPath).toMatch(/smailo-backup-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite$/)
      expect(mockBackup).toHaveBeenCalledWith(destPath)
    })

    it('creates destination directory if it does not exist', async () => {
      const nestedDir = join(tempDir, 'sub', 'dir')

      await backupDatabase(nestedDir)

      expect(mockBackup).toHaveBeenCalledOnce()
      const arg = mockBackup.mock.calls[0][0] as string
      expect(arg.startsWith(nestedDir)).toBe(true)
    })

    it('propagates backup errors', async () => {
      mockBackup.mockRejectedValueOnce(new Error('disk full'))

      await expect(backupDatabase(tempDir)).rejects.toThrow('disk full')
    })
  })

  describe('cleanupOldBackups', () => {
    it('removes backup files older than 7 days', () => {
      // Create a file with a date 10 days ago
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const oldFilename = `smailo-backup-${oldDate.getFullYear()}-${pad(oldDate.getMonth() + 1)}-${pad(oldDate.getDate())}-${pad(oldDate.getHours())}${pad(oldDate.getMinutes())}${pad(oldDate.getSeconds())}.sqlite`

      writeFileSync(join(tempDir, oldFilename), 'old')

      const removed = cleanupOldBackups(tempDir)

      expect(removed).toBe(1)
      expect(readdirSync(tempDir)).toHaveLength(0)
    })

    it('keeps recent backups', () => {
      // Create a file with today's date
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const recentFilename = `smailo-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.sqlite`

      writeFileSync(join(tempDir, recentFilename), 'recent')

      const removed = cleanupOldBackups(tempDir)

      expect(removed).toBe(0)
      expect(readdirSync(tempDir)).toHaveLength(1)
    })

    it('ignores non-backup files', () => {
      writeFileSync(join(tempDir, 'other-file.txt'), 'data')
      writeFileSync(join(tempDir, 'smailo-backup-invalid.sqlite'), 'data')

      const removed = cleanupOldBackups(tempDir)

      expect(removed).toBe(0)
      expect(readdirSync(tempDir)).toHaveLength(2)
    })

    it('returns 0 if directory does not exist', () => {
      const removed = cleanupOldBackups(join(tempDir, 'nonexistent'))

      expect(removed).toBe(0)
    })
  })
})
