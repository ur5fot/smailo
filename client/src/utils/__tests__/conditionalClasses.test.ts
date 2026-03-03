import { describe, it, expect } from 'vitest'
import { getConditionalClasses, STYLE_IF_PREFIX } from '../conditionalClasses'

describe('getConditionalClasses', () => {
  it('returns empty array when styleIf is undefined', () => {
    expect(getConditionalClasses(undefined, {})).toEqual([])
  })

  it('returns empty array when styleIf is empty array', () => {
    expect(getConditionalClasses([], {})).toEqual([])
  })

  it('prefixes class names with si-', () => {
    const styleIf = [{ condition: 'true', class: 'warning' }]
    const result = getConditionalClasses(styleIf, {})
    expect(result).toEqual(['si-warning'])
  })

  it('STYLE_IF_PREFIX is "si-"', () => {
    expect(STYLE_IF_PREFIX).toBe('si-')
  })

  it('evaluates condition against appData values', () => {
    const styleIf = [{ condition: 'value > 100', class: 'critical' }]
    const appData = { value: 150 }
    expect(getConditionalClasses(styleIf, appData)).toEqual(['si-critical'])
  })

  it('returns empty array when condition is false', () => {
    const styleIf = [{ condition: 'value > 100', class: 'critical' }]
    const appData = { value: 50 }
    expect(getConditionalClasses(styleIf, appData)).toEqual([])
  })

  it('applies multiple classes when multiple conditions are true', () => {
    const styleIf = [
      { condition: 'value > 100', class: 'warning' },
      { condition: 'value > 200', class: 'critical' },
    ]
    const appData = { value: 250 }
    const result = getConditionalClasses(styleIf, appData)
    expect(result).toEqual(['si-warning', 'si-critical'])
  })

  it('applies only matching classes when conditions differ', () => {
    const styleIf = [
      { condition: 'value > 100', class: 'warning' },
      { condition: 'value > 200', class: 'critical' },
    ]
    const appData = { value: 150 }
    const result = getConditionalClasses(styleIf, appData)
    expect(result).toEqual(['si-warning'])
  })

  it('treats non-empty string context values as truthy (no JSON parsing for plain strings)', () => {
    const styleIf = [{ condition: 'active', class: 'highlight' }]
    const appData = { active: 'true' }
    // 'true' as a non-empty string is truthy — no JSON parsing occurs since it's not a JSON object/array
    const result = getConditionalClasses(styleIf, appData)
    expect(result).toEqual(['si-highlight'])
  })

  it('handles all predefined class names', () => {
    const styleIf = [
      { condition: 'a', class: 'warning' },
      { condition: 'b', class: 'critical' },
      { condition: 'c', class: 'success' },
      { condition: 'd', class: 'muted' },
      { condition: 'e', class: 'highlight' },
    ]
    const appData = { a: true, b: true, c: true, d: true, e: true }
    const result = getConditionalClasses(styleIf, appData)
    expect(result).toEqual(['si-warning', 'si-critical', 'si-success', 'si-muted', 'si-highlight'])
  })

  it('returns empty array when no conditions match', () => {
    const styleIf = [
      { condition: 'score > 90', class: 'success' },
      { condition: 'score < 30', class: 'critical' },
    ]
    const appData = { score: 60 }
    expect(getConditionalClasses(styleIf, appData)).toEqual([])
  })

  it('handles missing context variables gracefully', () => {
    const styleIf = [{ condition: 'nonexistent > 5', class: 'warning' }]
    expect(getConditionalClasses(styleIf, {})).toEqual([])
  })

  it('handles invalid condition expressions silently', () => {
    const styleIf = [
      { condition: '((( bad syntax', class: 'broken' },
      { condition: 'true', class: 'success' },
    ]
    expect(getConditionalClasses(styleIf, {})).toEqual(['si-success'])
  })

  it('works with equality checks against string appData values', () => {
    const styleIf = [
      { condition: 'status == "error"', class: 'critical' },
      { condition: 'status == "ok"', class: 'success' },
    ]
    const result1 = getConditionalClasses(styleIf, { status: 'error' })
    expect(result1).toEqual(['si-critical'])

    const result2 = getConditionalClasses(styleIf, { status: 'ok' })
    expect(result2).toEqual(['si-success'])
  })
})
