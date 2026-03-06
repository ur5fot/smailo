import { describe, it, expect } from 'vitest';
import { buildChartDataFromTable } from '../chartData';

const cols = (defs: Array<{ name: string; type: string }>) =>
  defs as Array<{ name: string; type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'formula' }>;

describe('buildChartDataFromTable', () => {
  describe('basic behavior', () => {
    it('uses first non-numeric column as labels and numeric columns as datasets', () => {
      const columns = cols([
        { name: 'month', type: 'text' },
        { name: 'sales', type: 'number' },
        { name: 'profit', type: 'number' },
      ]);
      const rows = [
        { id: 1, data: { month: 'Jan', sales: 100, profit: 20 } },
        { id: 2, data: { month: 'Feb', sales: 150, profit: 35 } },
      ];
      const result = buildChartDataFromTable(columns, rows);
      expect(result).not.toBeNull();
      expect(result!.labels).toEqual(['Jan', 'Feb']);
      expect(result!.datasets).toHaveLength(2);
      expect(result!.datasets[0].label).toBe('sales');
      expect(result!.datasets[0].data).toEqual([100, 150]);
      expect(result!.datasets[1].label).toBe('profit');
      expect(result!.datasets[1].data).toEqual([20, 35]);
    });

    it('falls back to row index when no label column', () => {
      const columns = cols([{ name: 'value', type: 'number' }]);
      const rows = [
        { id: 1, data: { value: 10 } },
        { id: 2, data: { value: 20 } },
      ];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.labels).toEqual(['1', '2']);
    });

    it('treats non-numeric values as 0', () => {
      const columns = cols([
        { name: 'name', type: 'text' },
        { name: 'count', type: 'number' },
      ]);
      const rows = [
        { id: 1, data: { name: 'A', count: 'not a number' } },
        { id: 2, data: { name: 'B', count: 5 } },
      ];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.datasets[0].data).toEqual([0, 5]);
    });
  });

  describe('empty / null cases', () => {
    it('returns null for empty columns', () => {
      expect(buildChartDataFromTable([], [])).toBeNull();
    });

    it('returns null for null columns', () => {
      expect(buildChartDataFromTable(null as any, [])).toBeNull();
    });

    it('returns null when no numeric columns exist', () => {
      const columns = cols([
        { name: 'name', type: 'text' },
        { name: 'date', type: 'date' },
      ]);
      expect(buildChartDataFromTable(columns, [])).toBeNull();
    });

    it('returns empty labels/data for no rows', () => {
      const columns = cols([
        { name: 'label', type: 'text' },
        { name: 'value', type: 'number' },
      ]);
      const result = buildChartDataFromTable(columns, []);
      expect(result!.labels).toEqual([]);
      expect(result!.datasets[0].data).toEqual([]);
    });
  });

  describe('mixed column types', () => {
    it('only uses numeric and formula columns as datasets', () => {
      const columns = cols([
        { name: 'label', type: 'text' },
        { name: 'amount', type: 'number' },
        { name: 'active', type: 'boolean' },
        { name: 'total', type: 'formula' },
        { name: 'category', type: 'select' },
      ]);
      const rows = [
        { id: 1, data: { label: 'X', amount: 10, active: true, total: 15, category: 'A' } },
      ];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.datasets).toHaveLength(2);
      expect(result!.datasets[0].label).toBe('amount');
      expect(result!.datasets[1].label).toBe('total');
    });

    it('uses first non-numeric column for labels even if date/boolean', () => {
      const columns = cols([
        { name: 'active', type: 'boolean' },
        { name: 'val', type: 'number' },
      ]);
      const rows = [{ id: 1, data: { active: true, val: 5 } }];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.labels).toEqual(['true']);
    });
  });

  describe('single column table', () => {
    it('works with a single numeric column', () => {
      const columns = cols([{ name: 'score', type: 'number' }]);
      const rows = [
        { id: 1, data: { score: 90 } },
        { id: 2, data: { score: 85 } },
      ];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.labels).toEqual(['1', '2']);
      expect(result!.datasets).toHaveLength(1);
      expect(result!.datasets[0].data).toEqual([90, 85]);
    });
  });

  describe('pie/doughnut chart type', () => {
    it('creates single dataset with per-segment colors for pie', () => {
      const columns = cols([
        { name: 'category', type: 'text' },
        { name: 'amount', type: 'number' },
        { name: 'extra', type: 'number' },
      ]);
      const rows = [
        { id: 1, data: { category: 'Food', amount: 300, extra: 10 } },
        { id: 2, data: { category: 'Rent', amount: 800, extra: 20 } },
      ];
      const result = buildChartDataFromTable(columns, rows, 'pie');
      expect(result!.datasets).toHaveLength(1);
      expect(result!.datasets[0].label).toBe('amount');
      expect(result!.datasets[0].data).toEqual([300, 800]);
      expect(result!.datasets[0].backgroundColor).toHaveLength(2);
    });

    it('creates single dataset for doughnut', () => {
      const columns = cols([
        { name: 'name', type: 'text' },
        { name: 'val', type: 'number' },
      ]);
      const rows = [{ id: 1, data: { name: 'A', val: 10 } }];
      const result = buildChartDataFromTable(columns, rows, 'doughnut');
      expect(result!.datasets).toHaveLength(1);
    });

    it('creates single dataset for polarArea', () => {
      const columns = cols([
        { name: 'name', type: 'text' },
        { name: 'val', type: 'number' },
      ]);
      const rows = [{ id: 1, data: { name: 'A', val: 10 } }];
      const result = buildChartDataFromTable(columns, rows, 'polarArea');
      expect(result!.datasets).toHaveLength(1);
    });
  });

  describe('dataset styling', () => {
    it('assigns colors from palette', () => {
      const columns = cols([
        { name: 'label', type: 'text' },
        { name: 'a', type: 'number' },
      ]);
      const rows = [{ id: 1, data: { label: 'X', a: 1 } }];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.datasets[0].backgroundColor).toMatch(/^rgba\(/);
      expect(result!.datasets[0].borderColor).toMatch(/^rgba\(/);
      expect(result!.datasets[0].borderWidth).toBe(1);
    });
  });

  describe('label edge cases', () => {
    it('converts null label to empty string', () => {
      const columns = cols([
        { name: 'name', type: 'text' },
        { name: 'val', type: 'number' },
      ]);
      const rows = [{ id: 1, data: { name: null, val: 5 } }];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.labels).toEqual(['']);
    });

    it('converts undefined label to empty string', () => {
      const columns = cols([
        { name: 'name', type: 'text' },
        { name: 'val', type: 'number' },
      ]);
      const rows = [{ id: 1, data: { val: 5 } }];
      const result = buildChartDataFromTable(columns, rows);
      expect(result!.labels).toEqual(['']);
    });
  });
});
