import { describe, it, expect } from 'vitest'
import { evaluate, EvaluatorError } from '../evaluator.js'
import { parse } from '../parser.js'
import { evaluateFormula } from '../index.js'

function eval_(formula: string, context: Parameters<typeof evaluate>[1] = {}) {
  const ast = parse(formula)
  return evaluate(ast, context)
}

describe('evaluate', () => {
  describe('literals', () => {
    it('evaluates number literals', () => {
      expect(eval_('42')).toBe(42)
      expect(eval_('3.14')).toBe(3.14)
      expect(eval_('0')).toBe(0)
    })

    it('evaluates string literals', () => {
      expect(eval_('"hello"')).toBe('hello')
      expect(eval_('""')).toBe('')
    })

    it('evaluates boolean literals', () => {
      expect(eval_('true')).toBe(true)
      expect(eval_('false')).toBe(false)
    })
  })

  describe('arithmetic', () => {
    it('adds numbers', () => {
      expect(eval_('2 + 3')).toBe(5)
      expect(eval_('10 + 0.5')).toBe(10.5)
    })

    it('subtracts numbers', () => {
      expect(eval_('10 - 3')).toBe(7)
      expect(eval_('1 - 5')).toBe(-4)
    })

    it('multiplies numbers', () => {
      expect(eval_('4 * 5')).toBe(20)
      expect(eval_('2.5 * 4')).toBe(10)
    })

    it('divides numbers', () => {
      expect(eval_('10 / 2')).toBe(5)
      expect(eval_('7 / 2')).toBe(3.5)
    })

    it('returns null for division by zero', () => {
      expect(eval_('10 / 0')).toBe(null)
      expect(eval_('0 / 0')).toBe(null)
    })

    it('computes modulo', () => {
      expect(eval_('10 % 3')).toBe(1)
      expect(eval_('7 % 2')).toBe(1)
    })

    it('returns null for modulo by zero', () => {
      expect(eval_('10 % 0')).toBe(null)
    })

    it('respects operator precedence', () => {
      expect(eval_('2 + 3 * 4')).toBe(14)
      expect(eval_('(2 + 3) * 4')).toBe(20)
      expect(eval_('10 - 2 * 3 + 1')).toBe(5)
    })

    it('handles nested arithmetic', () => {
      expect(eval_('(1 + 2) * (3 + 4)')).toBe(21)
      expect(eval_('((10 - 5) * 2) / 5')).toBe(2)
    })

    it('returns null for non-numeric arithmetic', () => {
      expect(eval_('"abc" - 1')).toBe(null)
      expect(eval_('true * false')).toBe(0) // booleans coerce: 1 * 0
    })
  })

  describe('string concatenation', () => {
    it('concatenates strings with +', () => {
      expect(eval_('"hello" + " " + "world"')).toBe('hello world')
    })

    it('concatenates string with number', () => {
      expect(eval_('"count: " + 42')).toBe('count: 42')
      expect(eval_('100 + " items"')).toBe('100 items')
    })

    it('concatenates string with null', () => {
      expect(eval_('"value: " + unknown_var')).toBe('value: ')
    })
  })

  describe('comparisons', () => {
    it('compares numbers with ==', () => {
      expect(eval_('1 == 1')).toBe(true)
      expect(eval_('1 == 2')).toBe(false)
    })

    it('compares numbers with !=', () => {
      expect(eval_('1 != 2')).toBe(true)
      expect(eval_('1 != 1')).toBe(false)
    })

    it('compares numbers with < > <= >=', () => {
      expect(eval_('1 < 2')).toBe(true)
      expect(eval_('2 < 1')).toBe(false)
      expect(eval_('2 > 1')).toBe(true)
      expect(eval_('1 > 2')).toBe(false)
      expect(eval_('1 <= 1')).toBe(true)
      expect(eval_('1 <= 2')).toBe(true)
      expect(eval_('2 <= 1')).toBe(false)
      expect(eval_('1 >= 1')).toBe(true)
      expect(eval_('2 >= 1')).toBe(true)
      expect(eval_('1 >= 2')).toBe(false)
    })

    it('compares strings', () => {
      expect(eval_('"abc" == "abc"')).toBe(true)
      expect(eval_('"abc" != "def"')).toBe(true)
      expect(eval_('"abc" < "def"')).toBe(true)
      expect(eval_('"def" > "abc"')).toBe(true)
    })

    it('compares with type coercion (number/string)', () => {
      expect(eval_('1 == "1"')).toBe(true)
      expect(eval_('0 == "0"')).toBe(true)
      expect(eval_('"42" == 42')).toBe(true)
      expect(eval_('"abc" == 1')).toBe(false)
    })

    it('null equality', () => {
      expect(eval_('unknown_x == unknown_y')).toBe(true) // both null
    })

    it('returns null for incomparable types', () => {
      expect(eval_('"abc" < 5')).toBe(null) // "abc" can't coerce to number
    })
  })

  describe('logic', () => {
    it('evaluates && with short-circuit', () => {
      expect(eval_('true && true')).toBe(true)
      expect(eval_('true && false')).toBe(false)
      expect(eval_('false && true')).toBe(false)
      expect(eval_('1 && 2')).toBe(2) // returns right value
      expect(eval_('0 && 2')).toBe(0) // short-circuit returns left value
    })

    it('evaluates || with short-circuit', () => {
      expect(eval_('true || false')).toBe(true)
      expect(eval_('false || true')).toBe(true)
      expect(eval_('false || false')).toBe(false)
      expect(eval_('0 || 5')).toBe(5) // returns right value
      expect(eval_('3 || 5')).toBe(3) // short-circuit returns left value
    })

    it('evaluates ! (not)', () => {
      expect(eval_('!true')).toBe(false)
      expect(eval_('!false')).toBe(true)
      expect(eval_('!0')).toBe(true)
      expect(eval_('!1')).toBe(false)
      expect(eval_('!""')).toBe(true)
      expect(eval_('!"abc"')).toBe(false)
    })

    it('combined logic and comparisons', () => {
      expect(eval_('1 < 2 && 3 > 1')).toBe(true)
      expect(eval_('1 > 2 || 3 > 1')).toBe(true)
      expect(eval_('!(1 > 2)')).toBe(true)
    })
  })

  describe('unary operators', () => {
    it('negates numbers', () => {
      expect(eval_('-5')).toBe(-5)
      expect(eval_('-3.14')).toBe(-3.14)
      expect(eval_('--5')).toBe(5) // double negate
    })

    it('returns null for negate on non-number', () => {
      expect(eval_('-"hello"')).toBe(null)
    })
  })

  describe('identifiers (variable resolution)', () => {
    it('resolves from row context', () => {
      expect(eval_('price', { row: { price: 100 } })).toBe(100)
      expect(eval_('name', { row: { name: 'Test' } })).toBe('Test')
      expect(eval_('active', { row: { active: true } })).toBe(true)
    })

    it('returns null for unknown identifiers', () => {
      expect(eval_('unknown')).toBe(null)
      expect(eval_('missing', { row: { other: 1 } })).toBe(null)
    })

    it('uses variables in expressions', () => {
      const ctx = { row: { price: 10, quantity: 5 } }
      expect(eval_('price * quantity', ctx)).toBe(50)
      expect(eval_('price + quantity', ctx)).toBe(15)
    })
  })

  describe('member access', () => {
    it('accesses nested row properties', () => {
      const ctx = { row: { address: { city: 'Moscow' } } }
      expect(eval_('address.city', ctx)).toBe('Moscow')
    })

    it('returns null for missing property', () => {
      const ctx = { row: { address: { city: 'Moscow' } } }
      expect(eval_('address.zip', ctx)).toBe(null)
    })

    it('returns null for null base object', () => {
      expect(eval_('unknown.prop')).toBe(null)
    })

    it('returns null for non-object base', () => {
      const ctx = { row: { count: 42 } }
      expect(eval_('count.something', ctx)).toBe(null)
    })
  })

  describe('complex expressions', () => {
    it('computes price * quantity with discount', () => {
      const ctx = { row: { price: 100, quantity: 3, discount: 0.1 } }
      expect(eval_('price * quantity * (1 - discount)', ctx)).toBe(270)
    })

    it('comparison with variable', () => {
      const ctx = { row: { status: 'active' } }
      expect(eval_('status == "active"', ctx)).toBe(true)
      expect(eval_('status != "inactive"', ctx)).toBe(true)
    })

    it('boolean logic with variables', () => {
      const ctx = { row: { a: true, b: false } }
      expect(eval_('a && !b', ctx)).toBe(true)
      expect(eval_('a || b', ctx)).toBe(true)
      expect(eval_('!a || b', ctx)).toBe(false)
    })
  })

  describe('depth limit', () => {
    it('throws on deeply nested expressions', () => {
      // Build deeply nested expression: (((((...1...)))))
      let formula = '1'
      for (let i = 0; i < 25; i++) {
        formula = `(${formula} + 1)`
      }
      expect(() => eval_(formula)).toThrow(EvaluatorError)
      expect(() => eval_(formula)).toThrow('Maximum expression depth exceeded')
    })

    it('allows reasonable nesting', () => {
      // 10 levels deep should be fine
      let formula = '1'
      for (let i = 0; i < 10; i++) {
        formula = `(${formula} + 1)`
      }
      expect(eval_(formula)).toBe(11)
    })
  })

  describe('function calls', () => {
    it('throws for unknown functions', () => {
      expect(() => eval_('UNKNOWN(1)')).toThrow(EvaluatorError)
      expect(() => eval_('UNKNOWN(1)')).toThrow('Unknown function: UNKNOWN')
    })

    it('function names are case-insensitive', () => {
      expect(eval_('ABS(-5)')).toBe(5)
      expect(eval_('abs(-5)')).toBe(5)
      expect(eval_('Abs(-5)')).toBe(5)
    })
  })

  describe('IF function', () => {
    it('returns thenValue when condition is true', () => {
      expect(eval_('IF(true, 1, 2)')).toBe(1)
      expect(eval_('IF(1, "yes", "no")')).toBe('yes')
    })

    it('returns elseValue when condition is false', () => {
      expect(eval_('IF(false, 1, 2)')).toBe(2)
      expect(eval_('IF(0, "yes", "no")')).toBe('no')
    })

    it('evaluates condition expressions', () => {
      const ctx = { row: { status: 'active', amount: 100 } }
      expect(eval_('IF(status == "active", amount, 0)', ctx)).toBe(100)
      expect(eval_('IF(status == "inactive", amount, 0)', ctx)).toBe(0)
    })

    it('is lazy — only evaluates selected branch', () => {
      // If both branches were evaluated, the division by zero would cause issues
      // but since IF is lazy, only the "then" branch runs
      expect(eval_('IF(true, 42, 1 / 0)')).toBe(42)
      expect(eval_('IF(false, 1 / 0, 42)')).toBe(42)
    })

    it('returns null with too few arguments', () => {
      expect(eval_('IF(true, 1)')).toBe(null)
      expect(eval_('IF(true)')).toBe(null)
    })

    it('works nested', () => {
      expect(eval_('IF(true, IF(false, 1, 2), 3)')).toBe(2)
    })
  })

  describe('math functions', () => {
    it('ABS returns absolute value', () => {
      expect(eval_('ABS(-5)')).toBe(5)
      expect(eval_('ABS(5)')).toBe(5)
      expect(eval_('ABS(0)')).toBe(0)
      expect(eval_('ABS(-3.14)')).toBe(3.14)
    })

    it('ABS returns null for non-number', () => {
      expect(eval_('ABS("hello")')).toBe(null)
    })

    it('ROUND rounds to given decimals', () => {
      expect(eval_('ROUND(3.14159, 2)')).toBe(3.14)
      expect(eval_('ROUND(3.14159, 0)')).toBe(3)
      expect(eval_('ROUND(3.5)')).toBe(4) // default 0 decimals
      expect(eval_('ROUND(2.5)')).toBe(3)
    })

    it('ROUND returns null for non-number', () => {
      expect(eval_('ROUND("hello")')).toBe(null)
      expect(eval_('ROUND(3.14, "x")')).toBe(null)
    })

    it('FLOOR returns floor value', () => {
      expect(eval_('FLOOR(3.7)')).toBe(3)
      expect(eval_('FLOOR(3.2)')).toBe(3)
      expect(eval_('FLOOR(-3.2)')).toBe(-4)
      expect(eval_('FLOOR(5)')).toBe(5)
    })

    it('FLOOR returns null for non-number', () => {
      expect(eval_('FLOOR("hello")')).toBe(null)
    })

    it('CEIL returns ceiling value', () => {
      expect(eval_('CEIL(3.2)')).toBe(4)
      expect(eval_('CEIL(3.7)')).toBe(4)
      expect(eval_('CEIL(-3.7)')).toBe(-3)
      expect(eval_('CEIL(5)')).toBe(5)
    })

    it('CEIL returns null for non-number', () => {
      expect(eval_('CEIL("hello")')).toBe(null)
    })

    it('MIN returns smaller of two numbers', () => {
      expect(eval_('MIN(3, 5)')).toBe(3)
      expect(eval_('MIN(5, 3)')).toBe(3)
      expect(eval_('MIN(-1, 1)')).toBe(-1)
    })

    it('MIN returns null for non-numbers', () => {
      expect(eval_('MIN("a", 5)')).toBe(null)
      expect(eval_('MIN(3, "b")')).toBe(null)
    })

    it('MAX returns larger of two numbers', () => {
      expect(eval_('MAX(3, 5)')).toBe(5)
      expect(eval_('MAX(5, 3)')).toBe(5)
      expect(eval_('MAX(-1, 1)')).toBe(1)
    })

    it('MAX returns null for non-numbers', () => {
      expect(eval_('MAX("a", 5)')).toBe(null)
      expect(eval_('MAX(3, "b")')).toBe(null)
    })

    it('math functions with no arguments return null', () => {
      expect(eval_('ABS()')).toBe(null)
      expect(eval_('ROUND()')).toBe(null)
      expect(eval_('FLOOR()')).toBe(null)
      expect(eval_('CEIL()')).toBe(null)
      expect(eval_('MIN(1)')).toBe(null)
      expect(eval_('MAX(1)')).toBe(null)
    })
  })

  describe('string functions', () => {
    it('UPPER converts string to uppercase', () => {
      expect(eval_('UPPER("hello")')).toBe('HELLO')
      expect(eval_('UPPER("Hello World")')).toBe('HELLO WORLD')
    })

    it('UPPER returns null for non-string', () => {
      expect(eval_('UPPER(42)')).toBe(null)
      expect(eval_('UPPER(true)')).toBe(null)
    })

    it('LOWER converts string to lowercase', () => {
      expect(eval_('LOWER("HELLO")')).toBe('hello')
      expect(eval_('LOWER("Hello World")')).toBe('hello world')
    })

    it('LOWER returns null for non-string', () => {
      expect(eval_('LOWER(42)')).toBe(null)
    })

    it('CONCAT joins multiple arguments', () => {
      expect(eval_('CONCAT("hello", " ", "world")')).toBe('hello world')
      expect(eval_('CONCAT("a", "b", "c")')).toBe('abc')
    })

    it('CONCAT converts non-strings', () => {
      expect(eval_('CONCAT("count: ", 42)')).toBe('count: 42')
      expect(eval_('CONCAT("active: ", true)')).toBe('active: true')
    })

    it('CONCAT with no args returns empty string', () => {
      expect(eval_('CONCAT()')).toBe('')
    })

    it('CONCAT handles null values', () => {
      expect(eval_('CONCAT("value: ", unknown_var)')).toBe('value: ')
    })

    it('LEN returns string length', () => {
      expect(eval_('LEN("hello")')).toBe(5)
      expect(eval_('LEN("")')).toBe(0)
      expect(eval_('LEN("abc")')).toBe(3)
    })

    it('LEN returns null for non-string', () => {
      expect(eval_('LEN(42)')).toBe(null)
      expect(eval_('LEN(true)')).toBe(null)
    })

    it('TRIM removes whitespace', () => {
      expect(eval_('TRIM("  hello  ")')).toBe('hello')
      expect(eval_('TRIM("hello")')).toBe('hello')
      expect(eval_('TRIM("  ")')).toBe('')
    })

    it('TRIM returns null for non-string', () => {
      expect(eval_('TRIM(42)')).toBe(null)
    })

    it('string functions with no arguments return null', () => {
      expect(eval_('UPPER()')).toBe(null)
      expect(eval_('LOWER()')).toBe(null)
      expect(eval_('LEN()')).toBe(null)
      expect(eval_('TRIM()')).toBe(null)
    })
  })

  describe('NOW function', () => {
    it('returns an ISO 8601 string', () => {
      const result = eval_('NOW()')
      expect(typeof result).toBe('string')
      // Should be parseable as a date
      expect(new Date(result as string).toISOString()).toBe(result)
    })

    it('returns a recent timestamp', () => {
      const before = Date.now()
      const result = eval_('NOW()') as string
      const after = Date.now()
      const ts = new Date(result).getTime()
      expect(ts).toBeGreaterThanOrEqual(before)
      expect(ts).toBeLessThanOrEqual(after)
    })
  })

  describe('functions in expressions', () => {
    it('function result used in arithmetic', () => {
      expect(eval_('ABS(-5) + 10')).toBe(15)
      expect(eval_('ROUND(3.7) * 2')).toBe(8)
    })

    it('function result used in comparisons', () => {
      expect(eval_('LEN("hello") == 5')).toBe(true)
      expect(eval_('ABS(-3) > 2')).toBe(true)
    })

    it('nested function calls', () => {
      expect(eval_('ROUND(ABS(-3.14), 1)')).toBe(3.1)
      expect(eval_('UPPER(CONCAT("hello", " ", "world"))')).toBe('HELLO WORLD')
      expect(eval_('LEN(TRIM("  hi  "))')).toBe(2)
    })

    it('functions with variable arguments', () => {
      const ctx = { row: { price: -15.7, name: '  Alice  ' } }
      expect(eval_('ABS(price)', ctx)).toBe(15.7)
      expect(eval_('TRIM(name)', ctx)).toBe('Alice')
      expect(eval_('IF(price < 0, ABS(price), price)', ctx)).toBe(15.7)
    })
  })

  describe('aggregate functions', () => {
    const tablesCtx = {
      tables: {
        expenses: {
          columns: [
            { name: 'description', type: 'text' },
            { name: 'amount', type: 'number' },
          ],
          rows: [
            { description: 'Food', amount: 100 },
            { description: 'Transport', amount: 50 },
            { description: 'Rent', amount: 300 },
            { description: 'Entertainment', amount: 75 },
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
        empty: {
          columns: [{ name: 'value', type: 'number' }],
          rows: [],
        },
      },
    }

    const currentTableCtx = {
      currentTable: {
        columns: [
          { name: 'name', type: 'text' },
          { name: 'score', type: 'number' },
        ],
        rows: [
          { name: 'Alice', score: 90 },
          { name: 'Bob', score: 80 },
          { name: 'Charlie', score: 70 },
        ],
      },
    }

    describe('SUM', () => {
      it('sums a column via table.column (MemberAccess)', () => {
        expect(eval_('SUM(expenses.amount)', tablesCtx)).toBe(525)
      })

      it('sums a column in current table (Identifier)', () => {
        expect(eval_('SUM(score)', currentTableCtx)).toBe(240)
      })

      it('returns null for empty table', () => {
        expect(eval_('SUM(empty.value)', tablesCtx)).toBe(null)
      })

      it('returns null for non-existent table', () => {
        expect(eval_('SUM(unknown.amount)', tablesCtx)).toBe(null)
      })

      it('skips non-numeric values', () => {
        const ctx = {
          tables: {
            mixed: {
              columns: [{ name: 'val', type: 'text' }],
              rows: [
                { val: 10 },
                { val: 'abc' },
                { val: 20 },
                { val: null },
                { val: 30 },
              ],
            },
          },
        }
        expect(eval_('SUM(mixed.val)', ctx)).toBe(60)
      })

      it('returns null when no numeric values found', () => {
        const ctx = {
          tables: {
            strings: {
              columns: [{ name: 'val', type: 'text' }],
              rows: [{ val: 'a' }, { val: 'b' }],
            },
          },
        }
        expect(eval_('SUM(strings.val)', ctx)).toBe(null)
      })

      it('returns null with no context', () => {
        expect(eval_('SUM(amount)')).toBe(null)
      })
    })

    describe('AVG', () => {
      it('averages a column via table.column', () => {
        expect(eval_('AVG(expenses.amount)', tablesCtx)).toBe(131.25)
      })

      it('averages a column in current table', () => {
        expect(eval_('AVG(score)', currentTableCtx)).toBe(80)
      })

      it('returns null for empty table', () => {
        expect(eval_('AVG(empty.value)', tablesCtx)).toBe(null)
      })

      it('skips non-numeric values in average', () => {
        const ctx = {
          tables: {
            mixed: {
              columns: [{ name: 'val', type: 'text' }],
              rows: [
                { val: 10 },
                { val: 'abc' },
                { val: 30 },
              ],
            },
          },
        }
        // Average of [10, 30] = 20
        expect(eval_('AVG(mixed.val)', ctx)).toBe(20)
      })
    })

    describe('COUNT', () => {
      it('counts rows in a table (Identifier = table name)', () => {
        expect(eval_('COUNT(tasks)', tablesCtx)).toBe(3)
        expect(eval_('COUNT(expenses)', tablesCtx)).toBe(4)
      })

      it('counts non-null values in a column via table.column', () => {
        const ctx = {
          tables: {
            data: {
              columns: [{ name: 'val', type: 'number' }],
              rows: [
                { val: 1 },
                { val: null },
                { val: 3 },
                { val: undefined },
                { val: 0 },
              ],
            },
          },
        }
        expect(eval_('COUNT(data.val)', ctx)).toBe(3) // 1, 3, 0 — null and undefined excluded
      })

      it('returns 0 for empty table', () => {
        expect(eval_('COUNT(empty)', tablesCtx)).toBe(0)
      })

      it('returns 0 for non-existent table', () => {
        expect(eval_('COUNT(unknown)', tablesCtx)).toBe(0)
      })

      it('counts rows in current table with no args', () => {
        expect(eval_('COUNT()', currentTableCtx)).toBe(3)
      })

      it('returns 0 for COUNT() with no current table', () => {
        expect(eval_('COUNT()')).toBe(0)
      })

      it('counts non-null column values in current table', () => {
        const ctx = {
          currentTable: {
            columns: [{ name: 'val', type: 'number' }],
            rows: [
              { val: 1 },
              { val: null },
              { val: 3 },
            ],
          },
        }
        expect(eval_('COUNT(val)', ctx)).toBe(2)
      })
    })

    describe('MIN (aggregate)', () => {
      it('finds minimum in a column via table.column', () => {
        expect(eval_('MIN(expenses.amount)', tablesCtx)).toBe(50)
      })

      it('finds minimum in current table column', () => {
        expect(eval_('MIN(score)', currentTableCtx)).toBe(70)
      })

      it('returns null for empty table', () => {
        expect(eval_('MIN(empty.value)', tablesCtx)).toBe(null)
      })

      it('still works as scalar with 2 args', () => {
        expect(eval_('MIN(3, 5)')).toBe(3)
        expect(eval_('MIN(10, 2)')).toBe(2)
      })
    })

    describe('MAX (aggregate)', () => {
      it('finds maximum in a column via table.column', () => {
        expect(eval_('MAX(expenses.amount)', tablesCtx)).toBe(300)
      })

      it('finds maximum in current table column', () => {
        expect(eval_('MAX(score)', currentTableCtx)).toBe(90)
      })

      it('returns null for empty table', () => {
        expect(eval_('MAX(empty.value)', tablesCtx)).toBe(null)
      })

      it('still works as scalar with 2 args', () => {
        expect(eval_('MAX(3, 5)')).toBe(5)
        expect(eval_('MAX(1, 10)')).toBe(10)
      })
    })

    describe('aggregates in expressions', () => {
      it('SUM in arithmetic', () => {
        expect(eval_('SUM(expenses.amount) * 2', tablesCtx)).toBe(1050)
      })

      it('AVG in comparison', () => {
        expect(eval_('AVG(expenses.amount) > 100', tablesCtx)).toBe(true)
      })

      it('COUNT in IF', () => {
        expect(eval_('IF(COUNT(tasks) > 2, "many", "few")', tablesCtx)).toBe('many')
      })

      it('MAX - MIN range', () => {
        expect(eval_('MAX(expenses.amount) - MIN(expenses.amount)', tablesCtx)).toBe(250)
      })

      it('combined with row context', () => {
        const ctx = {
          row: { multiplier: 2 },
          tables: tablesCtx.tables,
        }
        expect(eval_('SUM(expenses.amount) * multiplier', ctx)).toBe(1050)
      })
    })
  })
})

describe('evaluateFormula', () => {
  it('provides end-to-end evaluation', () => {
    expect(evaluateFormula('2 + 3')).toBe(5)
    expect(evaluateFormula('"hello" + " world"')).toBe('hello world')
  })

  it('works with context', () => {
    expect(evaluateFormula('price * quantity', { row: { price: 10, quantity: 3 } })).toBe(30)
  })

  it('defaults to empty context', () => {
    expect(evaluateFormula('42')).toBe(42)
  })

  it('propagates parse errors', () => {
    expect(() => evaluateFormula('+')).toThrow()
  })

  it('propagates tokenizer errors', () => {
    expect(() => evaluateFormula('$$$')).toThrow()
  })
})
