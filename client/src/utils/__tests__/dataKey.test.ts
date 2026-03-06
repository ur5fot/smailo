import { describe, it, expect } from 'vitest';
import { resolveDataKey } from '../dataKey';

describe('resolveDataKey', () => {
  describe('simple key lookup', () => {
    it('returns value for existing key', () => {
      expect(resolveDataKey({ name: 'Alice' }, 'name')).toBe('Alice');
    });

    it('returns undefined for missing key', () => {
      expect(resolveDataKey({}, 'missing')).toBeUndefined();
    });

    it('returns falsy values correctly', () => {
      expect(resolveDataKey({ zero: 0 }, 'zero')).toBe(0);
      expect(resolveDataKey({ empty: '' }, 'empty')).toBe('');
      expect(resolveDataKey({ no: false }, 'no')).toBe(false);
    });

    it('returns null value as-is', () => {
      expect(resolveDataKey({ val: null }, 'val')).toBeNull();
    });
  });

  describe('dot notation (nested access)', () => {
    it('resolves nested object property', () => {
      const data = { rates: { USD: 1.2, EUR: 0.9 } };
      expect(resolveDataKey(data, 'rates.USD')).toBe(1.2);
    });

    it('resolves deeply nested property', () => {
      const data = { a: { b: { c: 42 } } };
      expect(resolveDataKey(data, 'a.b.c')).toBe(42);
    });

    it('returns undefined for missing nested segment', () => {
      const data = { a: { b: 1 } };
      expect(resolveDataKey(data, 'a.c')).toBeUndefined();
    });

    it('returns undefined when intermediate is null', () => {
      const data = { a: null };
      expect(resolveDataKey(data as Record<string, unknown>, 'a.b')).toBeUndefined();
    });

    it('returns undefined when intermediate is primitive', () => {
      const data = { a: 42 };
      expect(resolveDataKey(data, 'a.b')).toBeUndefined();
    });
  });

  describe('auto-parse JSON strings', () => {
    it('parses JSON string and resolves nested key', () => {
      const data = { rates: '{"USD": 1.2, "EUR": 0.9}' };
      expect(resolveDataKey(data, 'rates.USD')).toBe(1.2);
    });

    it('returns undefined for invalid JSON string', () => {
      const data = { rates: 'not json' };
      expect(resolveDataKey(data, 'rates.USD')).toBeUndefined();
    });

    it('returns the string directly for simple key (no dot)', () => {
      const data = { name: '{"nested": true}' };
      expect(resolveDataKey(data, 'name')).toBe('{"nested": true}');
    });
  });

  describe('prototype pollution blocked', () => {
    it('blocks __proto__ as top-level key', () => {
      expect(resolveDataKey({ __proto__: 'bad' } as any, '__proto__')).toBeUndefined();
    });

    it('blocks constructor as top-level key', () => {
      expect(resolveDataKey({ constructor: 'bad' } as any, 'constructor')).toBeUndefined();
    });

    it('blocks prototype as top-level key', () => {
      expect(resolveDataKey({ prototype: 'bad' } as any, 'prototype')).toBeUndefined();
    });

    it('blocks __proto__ in dot notation (first segment)', () => {
      const data = { __proto__: { x: 1 } } as any;
      expect(resolveDataKey(data, '__proto__.x')).toBeUndefined();
    });

    it('blocks __proto__ in dot notation (nested segment)', () => {
      const data = { a: { __proto__: { x: 1 } } };
      expect(resolveDataKey(data, 'a.__proto__.x')).toBeUndefined();
    });

    it('blocks constructor in nested segment', () => {
      const data = { a: { constructor: { x: 1 } } };
      expect(resolveDataKey(data as Record<string, unknown>, 'a.constructor.x')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('returns undefined when top key missing with dot notation', () => {
      expect(resolveDataKey({}, 'missing.key')).toBeUndefined();
    });

    it('prefers direct key over dot notation', () => {
      const data = { 'a.b': 'direct', a: { b: 'nested' } };
      expect(resolveDataKey(data, 'a.b')).toBe('direct');
    });
  });
});
