import { describe, it, expect } from 'vitest';
import { applyFilter, parseFilterParam } from '../utils/filterRows.js';

type Row = { id: number; data: Record<string, unknown>; createdAt: string; updatedAt: string | null };

function row(id: number, data: Record<string, unknown>): Row {
  return { id, data, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: null };
}

describe('applyFilter', () => {
  const rows = [
    row(1, { status: 'active', score: 90, name: 'Alice' }),
    row(2, { status: 'inactive', score: 60, name: 'Bob' }),
    row(3, { status: 'active', score: 75, name: 'Carol' }),
  ];

  describe('eq operator', () => {
    it('matches rows where column equals value', () => {
      const result = applyFilter(rows, { column: 'status', value: 'active' });
      expect(result.map((r) => r.id)).toEqual([1, 3]);
    });

    it('returns no rows when no match', () => {
      const result = applyFilter(rows, { column: 'status', value: 'pending' });
      expect(result).toHaveLength(0);
    });

    it('uses eq as default operator when operator is omitted', () => {
      const result = applyFilter(rows, { column: 'status', value: 'inactive' });
      expect(result.map((r) => r.id)).toEqual([2]);
    });

    it('uses loose equality (string "90" matches number 90)', () => {
      const result = applyFilter(rows, { column: 'score', operator: 'eq', value: '90' });
      expect(result.map((r) => r.id)).toEqual([1]);
    });
  });

  describe('ne operator', () => {
    it('matches rows where column does not equal value', () => {
      const result = applyFilter(rows, { column: 'status', operator: 'ne', value: 'active' });
      expect(result.map((r) => r.id)).toEqual([2]);
    });

    it('returns all rows when nothing matches the excluded value', () => {
      const result = applyFilter(rows, { column: 'status', operator: 'ne', value: 'pending' });
      expect(result).toHaveLength(3);
    });
  });

  describe('lt operator', () => {
    it('matches rows where column < value', () => {
      const result = applyFilter(rows, { column: 'score', operator: 'lt', value: 80 });
      expect(result.map((r) => r.id)).toEqual([2, 3]);
    });

    it('returns no rows when no match', () => {
      const result = applyFilter(rows, { column: 'score', operator: 'lt', value: 50 });
      expect(result).toHaveLength(0);
    });
  });

  describe('lte operator', () => {
    it('matches rows where column <= value', () => {
      const result = applyFilter(rows, { column: 'score', operator: 'lte', value: 75 });
      expect(result.map((r) => r.id)).toEqual([2, 3]);
    });
  });

  describe('gt operator', () => {
    it('matches rows where column > value', () => {
      const result = applyFilter(rows, { column: 'score', operator: 'gt', value: 75 });
      expect(result.map((r) => r.id)).toEqual([1]);
    });
  });

  describe('gte operator', () => {
    it('matches rows where column >= value', () => {
      const result = applyFilter(rows, { column: 'score', operator: 'gte', value: 75 });
      expect(result.map((r) => r.id)).toEqual([1, 3]);
    });
  });

  describe('contains operator', () => {
    it('matches rows where column contains value (case-insensitive)', () => {
      const result = applyFilter(rows, { column: 'name', operator: 'contains', value: 'ali' });
      expect(result.map((r) => r.id)).toEqual([1]);
    });

    it('is case-insensitive', () => {
      const result = applyFilter(rows, { column: 'name', operator: 'contains', value: 'ALICE' });
      expect(result.map((r) => r.id)).toEqual([1]);
    });

    it('returns no rows when no match', () => {
      const result = applyFilter(rows, { column: 'name', operator: 'contains', value: 'xyz' });
      expect(result).toHaveLength(0);
    });
  });

  describe('missing column', () => {
    it('passes through rows when column does not exist in row data', () => {
      const result = applyFilter(rows, { column: 'nonexistent', value: 'foo' });
      expect(result).toHaveLength(3);
    });
  });

  describe('array of conditions (AND logic)', () => {
    it('returns rows matching all conditions', () => {
      const result = applyFilter(rows, [
        { column: 'status', value: 'active' },
        { column: 'score', operator: 'gte', value: 80 },
      ]);
      expect(result.map((r) => r.id)).toEqual([1]);
    });

    it('returns no rows if no row satisfies all conditions', () => {
      const result = applyFilter(rows, [
        { column: 'status', value: 'inactive' },
        { column: 'score', operator: 'gte', value: 80 },
      ]);
      expect(result).toHaveLength(0);
    });

    it('returns all rows when filter array is empty', () => {
      const result = applyFilter(rows, []);
      expect(result).toHaveLength(3);
    });
  });

  describe('date comparison', () => {
    const dateRows = [
      row(1, { date: '2024-01-01' }),
      row(2, { date: '2024-06-15' }),
      row(3, { date: '2024-12-31' }),
    ];

    it('lt works for ISO date strings (lexicographic)', () => {
      const result = applyFilter(dateRows, { column: 'date', operator: 'lt', value: '2024-06-15' });
      expect(result.map((r) => r.id)).toEqual([1]);
    });

    it('gt works for ISO date strings', () => {
      const result = applyFilter(dateRows, { column: 'date', operator: 'gt', value: '2024-06-15' });
      expect(result.map((r) => r.id)).toEqual([3]);
    });
  });

  describe('invalid operator in condition', () => {
    it('treats unknown operator as always-passing', () => {
      // Cast to any to simulate invalid operator coming from untrusted input
      const result = applyFilter(rows, { column: 'status', operator: 'invalid' as never, value: 'active' });
      expect(result).toHaveLength(3);
    });
  });
});

describe('parseFilterParam', () => {
  it('returns null for non-string input', () => {
    expect(parseFilterParam(null)).toBeNull();
    expect(parseFilterParam(undefined)).toBeNull();
    expect(parseFilterParam(123)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseFilterParam('')).toBeNull();
    expect(parseFilterParam('   ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseFilterParam('{invalid}')).toBeNull();
  });

  it('parses a single valid condition object', () => {
    const result = parseFilterParam('{"column":"status","value":"active"}');
    expect(result).toEqual({ column: 'status', value: 'active' });
  });

  it('parses a valid condition with operator', () => {
    const result = parseFilterParam('{"column":"score","operator":"gt","value":50}');
    expect(result).toEqual({ column: 'score', operator: 'gt', value: 50 });
  });

  it('parses a valid array of conditions', () => {
    const raw = JSON.stringify([
      { column: 'status', value: 'active' },
      { column: 'score', operator: 'gte', value: 80 },
    ]);
    const result = parseFilterParam(raw);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('returns null for missing column', () => {
    expect(parseFilterParam('{"value":"active"}')).toBeNull();
  });

  it('returns null for missing value', () => {
    expect(parseFilterParam('{"column":"status"}')).toBeNull();
  });

  it('returns null for value that is an object', () => {
    expect(parseFilterParam('{"column":"status","value":{"nested":true}}')).toBeNull();
  });

  it('returns null for unknown operator', () => {
    expect(parseFilterParam('{"column":"status","operator":"fuzzy","value":"active"}')).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(parseFilterParam('[]')).toBeNull();
  });

  it('filters out invalid conditions from an array and returns remaining valid ones', () => {
    const raw = JSON.stringify([
      { column: 'status', value: 'active' },
      { value: 'missing_column' },
    ]);
    const result = parseFilterParam(raw);
    // Only the first valid condition should remain
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('returns null when all array items are invalid', () => {
    const raw = JSON.stringify([{ value: 'missing_column' }]);
    expect(parseFilterParam(raw)).toBeNull();
  });
});
