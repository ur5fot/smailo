import { describe, it, expect } from 'vitest'
import { isValidCronJobConfig } from '../routes/chat.js'
import { buildSystemPrompt } from '../services/aiService.js'

describe('backward compatibility: compute cron job (date_diff)', () => {
  it('validates a correct compute date_diff config', () => {
    const config = {
      operation: 'date_diff',
      inputKeys: ['start_date', 'end_date'],
      outputKey: 'date_difference',
    }
    expect(isValidCronJobConfig('compute', config)).toBe(true)
  })

  it('rejects compute config without outputKey', () => {
    const config = {
      operation: 'date_diff',
      inputKeys: ['start_date', 'end_date'],
    }
    expect(isValidCronJobConfig('compute', config)).toBe(false)
  })

  it('rejects compute config without inputKeys', () => {
    const config = {
      operation: 'date_diff',
      outputKey: 'result',
    }
    expect(isValidCronJobConfig('compute', config)).toBe(false)
  })

  it('rejects compute config with empty inputKeys', () => {
    const config = {
      operation: 'date_diff',
      inputKeys: [],
      outputKey: 'result',
    }
    expect(isValidCronJobConfig('compute', config)).toBe(false)
  })

  it('rejects compute config without operation', () => {
    const config = {
      inputKeys: ['a', 'b'],
      outputKey: 'result',
    }
    expect(isValidCronJobConfig('compute', config)).toBe(false)
  })

  it('rejects null config', () => {
    expect(isValidCronJobConfig('compute', null)).toBe(false)
  })

  it('rejects non-object config', () => {
    expect(isValidCronJobConfig('compute', 'string')).toBe(false)
  })
})

describe('backward compatibility: aggregate_data cron job', () => {
  it('validates a correct aggregate_data config', () => {
    const config = {
      dataKey: 'weight',
      operation: 'avg',
      outputKey: 'weight_avg_7d',
      windowDays: 7,
    }
    expect(isValidCronJobConfig('aggregate_data', config)).toBe(true)
  })

  it('validates all aggregate operations', () => {
    for (const op of ['avg', 'sum', 'count', 'max', 'min']) {
      const config = {
        dataKey: 'values',
        operation: op,
        outputKey: `values_${op}`,
      }
      expect(isValidCronJobConfig('aggregate_data', config)).toBe(true)
    }
  })

  it('rejects aggregate_data config without dataKey', () => {
    const config = {
      operation: 'avg',
      outputKey: 'result',
    }
    expect(isValidCronJobConfig('aggregate_data', config)).toBe(false)
  })

  it('rejects aggregate_data config without operation', () => {
    const config = {
      dataKey: 'weight',
      outputKey: 'result',
    }
    expect(isValidCronJobConfig('aggregate_data', config)).toBe(false)
  })

  it('rejects aggregate_data config without outputKey', () => {
    const config = {
      dataKey: 'weight',
      operation: 'avg',
    }
    expect(isValidCronJobConfig('aggregate_data', config)).toBe(false)
  })

  it('rejects null config', () => {
    expect(isValidCronJobConfig('aggregate_data', null)).toBe(false)
  })
})

describe('backward compatibility: other cron actions still validated', () => {
  it('validates fetch_url config', () => {
    const config = {
      url: 'https://api.example.com/data',
      outputKey: 'api_data',
    }
    expect(isValidCronJobConfig('fetch_url', config)).toBe(true)
  })

  it('validates send_reminder config', () => {
    const config = {
      text: 'Time to exercise!',
      outputKey: 'reminder',
    }
    expect(isValidCronJobConfig('send_reminder', config)).toBe(true)
  })

  it('validates log_entry config (no required fields)', () => {
    expect(isValidCronJobConfig('log_entry', {})).toBe(true)
  })

  it('rejects unknown action', () => {
    expect(isValidCronJobConfig('unknown_action', { outputKey: 'x' })).toBe(false)
  })
})

describe('backward compatibility: AI prompts still document cron actions', () => {
  it('brainstorm prompt documents compute action', () => {
    const prompt = buildSystemPrompt('brainstorm')
    expect(prompt).toContain('compute')
    expect(prompt).toContain('date_diff')
  })

  it('brainstorm prompt documents aggregate_data action', () => {
    const prompt = buildSystemPrompt('brainstorm')
    expect(prompt).toContain('aggregate_data')
  })

  it('brainstorm prompt recommends formulas for new apps', () => {
    const prompt = buildSystemPrompt('brainstorm')
    expect(prompt).toContain('Prefer formula columns and computedValue for new apps')
  })

  it('brainstorm prompt recommends keeping cron for periodic computations', () => {
    const prompt = buildSystemPrompt('brainstorm')
    expect(prompt).toContain('Keep cron for scheduled/periodic computations')
  })
})
