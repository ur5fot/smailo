import { describe, it, expect } from 'vitest';
import { parse, ParserError } from '../parser';
import type { ASTNode } from '../parser';

describe('parse', () => {
  describe('literals', () => {
    it('parses integer', () => {
      expect(parse('42')).toEqual({ type: 'NumberLiteral', value: 42 });
    });

    it('parses decimal', () => {
      expect(parse('3.14')).toEqual({ type: 'NumberLiteral', value: 3.14 });
    });

    it('parses string', () => {
      expect(parse('"hello"')).toEqual({ type: 'StringLiteral', value: 'hello' });
    });

    it('parses true', () => {
      expect(parse('true')).toEqual({ type: 'BooleanLiteral', value: true });
    });

    it('parses false', () => {
      expect(parse('false')).toEqual({ type: 'BooleanLiteral', value: false });
    });

    it('parses identifier', () => {
      expect(parse('x')).toEqual({ type: 'Identifier', name: 'x' });
    });
  });

  describe('arithmetic', () => {
    it('parses addition', () => {
      const ast = parse('a + b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.type).toBe('BinaryOp');
      expect(ast.op).toBe('+');
      expect(ast.left).toEqual({ type: 'Identifier', name: 'a' });
      expect(ast.right).toEqual({ type: 'Identifier', name: 'b' });
    });

    it('parses subtraction', () => {
      const ast = parse('a - b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('-');
    });

    it('parses multiplication', () => {
      const ast = parse('a * b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('*');
    });

    it('parses division', () => {
      const ast = parse('a / b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('/');
    });

    it('parses modulo', () => {
      const ast = parse('a % b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('%');
    });

    it('respects precedence: * before +', () => {
      const ast = parse('a + b * c') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('+');
      expect((ast.right as Extract<ASTNode, { type: 'BinaryOp' }>).op).toBe('*');
    });

    it('respects precedence: parentheses override', () => {
      const ast = parse('(a + b) * c') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('*');
      expect((ast.left as Extract<ASTNode, { type: 'BinaryOp' }>).op).toBe('+');
    });
  });

  describe('comparisons', () => {
    for (const op of ['==', '!=', '<', '>', '<=', '>=']) {
      it(`parses ${op}`, () => {
        const ast = parse(`a ${op} b`) as Extract<ASTNode, { type: 'BinaryOp' }>;
        expect(ast.type).toBe('BinaryOp');
        expect(ast.op).toBe(op);
      });
    }
  });

  describe('logic operators', () => {
    it('parses &&', () => {
      const ast = parse('a && b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('&&');
    });

    it('parses ||', () => {
      const ast = parse('a || b') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('||');
    });

    it('&& has higher precedence than ||', () => {
      const ast = parse('a || b && c') as Extract<ASTNode, { type: 'BinaryOp' }>;
      expect(ast.op).toBe('||');
      expect((ast.right as Extract<ASTNode, { type: 'BinaryOp' }>).op).toBe('&&');
    });

    it('parses unary negation !', () => {
      const ast = parse('!x') as Extract<ASTNode, { type: 'UnaryOp' }>;
      expect(ast.type).toBe('UnaryOp');
      expect(ast.op).toBe('!');
      expect(ast.operand).toEqual({ type: 'Identifier', name: 'x' });
    });

    it('parses unary minus', () => {
      const ast = parse('-5') as Extract<ASTNode, { type: 'UnaryOp' }>;
      expect(ast.type).toBe('UnaryOp');
      expect(ast.op).toBe('-');
      expect(ast.operand).toEqual({ type: 'NumberLiteral', value: 5 });
    });
  });

  describe('function calls', () => {
    it('parses no-arg function', () => {
      const ast = parse('NOW()') as Extract<ASTNode, { type: 'FunctionCall' }>;
      expect(ast.type).toBe('FunctionCall');
      expect(ast.name).toBe('NOW');
      expect(ast.args).toEqual([]);
    });

    it('parses single-arg function', () => {
      const ast = parse('ABS(x)') as Extract<ASTNode, { type: 'FunctionCall' }>;
      expect(ast.name).toBe('ABS');
      expect(ast.args).toHaveLength(1);
    });

    it('parses multi-arg function', () => {
      const ast = parse('IF(a, b, c)') as Extract<ASTNode, { type: 'FunctionCall' }>;
      expect(ast.name).toBe('IF');
      expect(ast.args).toHaveLength(3);
    });

    it('parses nested function calls', () => {
      const ast = parse('ABS(ROUND(x, 2))') as Extract<ASTNode, { type: 'FunctionCall' }>;
      expect(ast.name).toBe('ABS');
      const inner = ast.args[0] as Extract<ASTNode, { type: 'FunctionCall' }>;
      expect(inner.name).toBe('ROUND');
      expect(inner.args).toHaveLength(2);
    });
  });

  describe('member access', () => {
    it('parses simple member access', () => {
      const ast = parse('obj.prop') as Extract<ASTNode, { type: 'MemberAccess' }>;
      expect(ast.type).toBe('MemberAccess');
      expect(ast.object).toEqual({ type: 'Identifier', name: 'obj' });
      expect(ast.property).toBe('prop');
    });

    it('parses chained member access', () => {
      const ast = parse('a.b.c') as Extract<ASTNode, { type: 'MemberAccess' }>;
      expect(ast.type).toBe('MemberAccess');
      expect(ast.property).toBe('c');
      const inner = ast.object as Extract<ASTNode, { type: 'MemberAccess' }>;
      expect(inner.property).toBe('b');
    });
  });

  describe('error cases', () => {
    it('throws on empty formula', () => {
      expect(() => parse('')).toThrow(ParserError);
      expect(() => parse('')).toThrow('Empty formula');
    });

    it('throws on unexpected token', () => {
      expect(() => parse('+')).toThrow(ParserError);
    });

    it('throws on unclosed parenthesis', () => {
      expect(() => parse('(a + b')).toThrow(ParserError);
    });

    it('throws on trailing tokens', () => {
      expect(() => parse('a b')).toThrow(ParserError);
      expect(() => parse('a b')).toThrow('Unexpected token after expression');
    });

    it('throws on missing function arg after comma', () => {
      expect(() => parse('IF(a,)')).toThrow(ParserError);
    });
  });
});
