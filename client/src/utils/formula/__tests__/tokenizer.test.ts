import { describe, it, expect } from 'vitest';
import { tokenize, TokenizerError } from '../tokenizer';

describe('tokenize', () => {
  describe('numbers', () => {
    it('tokenizes integer', () => {
      const tokens = tokenize('42');
      expect(tokens).toEqual([{ type: 'Number', value: '42', position: 0 }]);
    });

    it('tokenizes decimal number', () => {
      const tokens = tokenize('3.14');
      expect(tokens).toEqual([{ type: 'Number', value: '3.14', position: 0 }]);
    });

    it('tokenizes number with trailing dot (dot becomes separate token)', () => {
      const tokens = tokenize('5.');
      expect(tokens).toEqual([
        { type: 'Number', value: '5.', position: 0 },
      ]);
    });

    it('tokenizes zero', () => {
      const tokens = tokenize('0');
      expect(tokens).toEqual([{ type: 'Number', value: '0', position: 0 }]);
    });
  });

  describe('strings', () => {
    it('tokenizes simple string', () => {
      const tokens = tokenize('"hello"');
      expect(tokens).toEqual([{ type: 'String', value: 'hello', position: 0 }]);
    });

    it('tokenizes empty string', () => {
      const tokens = tokenize('""');
      expect(tokens).toEqual([{ type: 'String', value: '', position: 0 }]);
    });

    it('handles escape sequences', () => {
      const tokens = tokenize('"line\\nbreak"');
      expect(tokens[0].value).toBe('line\nbreak');
    });

    it('handles escaped tab', () => {
      const tokens = tokenize('"col\\tcol"');
      expect(tokens[0].value).toBe('col\tcol');
    });

    it('handles escaped backslash', () => {
      const tokens = tokenize('"path\\\\file"');
      expect(tokens[0].value).toBe('path\\file');
    });

    it('handles escaped quote', () => {
      const tokens = tokenize('"say \\"hi\\""');
      expect(tokens[0].value).toBe('say "hi"');
    });

    it('throws on unterminated string', () => {
      expect(() => tokenize('"hello')).toThrow(TokenizerError);
      expect(() => tokenize('"hello')).toThrow('Unterminated string literal');
    });

    it('throws on unterminated escape at end', () => {
      expect(() => tokenize('"hello\\')).toThrow(TokenizerError);
    });
  });

  describe('identifiers', () => {
    it('tokenizes simple identifier', () => {
      const tokens = tokenize('name');
      expect(tokens).toEqual([{ type: 'Identifier', value: 'name', position: 0 }]);
    });

    it('tokenizes identifier with underscore', () => {
      const tokens = tokenize('my_var');
      expect(tokens).toEqual([{ type: 'Identifier', value: 'my_var', position: 0 }]);
    });

    it('tokenizes identifier starting with underscore', () => {
      const tokens = tokenize('_private');
      expect(tokens).toEqual([{ type: 'Identifier', value: '_private', position: 0 }]);
    });

    it('tokenizes identifier with digits', () => {
      const tokens = tokenize('var1');
      expect(tokens).toEqual([{ type: 'Identifier', value: 'var1', position: 0 }]);
    });

    it('tokenizes Cyrillic identifier', () => {
      const tokens = tokenize('цена');
      expect(tokens).toEqual([{ type: 'Identifier', value: 'цена', position: 0 }]);
    });

    it('tokenizes mixed Cyrillic and ASCII identifier', () => {
      const tokens = tokenize('цена_USD');
      expect(tokens).toEqual([{ type: 'Identifier', value: 'цена_USD', position: 0 }]);
    });
  });

  describe('booleans', () => {
    it('tokenizes true', () => {
      const tokens = tokenize('true');
      expect(tokens).toEqual([{ type: 'Boolean', value: 'true', position: 0 }]);
    });

    it('tokenizes false', () => {
      const tokens = tokenize('false');
      expect(tokens).toEqual([{ type: 'Boolean', value: 'false', position: 0 }]);
    });
  });

  describe('operators', () => {
    it('tokenizes single-char operators', () => {
      for (const op of ['+', '-', '*', '/', '%', '<', '>', '!']) {
        const tokens = tokenize(`a ${op} b`);
        expect(tokens[1]).toEqual({ type: 'Operator', value: op, position: 2 });
      }
    });

    it('tokenizes two-char operators', () => {
      for (const op of ['&&', '||', '==', '!=', '<=', '>=']) {
        const tokens = tokenize(`a ${op} b`);
        expect(tokens[1]).toEqual({ type: 'Operator', value: op, position: 2 });
      }
    });
  });

  describe('punctuation', () => {
    it('tokenizes parentheses', () => {
      const tokens = tokenize('(a)');
      expect(tokens[0].type).toBe('LeftParen');
      expect(tokens[2].type).toBe('RightParen');
    });

    it('tokenizes comma', () => {
      const tokens = tokenize('a, b');
      expect(tokens[1]).toEqual({ type: 'Comma', value: ',', position: 1 });
    });

    it('tokenizes dot', () => {
      const tokens = tokenize('a.b');
      expect(tokens[1]).toEqual({ type: 'Dot', value: '.', position: 1 });
    });
  });

  describe('function calls', () => {
    it('tokenizes function call with args', () => {
      const tokens = tokenize('SUM(a, b)');
      expect(tokens.map(t => t.type)).toEqual([
        'Identifier', 'LeftParen', 'Identifier', 'Comma', 'Identifier', 'RightParen',
      ]);
      expect(tokens[0].value).toBe('SUM');
    });
  });

  describe('member access', () => {
    it('tokenizes member access', () => {
      const tokens = tokenize('obj.prop');
      expect(tokens.map(t => t.type)).toEqual(['Identifier', 'Dot', 'Identifier']);
      expect(tokens[0].value).toBe('obj');
      expect(tokens[2].value).toBe('prop');
    });
  });

  describe('whitespace', () => {
    it('skips spaces, tabs, newlines', () => {
      const tokens = tokenize('  a  +\t b \n');
      expect(tokens).toHaveLength(3);
    });

    it('returns empty array for empty input', () => {
      expect(tokenize('')).toEqual([]);
    });

    it('returns empty array for whitespace-only', () => {
      expect(tokenize('   ')).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('throws on unexpected character', () => {
      expect(() => tokenize('@')).toThrow(TokenizerError);
      expect(() => tokenize('@')).toThrow("Unexpected character: '@'");
    });

    it('throws when formula exceeds max length', () => {
      const longFormula = 'a'.repeat(501);
      expect(() => tokenize(longFormula)).toThrow(TokenizerError);
      expect(() => tokenize(longFormula)).toThrow('exceeds maximum length');
    });

    it('accepts formula at exactly max length', () => {
      const formula = 'a'.repeat(500);
      expect(() => tokenize(formula)).not.toThrow();
    });

    it('preserves position info across tokens', () => {
      const tokens = tokenize('a + b');
      expect(tokens[0].position).toBe(0);
      expect(tokens[1].position).toBe(2);
      expect(tokens[2].position).toBe(4);
    });
  });
});
