import { describe, it, expect } from 'vitest';
import { evaluateShowIf } from '../showIf';

describe('evaluateShowIf', () => {
  it('returns true for empty expression', () => {
    expect(evaluateShowIf('', {})).toBe(true);
  });

  it('returns true for whitespace-only expression', () => {
    expect(evaluateShowIf('   ', {})).toBe(true);
  });

  it('evaluates simple boolean true', () => {
    expect(evaluateShowIf('true', {})).toBe(true);
  });

  it('evaluates simple boolean false', () => {
    expect(evaluateShowIf('false', {})).toBe(false);
  });

  it('evaluates variable from context — truthy number', () => {
    expect(evaluateShowIf('count', { count: 5 })).toBe(true);
  });

  it('evaluates variable from context — zero is falsy', () => {
    expect(evaluateShowIf('count', { count: 0 })).toBe(false);
  });

  it('evaluates variable from context — truthy string', () => {
    expect(evaluateShowIf('name', { name: 'hello' })).toBe(true);
  });

  it('evaluates variable from context — empty string is falsy', () => {
    expect(evaluateShowIf('name', { name: '' })).toBe(false);
  });

  it('returns false for missing variable (null)', () => {
    expect(evaluateShowIf('missing', {})).toBe(false);
  });

  it('evaluates comparison: greater than', () => {
    expect(evaluateShowIf('temperature > 30', { temperature: 35 })).toBe(true);
    expect(evaluateShowIf('temperature > 30', { temperature: 25 })).toBe(false);
  });

  it('evaluates equality check', () => {
    expect(evaluateShowIf('status == "active"', { status: 'active' })).toBe(true);
    expect(evaluateShowIf('status == "active"', { status: 'inactive' })).toBe(false);
  });

  it('evaluates inequality check', () => {
    expect(evaluateShowIf('status != "deleted"', { status: 'active' })).toBe(true);
    expect(evaluateShowIf('status != "deleted"', { status: 'deleted' })).toBe(false);
  });

  it('evaluates logical AND', () => {
    expect(evaluateShowIf('a && b', { a: true, b: true })).toBe(true);
    expect(evaluateShowIf('a && b', { a: true, b: false })).toBe(false);
  });

  it('evaluates logical OR', () => {
    expect(evaluateShowIf('a || b', { a: false, b: true })).toBe(true);
    expect(evaluateShowIf('a || b', { a: false, b: false })).toBe(false);
  });

  it('evaluates negation', () => {
    expect(evaluateShowIf('!hidden', { hidden: false })).toBe(true);
    expect(evaluateShowIf('!hidden', { hidden: true })).toBe(false);
  });

  it('evaluates complex expression', () => {
    const ctx = { score: 85, premium: true };
    expect(evaluateShowIf('score >= 80 && premium', ctx)).toBe(true);
    expect(evaluateShowIf('score >= 90 && premium', ctx)).toBe(false);
  });

  it('evaluates arithmetic result — non-zero is truthy', () => {
    expect(evaluateShowIf('a + b', { a: 3, b: 2 })).toBe(true);
    expect(evaluateShowIf('a - b', { a: 5, b: 5 })).toBe(false);
  });

  it('handles division by zero gracefully (null is falsy)', () => {
    expect(evaluateShowIf('a / b', { a: 10, b: 0 })).toBe(false);
  });

  it('evaluates with function calls', () => {
    expect(evaluateShowIf('LEN(name) > 0', { name: 'hello' })).toBe(true);
    expect(evaluateShowIf('LEN(name) > 0', { name: '' })).toBe(false);
  });

  it('returns false for invalid expression (parse error)', () => {
    expect(evaluateShowIf('((( invalid', {})).toBe(false);
  });

  it('returns false for unknown function call', () => {
    expect(evaluateShowIf('NONEXISTENT()', {})).toBe(false);
  });

  it('handles null context values', () => {
    expect(evaluateShowIf('x', { x: null })).toBe(false);
  });

  it('handles undefined context values', () => {
    expect(evaluateShowIf('x', { x: undefined })).toBe(false);
  });

  it('evaluates IF function', () => {
    expect(evaluateShowIf('IF(active, true, false)', { active: true })).toBe(true);
    expect(evaluateShowIf('IF(active, true, false)', { active: false })).toBe(false);
  });
});
