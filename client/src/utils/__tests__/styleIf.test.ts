import { describe, it, expect } from 'vitest';
import { evaluateStyleIf } from '../styleIf';

describe('evaluateStyleIf', () => {
  it('returns empty array for empty conditions', () => {
    expect(evaluateStyleIf([], {})).toEqual([]);
  });

  it('returns empty array for null/undefined input', () => {
    expect(evaluateStyleIf(null as any, {})).toEqual([]);
    expect(evaluateStyleIf(undefined as any, {})).toEqual([]);
  });

  it('applies class when condition is true', () => {
    const conditions = [{ condition: 'value > 100', class: 'warning' }];
    expect(evaluateStyleIf(conditions, { value: 150 })).toEqual(['warning']);
  });

  it('does not apply class when condition is false', () => {
    const conditions = [{ condition: 'value > 100', class: 'warning' }];
    expect(evaluateStyleIf(conditions, { value: 50 })).toEqual([]);
  });

  it('applies multiple classes when multiple conditions are true', () => {
    const conditions = [
      { condition: 'value > 100', class: 'warning' },
      { condition: 'value > 200', class: 'critical' },
      { condition: 'active', class: 'highlight' },
    ];
    const ctx = { value: 250, active: true };
    expect(evaluateStyleIf(conditions, ctx)).toEqual(['warning', 'critical', 'highlight']);
  });

  it('applies only matching classes', () => {
    const conditions = [
      { condition: 'value > 100', class: 'warning' },
      { condition: 'value > 200', class: 'critical' },
    ];
    const ctx = { value: 150 };
    expect(evaluateStyleIf(conditions, ctx)).toEqual(['warning']);
  });

  it('skips conditions with empty condition string', () => {
    const conditions = [
      { condition: '', class: 'warning' },
      { condition: 'true', class: 'active' },
    ];
    expect(evaluateStyleIf(conditions, {})).toEqual(['active']);
  });

  it('skips conditions with empty class string', () => {
    const conditions = [
      { condition: 'true', class: '' },
      { condition: 'true', class: 'active' },
    ];
    expect(evaluateStyleIf(conditions, {})).toEqual(['active']);
  });

  it('skips invalid condition expressions silently', () => {
    const conditions = [
      { condition: '((( bad syntax', class: 'broken' },
      { condition: 'true', class: 'valid' },
    ];
    expect(evaluateStyleIf(conditions, {})).toEqual(['valid']);
  });

  it('skips items with missing condition or class properties', () => {
    const conditions = [
      { condition: 'true' } as any,
      { class: 'missing-cond' } as any,
      null as any,
      { condition: 'true', class: 'valid' },
    ];
    expect(evaluateStyleIf(conditions, {})).toEqual(['valid']);
  });

  it('works with equality checks', () => {
    const conditions = [
      { condition: 'status == "error"', class: 'critical' },
      { condition: 'status == "ok"', class: 'success' },
    ];
    expect(evaluateStyleIf(conditions, { status: 'error' })).toEqual(['critical']);
    expect(evaluateStyleIf(conditions, { status: 'ok' })).toEqual(['success']);
  });

  it('works with complex expressions', () => {
    const conditions = [
      { condition: 'score >= 90 && premium', class: 'gold' },
      { condition: 'score >= 70 && score < 90', class: 'silver' },
    ];
    expect(evaluateStyleIf(conditions, { score: 95, premium: true })).toEqual(['gold']);
    expect(evaluateStyleIf(conditions, { score: 80, premium: false })).toEqual(['silver']);
  });

  it('handles missing context variables gracefully', () => {
    const conditions = [
      { condition: 'nonexistent > 5', class: 'warning' },
    ];
    expect(evaluateStyleIf(conditions, {})).toEqual([]);
  });
});
