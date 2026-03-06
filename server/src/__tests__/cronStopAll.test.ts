import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/index.js', () => ({
  db: {},
  sqlite: {},
}))

vi.mock('../db/schema.js', () => ({
  cronJobs: {},
  appData: {},
}))

vi.mock('../db/queries.js', () => ({
  getLatestAppData: vi.fn().mockResolvedValue([]),
}))

vi.mock('../utils/fetchProxy.js', () => ({
  fetchSafe: vi.fn(),
  extractDataPath: vi.fn(),
}))

const mockStop = vi.fn()
const mockSchedule = vi.fn().mockReturnValue({ stop: mockStop })
const mockValidate = vi.fn().mockReturnValue(true)

vi.mock('node-cron', () => ({
  schedule: mockSchedule,
  validate: mockValidate,
}))

// Mock db.select/insert/update chain
vi.mock('../db/index.js', () => {
  const chainable = () => {
    const obj: any = {}
    obj.select = () => obj
    obj.from = () => obj
    obj.where = () => Promise.resolve([])
    obj.insert = () => obj
    obj.values = () => obj
    obj.returning = () => Promise.resolve([{ id: 1 }])
    obj.update = () => obj
    obj.set = () => obj
    return obj
  }
  return {
    db: chainable(),
    sqlite: {},
  }
})

describe('CronManager.stopAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stops all scheduled tasks and clears the map', async () => {
    // Import fresh module
    const { cronManager } = await import('../services/cronManager.js')

    // Access private tasks map for verification
    const tasks = (cronManager as any).tasks as Map<number, any>

    // Add some mock tasks
    const mockTask1 = { stop: vi.fn() }
    const mockTask2 = { stop: vi.fn() }
    tasks.set(1, mockTask1 as any)
    tasks.set(2, mockTask2 as any)

    expect(tasks.size).toBe(2)

    cronManager.stopAll()

    expect(mockTask1.stop).toHaveBeenCalledOnce()
    expect(mockTask2.stop).toHaveBeenCalledOnce()
    expect(tasks.size).toBe(0)
  })

  it('does nothing when no tasks are scheduled', async () => {
    const { cronManager } = await import('../services/cronManager.js')
    const tasks = (cronManager as any).tasks as Map<number, any>
    tasks.clear()

    // Should not throw
    cronManager.stopAll()
    expect(tasks.size).toBe(0)
  })
})
