import { schedule, validate } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cronJobs, appData } from '../db/schema.js';
import type { CronJobConfig } from './aiService.js';

/**
 * Compute an approximate next-run timestamp for a cron expression.
 * Iterates forward minute-by-minute up to 366 days to find the next match.
 * Returns null if no match is found within that window.
 */
function computeNextRun(expression: string): string | null {
  const parts = expression.trim().split(/\s+/);
  // Support 5-field cron (minute hour dom month dow)
  if (parts.length !== 5) return null;

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;

  function matches(value: number, field: string, min: number, max: number): boolean {
    if (field === '*') return true;
    for (const segment of field.split(',')) {
      if (segment.includes('/')) {
        const [range, step] = segment.split('/');
        const s = parseInt(step, 10);
        const [lo, hi] = range === '*' ? [min, max] : range.split('-').map(Number);
        for (let v = lo; v <= (hi ?? lo); v += s) {
          if (v === value) return true;
        }
      } else if (segment.includes('-')) {
        const [lo, hi] = segment.split('-').map(Number);
        if (value >= lo && value <= hi) return true;
      } else {
        if (parseInt(segment, 10) === value) return true;
      }
    }
    return false;
  }

  const now = new Date();
  // Start from the next minute (UTC arithmetic throughout)
  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const limit = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  while (candidate <= limit) {
    const min = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const dom = candidate.getUTCDate();
    const month = candidate.getUTCMonth() + 1;
    const dow = candidate.getUTCDay();

    if (
      matches(min, minPart, 0, 59) &&
      matches(hour, hourPart, 0, 23) &&
      matches(dom, domPart, 1, 31) &&
      matches(month, monthPart, 1, 12) &&
      matches(dow, dowPart, 0, 6)
    ) {
      return candidate.toISOString();
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

type ActionConfig = Record<string, unknown>;

class CronManager {
  private tasks = new Map<number, ScheduledTask>();

  async loadAll(): Promise<void> {
    const activeJobs = await db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.isActive, true));

    for (const job of activeJobs) {
      this.scheduleJob(job.id, job.appId, job.schedule, job.action, (job.config ?? {}) as ActionConfig);
    }

    console.log(`[CronManager] Loaded ${activeJobs.length} active cron jobs`);
  }

  async addJobs(appId: number, jobs: CronJobConfig[]): Promise<void> {
    for (const job of jobs) {
      const [inserted] = await db
        .insert(cronJobs)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values({
          appId,
          name: job.name,
          schedule: job.schedule,
          humanReadable: job.humanReadable,
          action: job.action,
          config: job.config as any,
          isActive: true,
        } as any)
        .returning({ id: cronJobs.id });

      if (inserted) {
        this.scheduleJob(inserted.id, appId, job.schedule, job.action, job.config);
      }
    }
  }

  private scheduleJob(
    jobId: number,
    appId: number,
    expression: string,
    action: string,
    config: ActionConfig
  ): void {
    if (!validate(expression)) {
      console.warn(`[CronManager] Invalid cron expression for job ${jobId}: ${expression}`);
      return;
    }

    // Reject expressions that fire every minute (minute field = '*')
    const minuteField = expression.trim().split(/\s+/)[0];
    if (minuteField === '*') {
      console.warn(`[CronManager] Rejecting over-frequent cron expression for job ${jobId}: ${expression}`);
      return;
    }

    // Persist the initial nextRun time
    const nextRun = computeNextRun(expression);
    if (nextRun) {
      db.update(cronJobs)
        .set({ nextRun } as any)
        .where(eq(cronJobs.id, jobId))
        .catch((err) => console.error(`[CronManager] Failed to set nextRun for job ${jobId}:`, err));
    }

    const task = schedule(expression, async () => {
      await this.runJob(jobId, appId, action, config, expression);
    });

    this.tasks.set(jobId, task);
  }

  private async runJob(
    jobId: number,
    appId: number,
    action: string,
    config: ActionConfig,
    expression?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    console.log(`[CronManager] Running job ${jobId} (action: ${action})`);

    try {
      await this.executeAction(appId, action, config);

      const nextRun = expression ? computeNextRun(expression) : null;
      await db
        .update(cronJobs)
        .set({ lastRun: now, ...(nextRun ? { nextRun } : {}) } as any)
        .where(eq(cronJobs.id, jobId));
    } catch (error) {
      console.error(`[CronManager] Job ${jobId} failed:`, error);
    }
  }

  private async executeAction(
    appId: number,
    action: string,
    config: ActionConfig
  ): Promise<void> {
    switch (action) {
      case 'log_entry':
        await this.handleLogEntry(appId, config);
        break;
      case 'fetch_url':
        await this.handleFetchUrl(appId, config);
        break;
      case 'send_reminder':
        await this.handleSendReminder(appId, config);
        break;
      case 'aggregate_data':
        await this.handleAggregateData(appId, config);
        break;
      default:
        console.warn(`[CronManager] Unknown action type: ${action}`);
    }
  }

  private async handleLogEntry(appId: number, config: ActionConfig): Promise<void> {
    const fields = (config.fields as Record<string, string>) ?? {};
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    };

    for (const [key, type] of Object.entries(fields)) {
      entry[key] = type === 'number' ? 0 : '';
    }

    await db.insert(appData).values({ appId, key: 'log_entry', value: entry } as any);
  }

  private isPrivateHost(hostname: string): boolean {
    if (hostname === 'localhost') return true;
    const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 0) return true;    // 0.0.0.0/8
      if (a === 127) return true;  // loopback
      if (a === 10) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
    }
    const bare = hostname.replace(/^\[|\]$/g, '');
    if (bare === '::1' || bare.startsWith('fc') || bare.startsWith('fd')) return true;
    // IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:aabb:ccdd)
    const ipv4MappedHex = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (ipv4MappedHex) {
      const hi = parseInt(ipv4MappedHex[1], 16);
      const a = hi >> 8;
      const b = hi & 0xff;
      const lo = parseInt(ipv4MappedHex[2], 16);
      const c = lo >> 8;
      const d = lo & 0xff;
      return this.isPrivateHost(`${a}.${b}.${c}.${d}`);
    }
    const ipv4MappedDot = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (ipv4MappedDot) {
      return this.isPrivateHost(ipv4MappedDot[1]);
    }
    return false;
  }

  private async handleFetchUrl(appId: number, config: ActionConfig): Promise<void> {
    const url = config.url as string;
    if (!url) {
      console.warn('[CronManager] fetch_url action missing url config');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      console.warn(`[CronManager] fetch_url invalid URL: ${url}`);
      return;
    }
    if (parsedUrl.protocol !== 'https:') {
      console.warn(`[CronManager] fetch_url rejected non-HTTPS URL: ${url}`);
      return;
    }
    if (this.isPrivateHost(parsedUrl.hostname)) {
      console.warn(`[CronManager] fetch_url rejected private/loopback URL: ${url}`);
      return;
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const contentLength = response.headers.get('content-length');
    const MAX_BODY_BYTES = 1_048_576; // 1 MB
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      console.warn(`[CronManager] fetch_url response too large (${contentLength} bytes) for app ${appId}, skipping`);
      return;
    }
    const body = await response.text();
    if (body.length > MAX_BODY_BYTES) {
      console.warn(`[CronManager] fetch_url body exceeds 1 MB for app ${appId}, skipping`);
      return;
    }
    let value: unknown = body;

    try {
      const parsed = JSON.parse(body);
      value = parsed;

      const dataPath = config.dataPath as string | undefined;
      if (dataPath) {
        const parts = dataPath.replace(/^\$\./, '').split('.');
        let current: unknown = parsed;
        for (const part of parts) {
          if (current != null && typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
          }
        }
        value = current ?? parsed;
      }
    } catch {
      // keep raw text as value
    }

    await db.insert(appData).values({ appId, key: 'fetch_url', value: { url, result: value, fetchedAt: new Date().toISOString() } } as any);
  }

  private async handleSendReminder(appId: number, config: ActionConfig): Promise<void> {
    const text = (config.text as string) ?? 'Reminder';

    await db.insert(appData).values({ appId, key: 'reminder', value: { text, sentAt: new Date().toISOString() } } as any);
  }

  private async handleAggregateData(appId: number, config: ActionConfig): Promise<void> {
    const dataKey = config.dataKey as string;
    const operation = (config.operation as string) ?? 'avg';
    const outputKey = (config.outputKey as string) ?? `${dataKey}_${operation}`;
    const windowDays = Math.min(Math.max(1, (config.windowDays as number) ?? 7), 365);

    if (!dataKey) {
      console.warn('[CronManager] aggregate_data action missing dataKey config');
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString();

    const rows = await db
      .select()
      .from(appData)
      .where(
        and(
          eq(appData.appId, appId),
          eq(appData.key, dataKey),
          gte(appData.createdAt, cutoffStr)
        )
      )
      .orderBy(desc(appData.createdAt));

    const numbers = rows
      .map((r) => {
        const v = r.value;
        if (typeof v === 'number') return v;
        if (v != null && typeof v === 'object') {
          const obj = v as Record<string, unknown>;
          const candidate = obj[dataKey] ?? obj['value'] ?? obj['result'];
          return typeof candidate === 'number' ? candidate : null;
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    let result: number | null = null;
    if (numbers.length > 0) {
      switch (operation) {
        case 'avg':
          result = numbers.reduce((a, b) => a + b, 0) / numbers.length;
          break;
        case 'sum':
          result = numbers.reduce((a, b) => a + b, 0);
          break;
        case 'count':
          result = numbers.length;
          break;
        case 'max':
          result = Math.max(...numbers);
          break;
        case 'min':
          result = Math.min(...numbers);
          break;
        default:
          console.warn(`[CronManager] aggregate_data: unknown operation "${operation}" for app ${appId}`);
          return;
      }
    }

    await db.insert(appData).values({ appId, key: outputKey, value: { result, operation, dataKey, windowDays, sampleCount: numbers.length, computedAt: new Date().toISOString() } } as any);
  }
}

export const cronManager = new CronManager();
