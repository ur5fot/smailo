import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Ensure no console.log/warn/error calls remain in server production code.
 * Test files are excluded since they may legitimately use console for test setup.
 */
describe('no console.* in production code', () => {
  function collectTsFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Skip test directories
        if (entry === '__tests__' || entry === '__mocks__') continue;
        results.push(...collectTsFiles(fullPath));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const srcDir = join(__dirname, '..');
  const files = collectTsFiles(srcDir);

  it('should have found production .ts files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('should not contain console.log/warn/error in any production file', () => {
    const violations: string[] = [];
    const pattern = /\bconsole\.(log|warn|error)\b/;

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          const relativePath = file.replace(srcDir + '/', '');
          violations.push(`${relativePath}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
