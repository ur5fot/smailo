import { describe, it, expect } from 'vitest';
import { validateUiComponents } from '../services/aiService.js';
import { extractReferencedTableNames, evaluateComputedValues, getGlobalComponents } from '../utils/computedValues.js';
import type { UiComponent, AppConfig } from '../services/aiService.js';

describe('computedValue in validateUiComponents', () => {
  const baseCard = { component: 'Card', props: { title: 'Test' } };

  it('strips "= " prefix and keeps valid formula', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: '= SUM(expenses.amount)' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBe('SUM(expenses.amount)');
  });

  it('strips "=" prefix without space', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: '=SUM(expenses.amount)' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBe('SUM(expenses.amount)');
  });

  it('accepts formula without "=" prefix', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: 'SUM(expenses.amount)' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBe('SUM(expenses.amount)');
  });

  it('drops invalid formula syntax', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: '= +++invalid' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBeUndefined();
  });

  it('drops empty computedValue after stripping prefix', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: '= ' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBeUndefined();
  });

  it('drops non-string computedValue', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: 42 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBeUndefined();
  });

  it('keeps component even if computedValue is dropped', () => {
    const result = validateUiComponents([
      { ...baseCard, dataKey: 'test', computedValue: '= +++bad' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].dataKey).toBe('test');
    expect(result[0].computedValue).toBeUndefined();
  });

  it('preserves computedValue alongside dataKey', () => {
    const result = validateUiComponents([
      { ...baseCard, dataKey: 'fallback', computedValue: '= 1 + 2' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].dataKey).toBe('fallback');
    expect(result[0].computedValue).toBe('1 + 2');
  });

  it('handles complex formula with multiple table references', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: '= MAX(orders.total) - MIN(orders.total)' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBe('MAX(orders.total) - MIN(orders.total)');
  });

  it('handles COUNT without table reference', () => {
    const result = validateUiComponents([
      { ...baseCard, computedValue: '= COUNT(tasks)' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].computedValue).toBe('COUNT(tasks)');
  });
});

describe('extractReferencedTableNames', () => {
  it('extracts table name from table.column pattern', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['expenses']));
  });

  it('extracts multiple table names', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(orders.total)' },
      { component: 'Card', props: {}, computedValue: 'AVG(ratings.score)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['orders', 'ratings']));
  });

  it('deduplicates table names', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
      { component: 'Card', props: {}, computedValue: 'AVG(expenses.amount)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['expenses']));
  });

  it('extracts from COUNT(tableName) pattern', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'COUNT(tasks)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['tasks']));
  });

  it('extracts from both table.column and COUNT(tableName)', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount) + COUNT(tasks)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['expenses', 'tasks']));
  });

  it('skips components without computedValue', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, dataKey: 'test' },
      { component: 'Card', props: {}, computedValue: 'SUM(orders.total)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['orders']));
  });

  it('returns empty set when no computedValues', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, dataKey: 'test' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names.size).toBe(0);
  });

  it('extracts Cyrillic table names from table.column pattern', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(Расходы.amount)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['Расходы']));
  });

  it('extracts Cyrillic table names from COUNT(tableName) pattern', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'COUNT(Задачи)' },
    ];
    const names = extractReferencedTableNames(components);
    expect(names).toEqual(new Set(['Задачи']));
  });
});

describe('evaluateComputedValues', () => {
  const tables = {
    expenses: {
      columns: [
        { name: 'amount', type: 'number' },
        { name: 'category', type: 'text' },
      ],
      rows: [
        { amount: 100, category: 'food' },
        { amount: 200, category: 'transport' },
        { amount: 50, category: 'food' },
      ],
    },
    tasks: {
      columns: [
        { name: 'title', type: 'text' },
        { name: 'done', type: 'boolean' },
      ],
      rows: [
        { title: 'Task 1', done: true },
        { title: 'Task 2', done: false },
        { title: 'Task 3', done: true },
      ],
    },
  };

  it('evaluates SUM aggregate', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: 350 });
  });

  it('evaluates AVG aggregate', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'AVG(expenses.amount)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result[0]).toBeCloseTo(116.67, 1);
  });

  it('evaluates COUNT aggregate', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'COUNT(tasks)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: 3 });
  });

  it('evaluates MIN and MAX', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'MIN(expenses.amount)' },
      { component: 'Card', props: {}, computedValue: 'MAX(expenses.amount)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: 50, 1: 200 });
  });

  it('evaluates arithmetic with aggregates', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'MAX(expenses.amount) - MIN(expenses.amount)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: 150 });
  });

  it('uses correct index for non-contiguous computedValue components', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, dataKey: 'test' },
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
      { component: 'Card', props: {}, dataKey: 'other' },
      { component: 'Card', props: {}, computedValue: 'COUNT(tasks)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 1: 350, 3: 3 });
  });

  it('returns null for formula referencing missing table', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(nonexistent.amount)' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: null });
  });

  it('returns null for invalid formula', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
    ];
    // Override computedValue to something broken after validation
    (components[0] as Record<string, unknown>).computedValue = '+++';
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: null });
  });

  it('returns empty object when no components have computedValue', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, dataKey: 'test' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({});
  });

  it('evaluates literal expressions without table context', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: '1 + 2 + 3' },
    ];
    const result = evaluateComputedValues(components, {});
    expect(result).toEqual({ 0: 6 });
  });

  it('evaluates IF with aggregate', () => {
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'IF(SUM(expenses.amount) > 300, "over budget", "ok")' },
    ];
    const result = evaluateComputedValues(components, tables);
    expect(result).toEqual({ 0: 'over budget' });
  });

  it('handles empty table', () => {
    const emptyTables = {
      expenses: {
        columns: [{ name: 'amount', type: 'number' }],
        rows: [],
      },
    };
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(expenses.amount)' },
      { component: 'Card', props: {}, computedValue: 'COUNT(expenses)' },
    ];
    const result = evaluateComputedValues(components, emptyTables);
    expect(result[0]).toBeNull();
    expect(result[1]).toBe(0);
  });

  it('evaluates formulas with Cyrillic table names', () => {
    const cyrillicTables = {
      'Расходы': {
        columns: [{ name: 'сумма', type: 'number' }],
        rows: [{ сумма: 100 }, { сумма: 200 }, { сумма: 150 }],
      },
    };
    const components: UiComponent[] = [
      { component: 'Card', props: {}, computedValue: 'SUM(Расходы.сумма)' },
      { component: 'Card', props: {}, computedValue: 'COUNT(Расходы)' },
    ];
    const result = evaluateComputedValues(components, cyrillicTables);
    expect(result[0]).toBe(450);
    expect(result[1]).toBe(3);
  });
});

describe('getGlobalComponents', () => {
  const cardA: UiComponent = { component: 'Card', props: { title: 'A' }, dataKey: 'a' };
  const cardB: UiComponent = { component: 'Card', props: { title: 'B' }, dataKey: 'b' };
  const cardC: UiComponent = { component: 'Card', props: { title: 'C' }, dataKey: 'c' };

  it('returns uiComponents for single-page app (no pages field)', () => {
    const config: AppConfig = {
      appName: 'Test',
      description: 'Test app',
      cronJobs: [],
      uiComponents: [cardA, cardB],
    };
    expect(getGlobalComponents(config)).toEqual([cardA, cardB]);
  });

  it('returns uiComponents when pages is empty array', () => {
    const config: AppConfig = {
      appName: 'Test',
      description: 'Test app',
      cronJobs: [],
      uiComponents: [cardA],
      pages: [],
    };
    expect(getGlobalComponents(config)).toEqual([cardA]);
  });

  it('returns flatMap of all pages uiComponents for multi-page app', () => {
    const config: AppConfig = {
      appName: 'Test',
      description: 'Test app',
      cronJobs: [],
      uiComponents: [],
      pages: [
        { id: 'main', title: 'Main', uiComponents: [cardA, cardB] },
        { id: 'reports', title: 'Reports', uiComponents: [cardC] },
      ],
    };
    const result = getGlobalComponents(config);
    expect(result).toEqual([cardA, cardB, cardC]);
    expect(result).toHaveLength(3);
  });

  it('preserves component order across pages', () => {
    const config: AppConfig = {
      appName: 'Test',
      description: 'Test app',
      cronJobs: [],
      uiComponents: [],
      pages: [
        { id: 'p1', title: 'Page 1', uiComponents: [cardC, cardA] },
        { id: 'p2', title: 'Page 2', uiComponents: [cardB] },
      ],
    };
    const result = getGlobalComponents(config);
    expect(result[0]).toBe(cardC);
    expect(result[1]).toBe(cardA);
    expect(result[2]).toBe(cardB);
  });

  it('handles page with empty uiComponents', () => {
    const config: AppConfig = {
      appName: 'Test',
      description: 'Test app',
      cronJobs: [],
      uiComponents: [],
      pages: [
        { id: 'p1', title: 'Page 1', uiComponents: [] },
        { id: 'p2', title: 'Page 2', uiComponents: [cardA] },
      ],
    };
    const result = getGlobalComponents(config);
    expect(result).toEqual([cardA]);
  });

  it('global indices align correctly for computedValues evaluation', () => {
    const compA: UiComponent = { component: 'Card', props: {}, computedValue: '1 + 1' };
    const compB: UiComponent = { component: 'Card', props: {}, dataKey: 'x' };
    const compC: UiComponent = { component: 'Card', props: {}, computedValue: '2 + 2' };
    const config: AppConfig = {
      appName: 'Test',
      description: 'Test app',
      cronJobs: [],
      uiComponents: [],
      pages: [
        { id: 'p1', title: 'Page 1', uiComponents: [compA, compB] },
        { id: 'p2', title: 'Page 2', uiComponents: [compC] },
      ],
    };
    const allComponents = getGlobalComponents(config);
    const result = evaluateComputedValues(allComponents, {});
    // compA is at global index 0, compC is at global index 2
    expect(result).toEqual({ 0: 2, 2: 4 });
  });
});
