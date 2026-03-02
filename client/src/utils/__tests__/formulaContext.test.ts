import { describe, it, expect } from 'vitest'
import { buildFormulaContext } from '../formulaContext'

describe('buildFormulaContext', () => {
  it('returns empty object for empty appData', () => {
    expect(buildFormulaContext({})).toEqual({})
  })

  it('copies simple string values', () => {
    const result = buildFormulaContext({ status: 'active', name: 'test' })
    expect(result).toEqual({ status: 'active', name: 'test' })
  })

  it('copies number values', () => {
    const result = buildFormulaContext({ count: 42, score: 3.14 })
    expect(result).toEqual({ count: 42, score: 3.14 })
  })

  it('copies boolean values', () => {
    const result = buildFormulaContext({ enabled: true, hidden: false })
    expect(result).toEqual({ enabled: true, hidden: false })
  })

  it('copies null values', () => {
    const result = buildFormulaContext({ empty: null })
    expect(result).toEqual({ empty: null })
  })

  it('auto-parses JSON object strings', () => {
    const result = buildFormulaContext({ rates: '{"USD": 85.5, "EUR": 92.1}' })
    expect(result).toEqual({ rates: { USD: 85.5, EUR: 92.1 } })
  })

  it('auto-parses JSON array strings', () => {
    const result = buildFormulaContext({ items: '[1, 2, 3]' })
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('does not parse non-JSON strings that look like JSON', () => {
    const result = buildFormulaContext({ bad: '{not json}' })
    expect(result).toEqual({ bad: '{not json}' })
  })

  it('keeps plain strings as-is', () => {
    const result = buildFormulaContext({ greeting: 'hello world' })
    expect(result).toEqual({ greeting: 'hello world' })
  })

  it('keeps numeric strings as-is (not JSON objects)', () => {
    const result = buildFormulaContext({ val: '123' })
    expect(result).toEqual({ val: '123' })
  })

  it('handles mixed value types', () => {
    const result = buildFormulaContext({
      count: 5,
      status: 'active',
      config: '{"theme": "dark"}',
      enabled: true,
    })
    expect(result).toEqual({
      count: 5,
      status: 'active',
      config: { theme: 'dark' },
      enabled: true,
    })
  })

  it('handles JSON strings with whitespace', () => {
    const result = buildFormulaContext({ data: '  {"key": "val"}  ' })
    expect(result).toEqual({ data: { key: 'val' } })
  })

  it('does not mutate the input appData', () => {
    const input = { rates: '{"USD": 85}', count: 10 }
    const inputCopy = { ...input }
    buildFormulaContext(input)
    expect(input).toEqual(inputCopy)
  })
})
