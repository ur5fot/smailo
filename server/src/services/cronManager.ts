import { schedule, validate } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { cronJobs, appData } from '../db/schema.js';
import type { CronJobConfig } from './aiService.js';

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

    const task = schedule(expression, async () => {
      await this.runJob(jobId, appId, action, config);
    });

    this.tasks.set(jobId, task);
  }

  private async runJob(
    jobId: number,
    appId: number,
    action: string,
    config: ActionConfig
  ): Promise<void> {
    const now = new Date().toISOString();
    console.log(`[CronManager] Running job ${jobId} (action: ${action})`);

    try {
      await this.executeAction(appId, action, config);

      await db
        .update(cronJobs)
        .set({ lastRun: now } as any)
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

  private async handleFetchUrl(appId: number, config: ActionConfig): Promise<void> {
    const url = config.url as string;
    if (!url) {
      console.warn('[CronManager] fetch_url action missing url config');
      return;
    }

    const response = await fetch(url);
    const body = await response.text();
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
    const windowDays = (config.windowDays as number) ?? 7;

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
      }
    }

    await db.insert(appData).values({ appId, key: outputKey, value: { result, operation, dataKey, windowDays, sampleCount: numbers.length, computedAt: new Date().toISOString() } } as any);
  }
}

export const cronManager = new CronManager();
