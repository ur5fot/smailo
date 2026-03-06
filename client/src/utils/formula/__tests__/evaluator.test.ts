import { describe, it, expect } from 'vitest';
import { parse } from '../parser';
import { evaluate, EvaluatorError } from '../evaluator';
import type { FormulaContext } from '../evaluator';
import { evaluateFormula } from '../index';

function eval_(formula: string, context: FormulaContext = {}): unknown {
  return evaluateFormula(formula, context);
}

describe('evaluate', () => {
  describe('literals', () => {
    it('evaluates number', () => {
      expect(eval_('42')).toBe(42);
    });

    it('evaluates string', () => {
      expect(eval_('"hello"')).toBe('hello');
    });

    it('evaluates boolean', () => {
      expect(eval_('true')).toBe(true);
      expect(eval_('false')).toBe(false);
    });
  });

  describe('identifiers', () => {
    it('resolves from row context', () => {
      expect(eval_('x', { row: { x: 10 } })).toBe(10);
    });

    it('returns null for missing identifier', () => {
      expect(eval_('x', {})).toBe(null);
      expect(eval_('x', { row: { y: 1 } })).toBe(null);
    });
  });

  describe('arithmetic', () => {
    it('adds numbers', () => {
      expect(eval_('2 + 3')).toBe(5);
    });

    it('subtracts numbers', () => {
      expect(eval_('10 - 4')).toBe(6);
    });

    it('multiplies numbers', () => {
      expect(eval_('3 * 7')).toBe(21);
    });

    it('divides numbers', () => {
      expect(eval_('15 / 3')).toBe(5);
    });

    it('modulo', () => {
      expect(eval_('10 % 3')).toBe(1);
    });

    it('division by zero returns null', () => {
      expect(eval_('10 / 0')).toBe(null);
    });

    it('modulo by zero returns null', () => {
      expect(eval_('10 % 0')).toBe(null);
    });

    it('returns null for non-numeric arithmetic', () => {
      expect(eval_('"a" - 1')).toBe(null);
    });
  });

  describe('string concatenation', () => {
    it('concatenates strings with +', () => {
      expect(eval_('"hello" + " world"')).toBe('hello world');
    });

    it('concatenates string + number', () => {
      expect(eval_('"count: " + 5')).toBe('count: 5');
    });

    it('concatenates number + string', () => {
      expect(eval_('5 + " items"')).toBe('5 items');
    });

    it('returns null for non-numeric, non-string +', () => {
      expect(eval_('true + false', { row: {} })).toBe(null);
    });
  });

  describe('comparisons', () => {
    it('== with same values', () => {
      expect(eval_('5 == 5')).toBe(true);
    });

    it('== with different values', () => {
      expect(eval_('5 == 6')).toBe(false);
    });

    it('!= operator', () => {
      expect(eval_('5 != 6')).toBe(true);
      expect(eval_('5 != 5')).toBe(false);
    });

    it('< operator', () => {
      expect(eval_('3 < 5')).toBe(true);
      expect(eval_('5 < 3')).toBe(false);
    });

    it('> operator', () => {
      expect(eval_('5 > 3')).toBe(true);
    });

    it('<= operator', () => {
      expect(eval_('3 <= 3')).toBe(true);
      expect(eval_('4 <= 3')).toBe(false);
    });

    it('>= operator', () => {
      expect(eval_('3 >= 3')).toBe(true);
      expect(eval_('2 >= 3')).toBe(false);
    });

    it('loose equality: number == string', () => {
      expect(eval_('5 == "5"')).toBe(true);
    });

    it('loose equality: null == undefined-like', () => {
      // both sides null (missing identifiers)
      expect(eval_('x == y', {})).toBe(true);
    });

    it('string comparison', () => {
      expect(eval_('"abc" < "def"')).toBe(true);
      expect(eval_('"def" < "abc"')).toBe(false);
    });
  });

  describe('logic', () => {
    it('&& short-circuits on falsy', () => {
      expect(eval_('false && true')).toBe(false);
    });

    it('&& returns right when left is truthy', () => {
      expect(eval_('true && 42')).toBe(42);
    });

    it('|| short-circuits on truthy', () => {
      expect(eval_('true || false')).toBe(true);
    });

    it('|| returns right when left is falsy', () => {
      expect(eval_('false || 42')).toBe(42);
    });

    it('! negates truthy', () => {
      expect(eval_('!true')).toBe(false);
    });

    it('! negates falsy', () => {
      expect(eval_('!false')).toBe(true);
    });
  });

  describe('unary minus', () => {
    it('negates number', () => {
      expect(eval_('-5')).toBe(-5);
    });

    it('negates variable', () => {
      expect(eval_('-x', { row: { x: 3 } })).toBe(-3);
    });

    it('returns null for non-number', () => {
      expect(eval_('-x', { row: { x: 'abc' } })).toBe(null);
    });
  });

  describe('built-in functions', () => {
    it('IF: returns then-branch when truthy', () => {
      expect(eval_('IF(true, "yes", "no")')).toBe('yes');
    });

    it('IF: returns else-branch when falsy', () => {
      expect(eval_('IF(false, "yes", "no")')).toBe('no');
    });

    it('IF: returns null with fewer than 3 args', () => {
      expect(eval_('IF(true, "yes")')).toBe(null);
    });

    it('ABS', () => {
      expect(eval_('ABS(-5)')).toBe(5);
      expect(eval_('ABS(5)')).toBe(5);
    });

    it('ABS: null for non-number', () => {
      expect(eval_('ABS("x")')).toBe(null);
    });

    it('ROUND: default 0 decimals', () => {
      expect(eval_('ROUND(3.7)')).toBe(4);
    });

    it('ROUND: with decimals', () => {
      expect(eval_('ROUND(3.14159, 2)')).toBe(3.14);
    });

    it('ROUND: null for invalid decimals', () => {
      expect(eval_('ROUND(3.14, -1)')).toBe(null);
    });

    it('FLOOR', () => {
      expect(eval_('FLOOR(3.9)')).toBe(3);
    });

    it('CEIL', () => {
      expect(eval_('CEIL(3.1)')).toBe(4);
    });

    it('MIN with two args', () => {
      expect(eval_('MIN(3, 7)')).toBe(3);
    });

    it('MAX with two args', () => {
      expect(eval_('MAX(3, 7)')).toBe(7);
    });

    it('UPPER', () => {
      expect(eval_('UPPER("hello")')).toBe('HELLO');
    });

    it('UPPER: null for non-string', () => {
      expect(eval_('UPPER(5)')).toBe(null);
    });

    it('LOWER', () => {
      expect(eval_('LOWER("HELLO")')).toBe('hello');
    });

    it('CONCAT', () => {
      expect(eval_('CONCAT("a", "b", "c")')).toBe('abc');
    });

    it('CONCAT: handles nulls', () => {
      expect(eval_('CONCAT("x", y)', {})).toBe('x');
    });

    it('LEN', () => {
      expect(eval_('LEN("hello")')).toBe(5);
    });

    it('LEN: null for non-string', () => {
      expect(eval_('LEN(42)')).toBe(null);
    });

    it('TRIM', () => {
      expect(eval_('TRIM("  hi  ")')).toBe('hi');
    });

    it('TRIM: null for non-string', () => {
      expect(eval_('TRIM(5)')).toBe(null);
    });

    it('NOW: returns ISO string', () => {
      const result = eval_('NOW()') as string;
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('case-insensitive function names', () => {
      expect(eval_('abs(-5)')).toBe(5);
      expect(eval_('Abs(-5)')).toBe(5);
    });

    it('unknown function throws', () => {
      expect(() => eval_('NOPE()')).toThrow(EvaluatorError);
      expect(() => eval_('NOPE()')).toThrow('Unknown function: NOPE');
    });

    it('no-arg builtin returns null', () => {
      expect(eval_('ABS()')).toBe(null);
      expect(eval_('LEN()')).toBe(null);
    });
  });

  describe('member access', () => {
    it('accesses nested object in row', () => {
      expect(eval_('obj.x', { row: { obj: { x: 42 } } })).toBe(42);
    });

    it('returns null for non-object member access', () => {
      expect(eval_('obj.x', { row: { obj: 5 } })).toBe(null);
    });

    it('returns null for missing property', () => {
      expect(eval_('obj.missing', { row: { obj: { x: 1 } } })).toBe(null);
    });

    it('blocks __proto__ access', () => {
      expect(eval_('obj.__proto__', { row: { obj: {} } })).toBe(null);
    });

    it('blocks constructor access', () => {
      expect(eval_('obj.constructor', { row: { obj: {} } })).toBe(null);
    });

    it('blocks prototype access', () => {
      expect(eval_('obj.prototype', { row: { obj: {} } })).toBe(null);
    });
  });

  describe('aggregate functions', () => {
    const ctx: FormulaContext = {
      tables: {
        expenses: {
          columns: [{ name: 'amount', type: 'number' }],
          rows: [{ amount: 10 }, { amount: 20 }, { amount: 30 }],
        },
      },
    };

    it('SUM over table column', () => {
      expect(eval_('SUM(expenses.amount)', ctx)).toBe(60);
    });

    it('AVG over table column', () => {
      expect(eval_('AVG(expenses.amount)', ctx)).toBe(20);
    });

    it('COUNT with table name', () => {
      expect(eval_('COUNT(expenses)', ctx)).toBe(3);
    });

    it('COUNT with no args uses currentTable', () => {
      expect(eval_('COUNT()', { currentTable: { columns: [], rows: [{}, {}] } })).toBe(2);
    });

    it('COUNT with no args and no currentTable returns 0', () => {
      expect(eval_('COUNT()')).toBe(0);
    });

    it('MIN over table column (aggregate mode)', () => {
      expect(eval_('MIN(expenses.amount)', ctx)).toBe(10);
    });

    it('MAX over table column (aggregate mode)', () => {
      expect(eval_('MAX(expenses.amount)', ctx)).toBe(30);
    });

    it('SUM returns null for missing table', () => {
      expect(eval_('SUM(missing.col)', ctx)).toBe(null);
    });

    it('SUM returns null for non-numeric values', () => {
      const ctx2: FormulaContext = {
        tables: {
          t: { columns: [{ name: 'x', type: 'text' }], rows: [{ x: 'a' }, { x: 'b' }] },
        },
      };
      expect(eval_('SUM(t.x)', ctx2)).toBe(null);
    });

    it('aggregate with currentTable column', () => {
      const ctx2: FormulaContext = {
        currentTable: {
          columns: [{ name: 'score', type: 'number' }],
          rows: [{ score: 5 }, { score: 15 }],
        },
      };
      expect(eval_('SUM(score)', ctx2)).toBe(20);
    });

    it('COUNT on column with nulls', () => {
      const ctx2: FormulaContext = {
        tables: {
          t: { columns: [{ name: 'x', type: 'number' }], rows: [{ x: 1 }, { x: null }, { x: 3 }] },
        },
      };
      expect(eval_('COUNT(t.x)', ctx2)).toBe(2);
    });
  });

  describe('nested expressions', () => {
    it('evaluates complex nested expression', () => {
      expect(eval_('IF(x > 10, x * 2, x + 1)', { row: { x: 15 } })).toBe(30);
      expect(eval_('IF(x > 10, x * 2, x + 1)', { row: { x: 5 } })).toBe(6);
    });

    it('evaluates chained comparisons with logic', () => {
      expect(eval_('x >= 0 && x <= 100', { row: { x: 50 } })).toBe(true);
      expect(eval_('x >= 0 && x <= 100', { row: { x: -1 } })).toBe(false);
    });
  });

  describe('max depth', () => {
    it('throws on excessive nesting', () => {
      // Build a deeply nested expression: (((((...(1)...))))
      let formula = '1';
      for (let i = 0; i < 25; i++) {
        formula = `(${formula} + 1)`;
      }
      expect(() => eval_(formula)).toThrow(EvaluatorError);
      expect(() => eval_(formula)).toThrow('Maximum expression depth exceeded');
    });
  });

  describe('type coercion', () => {
    it('numeric string in arithmetic converts', () => {
      expect(eval_('x + 1', { row: { x: '5' } })).toBe('51');
    });

    it('boolean to number in arithmetic', () => {
      // true - false = 1 - 0 = 1
      expect(eval_('true - false')).toBe(1);
    });
  });
});
