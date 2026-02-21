import { schedule, validate } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { lookup } from 'dns/promises';
import https from 'node:https';
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
        if (s <= 0) return false;
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

  const limit = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
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

/** Keys stored by cron handlers must match this pattern (same rule as the data endpoint). */
const CRON_KEY_REGEX = /^[a-zA-Z0-9_]{1,100}$/;

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

  private static readonly MAX_JOBS_PER_APP = 5;

  private static readonly ALLOWED_ACTIONS = new Set(['log_entry', 'fetch_url', 'send_reminder', 'aggregate_data']);

  async addJobs(appId: number, jobs: CronJobConfig[]): Promise<void> {
    const capped = jobs.slice(0, CronManager.MAX_JOBS_PER_APP);
    for (const job of capped) {
      // Validate action and schedule before inserting so we never persist inert jobs that
      // would waste a slot and generate re-warnings on every server restart.
      if (!CronManager.ALLOWED_ACTIONS.has(job.action)) {
        console.warn(`[CronManager] Skipping job "${job.name}" with unknown action: ${job.action}`);
        continue;
      }
      if (!validate(job.schedule)) {
        console.warn(`[CronManager] Skipping job "${job.name}" with invalid cron expression: ${job.schedule}`);
        continue;
      }
      const expressionParts = job.schedule.trim().split(/\s+/);
      if (expressionParts.length !== 5) {
        console.warn(`[CronManager] Skipping non-5-field cron expression for job "${job.name}": ${job.schedule}`);
        continue;
      }
      const minuteField = expressionParts[0];
      const isOverFrequent =
        minuteField === '*' ||
        (minuteField.startsWith('*/') && parseInt(minuteField.slice(2), 10) < 5);
      if (isOverFrequent) {
        console.warn(`[CronManager] Skipping over-frequent cron expression for job "${job.name}": ${job.schedule}`);
        continue;
      }

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

    // Only accept standard 5-field expressions (minute hour dom month dow).
    // node-cron also accepts 6-field (second minute hour dom month dow) expressions,
    // which would cause the minute-field guard below to operate on the seconds field.
    const expressionParts = expression.trim().split(/\s+/);
    if (expressionParts.length !== 5) {
      console.warn(`[CronManager] Rejecting non-5-field cron expression for job ${jobId}: ${expression}`);
      return;
    }

    // Reject expressions that fire more than once every 5 minutes (minute field = '*' or '*/N' where N<5)
    const minuteField = expressionParts[0];
    const isOverFrequent =
      minuteField === '*' ||
      (minuteField.startsWith('*/') && parseInt(minuteField.slice(2), 10) < 5);
    if (isOverFrequent) {
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
    }, { timezone: 'UTC' });

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
      await this.executeAction(jobId, appId, action, config);

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
    jobId: number,
    appId: number,
    action: string,
    config: ActionConfig
  ): Promise<void> {
    switch (action) {
      case 'log_entry':
        await this.handleLogEntry(jobId, appId, config);
        break;
      case 'fetch_url':
        await this.handleFetchUrl(jobId, appId, config);
        break;
      case 'send_reminder':
        await this.handleSendReminder(jobId, appId, config);
        break;
      case 'aggregate_data':
        await this.handleAggregateData(appId, config);
        break;
      default:
        console.warn(`[CronManager] Unknown action type: ${action}`);
    }
  }

  private async handleLogEntry(jobId: number, appId: number, config: ActionConfig): Promise<void> {
    const fields = (config.fields as Record<string, string>) ?? {};
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    };

    for (const [key, type] of Object.entries(fields)) {
      entry[key] = type === 'number' ? 0 : '';
    }

    // Validate outputKey against the same regex used by the data endpoint.
    const rawLogKey = typeof config.outputKey === 'string' && config.outputKey
      ? config.outputKey.slice(0, 100)
      : `log_entry_${jobId}`;
    const storageKey = CRON_KEY_REGEX.test(rawLogKey) ? rawLogKey : `log_entry_${jobId}`;
    await db.insert(appData).values({ appId, key: storageKey, value: entry } as any);
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
      if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT RFC 6598
    }
    const bare = hostname.replace(/^\[|\]$/g, '');
    if (
      bare === '::1' ||
      bare === '::' ||
      bare.toLowerCase().startsWith('fc') ||
      bare.toLowerCase().startsWith('fd') ||
      bare.toLowerCase().startsWith('fe80') || // link-local
      bare.toLowerCase().startsWith('ff')       // multicast
    ) return true;
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

  private async handleFetchUrl(jobId: number, appId: number, config: ActionConfig): Promise<void> {
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

    // Resolve DNS before fetching to block DNS rebinding: the cron fires later than when the
    // hostname was first validated, so an attacker could swap the DNS record to point at an
    // internal address in the meantime.
    let resolvedIp: string;
    try {
      const result = await lookup(parsedUrl.hostname);
      resolvedIp = result.address;
    } catch {
      console.warn(`[CronManager] fetch_url DNS lookup failed for: ${url}`);
      return;
    }
    if (this.isPrivateHost(resolvedIp)) {
      console.warn(`[CronManager] fetch_url DNS resolved to private IP ${resolvedIp}: ${url}`);
      return;
    }

    const MAX_BODY_BYTES = 1_048_576; // 1 MB

    // Use https.request with the pre-resolved IP to prevent DNS rebinding TOCTOU:
    // connecting to the IP directly avoids a second OS-level DNS lookup while
    // still sending the correct Host header and TLS SNI for certificate validation.
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443;
    const path = parsedUrl.pathname + parsedUrl.search;

    type FetchResult =
      | { ok: true; body: Buffer }
      | { ok: false; reason: 'redirect' | 'too_large' | 'error'; detail?: unknown };

    const fetchResult: FetchResult = await new Promise((resolve) => {
      let settled = false;
      const done = (r: FetchResult) => { if (!settled) { settled = true; resolve(r); } };

      const req = https.request(
        {
          hostname: resolvedIp,        // Pinned resolved IP — prevents DNS rebinding
          port,
          path,
          method: 'GET',
          headers: { Host: parsedUrl.hostname },
          servername: parsedUrl.hostname, // TLS SNI for certificate validation
          rejectUnauthorized: true,
        },
        (res) => {
          // Block redirects to prevent SSRF via redirect to a private/internal URL
          if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400) {
            res.destroy();
            done({ ok: false, reason: 'redirect' });
            return;
          }
          const cl = res.headers['content-length'];
          if (cl && parseInt(cl as string, 10) > MAX_BODY_BYTES) {
            res.destroy();
            done({ ok: false, reason: 'too_large' });
            return;
          }
          const chunks: Buffer[] = [];
          let totalSize = 0;
          res.on('data', (chunk: Buffer) => {
            totalSize += chunk.length;
            if (totalSize > MAX_BODY_BYTES) {
              res.destroy();
              done({ ok: false, reason: 'too_large' });
            } else {
              chunks.push(chunk);
            }
          });
          res.on('end', () => done({ ok: true, body: Buffer.concat(chunks) }));
          res.on('error', (err) => done({ ok: false, reason: 'error', detail: err }));
        }
      );
      req.setTimeout(10_000, () => {
        req.destroy();
        done({ ok: false, reason: 'error', detail: new Error('Request timeout') });
      });
      req.on('error', (err) => done({ ok: false, reason: 'error', detail: err }));
      req.end();
    });

    if (fetchResult.ok === false) {
      if (fetchResult.reason === 'redirect') {
        console.warn(`[CronManager] fetch_url rejected redirect response for app ${appId}: ${url}`);
      } else if (fetchResult.reason === 'too_large') {
        console.warn(`[CronManager] fetch_url body exceeds 1 MB for app ${appId}, skipping`);
      } else {
        console.warn(`[CronManager] fetch_url request failed for app ${appId}:`, fetchResult.detail);
      }
      return;
    }

    const body = fetchResult.body.toString('utf8');
    let value: unknown = body;

    try {
      const parsed = JSON.parse(body);
      value = parsed;

      const dataPath = config.dataPath as string | undefined;
      if (dataPath) {
        const BLOCKED_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
        const parts = dataPath.replace(/^\$\./, '').split('.');
        let current: unknown = parsed;
        for (const part of parts) {
          if (BLOCKED_PATH_KEYS.has(part)) { current = undefined; break; }
          if (current != null && typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
          }
        }
        value = current ?? parsed;
      }
    } catch {
      // keep raw text as value
    }

    // Validate outputKey against the same regex used by the data endpoint.
    const rawFetchKey = typeof config.outputKey === 'string' && config.outputKey
      ? config.outputKey.slice(0, 100)
      : `fetch_url_${jobId}`;
    const fetchStorageKey = CRON_KEY_REGEX.test(rawFetchKey) ? rawFetchKey : `fetch_url_${jobId}`;
    await db.insert(appData).values({ appId, key: fetchStorageKey, value } as any);
  }

  private async handleSendReminder(jobId: number, appId: number, config: ActionConfig): Promise<void> {
    const text = (config.text as string) ?? 'Reminder';
    // Support outputKey so the reminder's storage key can be referenced by a UI component's dataKey.
    const rawKey = typeof config.outputKey === 'string' && config.outputKey
      ? config.outputKey.slice(0, 100)
      : `reminder_${jobId}`;
    const storageKey = CRON_KEY_REGEX.test(rawKey) ? rawKey : `reminder_${jobId}`;
    await db.insert(appData).values({ appId, key: storageKey, value: { text, sentAt: new Date().toISOString() } } as any);
  }

  private async handleAggregateData(appId: number, config: ActionConfig): Promise<void> {
    const dataKey = ((config.dataKey as string) ?? '').slice(0, 100);
    const operation = (config.operation as string) ?? 'avg';
    const rawOutputKey = ((config.outputKey as string) ?? `${dataKey}_${operation}`).slice(0, 100);
    const fallbackKey = `${dataKey}_${operation}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 100);
    const outputKey = CRON_KEY_REGEX.test(rawOutputKey) ? rawOutputKey : fallbackKey;
    // Guard against non-numeric windowDays which would produce NaN and crash toISOString().
    const rawWindowDays = config.windowDays;
    const windowDays = typeof rawWindowDays === 'number' && isFinite(rawWindowDays)
      ? Math.min(Math.max(1, rawWindowDays), 365)
      : 7;

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

    if (numbers.length === 0) {
      console.warn(`[CronManager] aggregate_data: no numeric values found for key "${dataKey}" in app ${appId}`);
      return;
    }

    let result: number | null = null;
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

    // Store the plain numeric result so UI components (Knob, ProgressBar, Tag, etc.) can
    // bind directly via dataKey without needing to unwrap a metadata object.
    await db.insert(appData).values({ appId, key: outputKey, value: result } as any);
  }
}

export const cronManager = new CronManager();
