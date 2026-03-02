import { describe, it, expect } from 'vitest'
import { tokenize, TokenizerError } from '../tokenizer.js'

describe('tokenize', () => {
  describe('numbers', () => {
    it('tokenizes integers', () => {
      const tokens = tokenize('42')
      expect(tokens).toEqual([{ type: 'Number', value: '42', position: 0 }])
    })

    it('tokenizes decimals', () => {
      const tokens = tokenize('3.14')
      expect(tokens).toEqual([{ type: 'Number', value: '3.14', position: 0 }])
    })

    it('tokenizes zero', () => {
      const tokens = tokenize('0')
      expect(tokens).toEqual([{ type: 'Number', value: '0', position: 0 }])
    })
  })

  describe('strings', () => {
    it('tokenizes double-quoted strings', () => {
      const tokens = tokenize('"hello"')
      expect(tokens).toEqual([{ type: 'String', value: 'hello', position: 0 }])
    })

    it('tokenizes empty strings', () => {
      const tokens = tokenize('""')
      expect(tokens).toEqual([{ type: 'String', value: '', position: 0 }])
    })

    it('handles escape sequences', () => {
      const tokens = tokenize('"a\\nb\\tc\\\\"')
      expect(tokens).toEqual([{ type: 'String', value: 'a\nb\tc\\', position: 0 }])
    })

    it('handles escaped quotes', () => {
      const tokens = tokenize('"say \\"hi\\""')
      expect(tokens).toEqual([{ type: 'String', value: 'say "hi"', position: 0 }])
    })

    it('throws on unterminated string', () => {
      expect(() => tokenize('"hello')).toThrow(TokenizerError)
      expect(() => tokenize('"hello')).toThrow('Unterminated string literal')
    })

    it('throws on unterminated escape at end', () => {
      expect(() => tokenize('"hello\\')).toThrow(TokenizerError)
    })
  })

  describe('booleans', () => {
    it('tokenizes true', () => {
      const tokens = tokenize('true')
      expect(tokens).toEqual([{ type: 'Boolean', value: 'true', position: 0 }])
    })

    it('tokenizes false', () => {
      const tokens = tokenize('false')
      expect(tokens).toEqual([{ type: 'Boolean', value: 'false', position: 0 }])
    })
  })

  describe('identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const tokens = tokenize('price')
      expect(tokens).toEqual([{ type: 'Identifier', value: 'price', position: 0 }])
    })

    it('tokenizes identifiers with underscores and digits', () => {
      const tokens = tokenize('total_amount2')
      expect(tokens).toEqual([{ type: 'Identifier', value: 'total_amount2', position: 0 }])
    })

    it('tokenizes identifiers starting with underscore', () => {
      const tokens = tokenize('_foo')
      expect(tokens).toEqual([{ type: 'Identifier', value: '_foo', position: 0 }])
    })
  })

  describe('operators', () => {
    it('tokenizes arithmetic operators', () => {
      const tokens = tokenize('+ - * / %')
      expect(tokens.map(t => t.value)).toEqual(['+', '-', '*', '/', '%'])
      expect(tokens.every(t => t.type === 'Operator')).toBe(true)
    })

    it('tokenizes comparison operators', () => {
      const tokens = tokenize('== != < > <= >=')
      expect(tokens.map(t => t.value)).toEqual(['==', '!=', '<', '>', '<=', '>='])
    })

    it('tokenizes logical operators', () => {
      const tokens = tokenize('&& || !')
      expect(tokens.map(t => t.value)).toEqual(['&&', '||', '!'])
    })
  })

  describe('punctuation', () => {
    it('tokenizes parentheses', () => {
      const tokens = tokenize('()')
      expect(tokens).toEqual([
        { type: 'LeftParen', value: '(', position: 0 },
        { type: 'RightParen', value: ')', position: 1 },
      ])
    })

    it('tokenizes comma', () => {
      const tokens = tokenize(',')
      expect(tokens).toEqual([{ type: 'Comma', value: ',', position: 0 }])
    })

    it('tokenizes dot', () => {
      const tokens = tokenize('.')
      expect(tokens).toEqual([{ type: 'Dot', value: '.', position: 0 }])
    })
  })

  describe('complex expressions', () => {
    it('tokenizes arithmetic expression', () => {
      const tokens = tokenize('price * quantity + 10')
      expect(tokens.map(t => ({ type: t.type, value: t.value }))).toEqual([
        { type: 'Identifier', value: 'price' },
        { type: 'Operator', value: '*' },
        { type: 'Identifier', value: 'quantity' },
        { type: 'Operator', value: '+' },
        { type: 'Number', value: '10' },
      ])
    })

    it('tokenizes function call', () => {
      const tokens = tokenize('SUM(expenses.amount)')
      expect(tokens.map(t => ({ type: t.type, value: t.value }))).toEqual([
        { type: 'Identifier', value: 'SUM' },
        { type: 'LeftParen', value: '(' },
        { type: 'Identifier', value: 'expenses' },
        { type: 'Dot', value: '.' },
        { type: 'Identifier', value: 'amount' },
        { type: 'RightParen', value: ')' },
      ])
    })

    it('tokenizes IF expression', () => {
      const tokens = tokenize('IF(status == "active", amount, 0)')
      const types = tokens.map(t => t.type)
      expect(types).toEqual([
        'Identifier', 'LeftParen',
        'Identifier', 'Operator', 'String', 'Comma',
        'Identifier', 'Comma',
        'Number',
        'RightParen',
      ])
    })

    it('tokenizes comparison with boolean', () => {
      const tokens = tokenize('active == true && count > 0')
      expect(tokens.map(t => t.value)).toEqual(['active', '==', 'true', '&&', 'count', '>', '0'])
    })
  })

  describe('whitespace handling', () => {
    it('handles no whitespace', () => {
      const tokens = tokenize('a+b')
      expect(tokens.map(t => t.value)).toEqual(['a', '+', 'b'])
    })

    it('handles extra whitespace', () => {
      const tokens = tokenize('  a  +  b  ')
      expect(tokens.map(t => t.value)).toEqual(['a', '+', 'b'])
    })

    it('handles tabs and newlines', () => {
      const tokens = tokenize('a\t+\nb')
      expect(tokens.map(t => t.value)).toEqual(['a', '+', 'b'])
    })
  })

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(tokenize('')).toEqual([])
    })

    it('returns empty array for whitespace only', () => {
      expect(tokenize('   ')).toEqual([])
    })

    it('throws on max length exceeded', () => {
      const long = 'a'.repeat(501)
      expect(() => tokenize(long)).toThrow(TokenizerError)
      expect(() => tokenize(long)).toThrow('maximum length')
    })

    it('accepts formula at exactly max length', () => {
      const formula = 'a'.repeat(500)
      const tokens = tokenize(formula)
      expect(tokens.length).toBe(1)
    })

    it('throws on unexpected character', () => {
      expect(() => tokenize('$')).toThrow(TokenizerError)
      expect(() => tokenize('$')).toThrow("Unexpected character: '$'")
    })

    it('records correct positions', () => {
      const tokens = tokenize('a + b')
      expect(tokens[0].position).toBe(0)
      expect(tokens[1].position).toBe(2)
      expect(tokens[2].position).toBe(4)
    })
  })
})
