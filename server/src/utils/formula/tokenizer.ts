const MAX_FORMULA_LENGTH = 500;

export type TokenType =
  | 'Number'
  | 'String'
  | 'Boolean'
  | 'Identifier'
  | 'Operator'
  | 'LeftParen'
  | 'RightParen'
  | 'Comma'
  | 'Dot';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const TWO_CHAR_OPERATORS = new Set(['&&', '||', '==', '!=', '<=', '>=']);

const SINGLE_CHAR_OPERATORS = new Set(['+', '-', '*', '/', '%', '<', '>', '!']);

export class TokenizerError extends Error {
  constructor(message: string, public position: number) {
    super(message);
    this.name = 'TokenizerError';
  }
}

export function tokenize(formula: string): Token[] {
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new TokenizerError(`Formula exceeds maximum length of ${MAX_FORMULA_LENGTH} characters`, 0);
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const ch = formula[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Number literal
    if (ch >= '0' && ch <= '9') {
      const start = i;
      while (i < formula.length && formula[i] >= '0' && formula[i] <= '9') i++;
      if (i < formula.length && formula[i] === '.') {
        i++;
        while (i < formula.length && formula[i] >= '0' && formula[i] <= '9') i++;
      }
      tokens.push({ type: 'Number', value: formula.slice(start, i), position: start });
      continue;
    }

    // String literal (double-quoted)
    if (ch === '"') {
      const start = i;
      i++; // skip opening quote
      let value = '';
      while (i < formula.length && formula[i] !== '"') {
        if (formula[i] === '\\') {
          i++;
          if (i >= formula.length) {
            throw new TokenizerError('Unterminated string literal', start);
          }
          const escaped = formula[i];
          switch (escaped) {
            case 'n': value += '\n'; break;
            case 't': value += '\t'; break;
            case '\\': value += '\\'; break;
            case '"': value += '"'; break;
            default: value += escaped; break;
          }
        } else {
          value += formula[i];
        }
        i++;
      }
      if (i >= formula.length) {
        throw new TokenizerError('Unterminated string literal', start);
      }
      i++; // skip closing quote
      tokens.push({ type: 'String', value, position: start });
      continue;
    }

    // Identifier or Boolean (supports ASCII + Cyrillic letters)
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || (ch >= '\u0400' && ch <= '\u04FF')) {
      const start = i;
      while (i < formula.length && ((formula[i] >= 'a' && formula[i] <= 'z') || (formula[i] >= 'A' && formula[i] <= 'Z') || (formula[i] >= '0' && formula[i] <= '9') || formula[i] === '_' || (formula[i] >= '\u0400' && formula[i] <= '\u04FF'))) {
        i++;
      }
      const word = formula.slice(start, i);
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'Boolean', value: word, position: start });
      } else {
        tokens.push({ type: 'Identifier', value: word, position: start });
      }
      continue;
    }

    // Parentheses
    if (ch === '(') {
      tokens.push({ type: 'LeftParen', value: '(', position: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RightParen', value: ')', position: i });
      i++;
      continue;
    }

    // Comma
    if (ch === ',') {
      tokens.push({ type: 'Comma', value: ',', position: i });
      i++;
      continue;
    }

    // Dot
    if (ch === '.') {
      tokens.push({ type: 'Dot', value: '.', position: i });
      i++;
      continue;
    }

    // Operators (check two-char first)
    if (i + 1 < formula.length) {
      const twoChar = formula.slice(i, i + 2);
      if (TWO_CHAR_OPERATORS.has(twoChar)) {
        tokens.push({ type: 'Operator', value: twoChar, position: i });
        i += 2;
        continue;
      }
    }

    if (SINGLE_CHAR_OPERATORS.has(ch)) {
      tokens.push({ type: 'Operator', value: ch, position: i });
      i++;
      continue;
    }

    throw new TokenizerError(`Unexpected character: '${ch}'`, i);
  }

  return tokens;
}
