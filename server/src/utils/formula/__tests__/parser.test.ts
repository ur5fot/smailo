import { describe, it, expect } from 'vitest'
import { parse, ParserError } from '../parser.js'
import type { ASTNode } from '../parser.js'

describe('parse', () => {
  describe('literals', () => {
    it('parses integer', () => {
      expect(parse('42')).toEqual({ type: 'NumberLiteral', value: 42 })
    })

    it('parses decimal', () => {
      expect(parse('3.14')).toEqual({ type: 'NumberLiteral', value: 3.14 })
    })

    it('parses string', () => {
      expect(parse('"hello"')).toEqual({ type: 'StringLiteral', value: 'hello' })
    })

    it('parses true', () => {
      expect(parse('true')).toEqual({ type: 'BooleanLiteral', value: true })
    })

    it('parses false', () => {
      expect(parse('false')).toEqual({ type: 'BooleanLiteral', value: false })
    })

    it('parses identifier', () => {
      expect(parse('price')).toEqual({ type: 'Identifier', name: 'price' })
    })
  })

  describe('binary operations', () => {
    it('parses addition', () => {
      const ast = parse('a + b')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '+',
        left: { type: 'Identifier', name: 'a' },
        right: { type: 'Identifier', name: 'b' },
      })
    })

    it('parses multiplication', () => {
      const ast = parse('price * quantity')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '*',
        left: { type: 'Identifier', name: 'price' },
        right: { type: 'Identifier', name: 'quantity' },
      })
    })

    it('parses comparison', () => {
      const ast = parse('x > 10')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '>',
        left: { type: 'Identifier', name: 'x' },
        right: { type: 'NumberLiteral', value: 10 },
      })
    })

    it('parses equality', () => {
      const ast = parse('status == "active"')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '==',
        left: { type: 'Identifier', name: 'status' },
        right: { type: 'StringLiteral', value: 'active' },
      })
    })

    it('parses logical AND', () => {
      const ast = parse('a && b')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '&&',
        left: { type: 'Identifier', name: 'a' },
        right: { type: 'Identifier', name: 'b' },
      })
    })

    it('parses logical OR', () => {
      const ast = parse('a || b')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '||',
        left: { type: 'Identifier', name: 'a' },
        right: { type: 'Identifier', name: 'b' },
      })
    })
  })

  describe('operator precedence', () => {
    it('multiplication before addition', () => {
      // a + b * c  =>  a + (b * c)
      const ast = parse('a + b * c') as any
      expect(ast.type).toBe('BinaryOp')
      expect(ast.op).toBe('+')
      expect(ast.left).toEqual({ type: 'Identifier', name: 'a' })
      expect(ast.right.type).toBe('BinaryOp')
      expect(ast.right.op).toBe('*')
    })

    it('addition before comparison', () => {
      // a + 1 > b  =>  (a + 1) > b
      const ast = parse('a + 1 > b') as any
      expect(ast.op).toBe('>')
      expect(ast.left.op).toBe('+')
    })

    it('comparison before equality', () => {
      // a > b == true  =>  (a > b) == true
      const ast = parse('a > b == true') as any
      expect(ast.op).toBe('==')
      expect(ast.left.op).toBe('>')
    })

    it('equality before AND', () => {
      // a == 1 && b == 2  =>  (a == 1) && (b == 2)
      const ast = parse('a == 1 && b == 2') as any
      expect(ast.op).toBe('&&')
      expect(ast.left.op).toBe('==')
      expect(ast.right.op).toBe('==')
    })

    it('AND before OR', () => {
      // a || b && c  =>  a || (b && c)
      const ast = parse('a || b && c') as any
      expect(ast.op).toBe('||')
      expect(ast.right.op).toBe('&&')
    })

    it('parentheses override precedence', () => {
      // (a + b) * c
      const ast = parse('(a + b) * c') as any
      expect(ast.op).toBe('*')
      expect(ast.left.op).toBe('+')
    })

    it('nested parentheses', () => {
      const ast = parse('((a + b))') as any
      expect(ast.type).toBe('BinaryOp')
      expect(ast.op).toBe('+')
    })
  })

  describe('unary operations', () => {
    it('parses unary minus', () => {
      const ast = parse('-x')
      expect(ast).toEqual({
        type: 'UnaryOp',
        op: '-',
        operand: { type: 'Identifier', name: 'x' },
      })
    })

    it('parses unary NOT', () => {
      const ast = parse('!active')
      expect(ast).toEqual({
        type: 'UnaryOp',
        op: '!',
        operand: { type: 'Identifier', name: 'active' },
      })
    })

    it('parses double negation', () => {
      const ast = parse('--x') as any
      expect(ast.type).toBe('UnaryOp')
      expect(ast.op).toBe('-')
      expect(ast.operand.type).toBe('UnaryOp')
      expect(ast.operand.op).toBe('-')
    })

    it('unary minus has higher precedence than binary operators', () => {
      // -a + b  =>  (-a) + b
      const ast = parse('-a + b') as any
      expect(ast.op).toBe('+')
      expect(ast.left.type).toBe('UnaryOp')
    })
  })

  describe('function calls', () => {
    it('parses function with no arguments', () => {
      expect(parse('NOW()')).toEqual({
        type: 'FunctionCall',
        name: 'NOW',
        args: [],
      })
    })

    it('parses function with one argument', () => {
      expect(parse('ABS(x)')).toEqual({
        type: 'FunctionCall',
        name: 'ABS',
        args: [{ type: 'Identifier', name: 'x' }],
      })
    })

    it('parses function with multiple arguments', () => {
      const ast = parse('IF(a, b, c)') as any
      expect(ast.type).toBe('FunctionCall')
      expect(ast.name).toBe('IF')
      expect(ast.args).toHaveLength(3)
    })

    it('parses nested function calls', () => {
      const ast = parse('ROUND(ABS(x), 2)') as any
      expect(ast.type).toBe('FunctionCall')
      expect(ast.name).toBe('ROUND')
      expect(ast.args[0].type).toBe('FunctionCall')
      expect(ast.args[0].name).toBe('ABS')
      expect(ast.args[1]).toEqual({ type: 'NumberLiteral', value: 2 })
    })

    it('parses function with expression argument', () => {
      const ast = parse('ABS(a - b)') as any
      expect(ast.args[0].type).toBe('BinaryOp')
      expect(ast.args[0].op).toBe('-')
    })
  })

  describe('member access', () => {
    it('parses member access', () => {
      expect(parse('expenses.amount')).toEqual({
        type: 'MemberAccess',
        object: { type: 'Identifier', name: 'expenses' },
        property: 'amount',
      })
    })

    it('parses chained member access', () => {
      const ast = parse('a.b.c') as any
      expect(ast.type).toBe('MemberAccess')
      expect(ast.property).toBe('c')
      expect(ast.object.type).toBe('MemberAccess')
      expect(ast.object.property).toBe('b')
      expect(ast.object.object).toEqual({ type: 'Identifier', name: 'a' })
    })

    it('parses member access as function argument', () => {
      const ast = parse('SUM(expenses.amount)') as any
      expect(ast.type).toBe('FunctionCall')
      expect(ast.args[0].type).toBe('MemberAccess')
    })
  })

  describe('complex expressions', () => {
    it('parses IF with comparison', () => {
      const ast = parse('IF(status == "active", amount, 0)') as any
      expect(ast.type).toBe('FunctionCall')
      expect(ast.name).toBe('IF')
      expect(ast.args[0].type).toBe('BinaryOp')
      expect(ast.args[0].op).toBe('==')
    })

    it('parses CONCAT with strings', () => {
      const ast = parse('CONCAT(first_name, " ", last_name)') as any
      expect(ast.type).toBe('FunctionCall')
      expect(ast.name).toBe('CONCAT')
      expect(ast.args).toHaveLength(3)
    })

    it('parses ROUND with division', () => {
      const ast = parse('ROUND(total / count, 2)') as any
      expect(ast.type).toBe('FunctionCall')
      expect(ast.args[0].op).toBe('/')
      expect(ast.args[1]).toEqual({ type: 'NumberLiteral', value: 2 })
    })

    it('parses modulo', () => {
      const ast = parse('a % b') as any
      expect(ast.op).toBe('%')
    })

    it('parses chained arithmetic', () => {
      // a + b + c => (a + b) + c (left-associative)
      const ast = parse('a + b + c') as any
      expect(ast.op).toBe('+')
      expect(ast.left.op).toBe('+')
      expect(ast.left.left).toEqual({ type: 'Identifier', name: 'a' })
    })

    it('parses inequality', () => {
      const ast = parse('a != b')
      expect(ast).toEqual({
        type: 'BinaryOp',
        op: '!=',
        left: { type: 'Identifier', name: 'a' },
        right: { type: 'Identifier', name: 'b' },
      })
    })
  })

  describe('error cases', () => {
    it('throws on empty formula', () => {
      expect(() => parse('')).toThrow(ParserError)
      expect(() => parse('')).toThrow('Empty formula')
    })

    it('throws on whitespace only', () => {
      expect(() => parse('   ')).toThrow(ParserError)
      expect(() => parse('   ')).toThrow('Empty formula')
    })

    it('throws on missing right operand', () => {
      expect(() => parse('a +')).toThrow(ParserError)
    })

    it('throws on unclosed parenthesis', () => {
      expect(() => parse('(a + b')).toThrow(ParserError)
    })

    it('throws on unexpected token after expression', () => {
      expect(() => parse('a b')).toThrow(ParserError)
      expect(() => parse('a b')).toThrow('Unexpected token after expression')
    })

    it('throws on trailing operator', () => {
      expect(() => parse('a *')).toThrow(ParserError)
    })

    it('throws on leading operator (non-unary)', () => {
      expect(() => parse('* a')).toThrow(ParserError)
    })
  })
})
