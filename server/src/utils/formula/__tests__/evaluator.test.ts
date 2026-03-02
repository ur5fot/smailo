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
