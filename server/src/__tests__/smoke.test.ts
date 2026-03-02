import { describe, it, expect } from 'vitest'
import { validateUiComponents } from '../services/aiService.js'

describe('smoke test', () => {
  it('imports server module successfully', () => {
    expect(typeof validateUiComponents).toBe('function')
  })

  it('validates empty array', () => {
    const result = validateUiComponents([])
    expect(result).toEqual([])
  })
})
