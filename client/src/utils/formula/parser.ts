import { Token, tokenize } from './tokenizer';

export type ASTNode =
  | { type: 'NumberLiteral'; value: number }
  | { type: 'StringLiteral'; value: string }
  | { type: 'BooleanLiteral'; value: boolean }
  | { type: 'Identifier'; name: string }
  | { type: 'BinaryOp'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'UnaryOp'; op: string; operand: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] }
  | { type: 'MemberAccess'; object: ASTNode; property: string };

export class ParserError extends Error {
  constructor(message: string, public position: number) {
    super(message);
    this.name = 'ParserError';
  }
}

export function parse(formula: string): ASTNode {
  const tokens = tokenize(formula);
  if (tokens.length === 0) {
    throw new ParserError('Empty formula', 0);
  }

  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function advance(): Token {
    return tokens[pos++];
  }

  function expect(type: Token['type'], value?: string): Token {
    const token = peek();
    if (!token) {
      throw new ParserError(`Unexpected end of formula, expected ${type}${value ? ` '${value}'` : ''}`, tokens.length > 0 ? tokens[tokens.length - 1].position : 0);
    }
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new ParserError(`Expected ${type}${value ? ` '${value}'` : ''}, got ${token.type} '${token.value}'`, token.position);
    }
    return advance();
  }

  function parseExpression(): ASTNode {
    return parseOr();
  }

  function parseOr(): ASTNode {
    let left = parseAnd();
    while (peek()?.type === 'Operator' && peek()!.value === '||') {
      const op = advance().value;
      const right = parseAnd();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseAnd(): ASTNode {
    let left = parseEquality();
    while (peek()?.type === 'Operator' && peek()!.value === '&&') {
      const op = advance().value;
      const right = parseEquality();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseEquality(): ASTNode {
    let left = parseComparison();
    while (peek()?.type === 'Operator' && (peek()!.value === '==' || peek()!.value === '!=')) {
      const op = advance().value;
      const right = parseComparison();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseComparison(): ASTNode {
    let left = parseAdditive();
    while (peek()?.type === 'Operator' && (peek()!.value === '<' || peek()!.value === '>' || peek()!.value === '<=' || peek()!.value === '>=')) {
      const op = advance().value;
      const right = parseAdditive();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseAdditive(): ASTNode {
    let left = parseMultiplicative();
    while (peek()?.type === 'Operator' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = advance().value;
      const right = parseMultiplicative();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseMultiplicative(): ASTNode {
    let left = parseUnary();
    while (peek()?.type === 'Operator' && (peek()!.value === '*' || peek()!.value === '/' || peek()!.value === '%')) {
      const op = advance().value;
      const right = parseUnary();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  function parseUnary(): ASTNode {
    const token = peek();
    if (token?.type === 'Operator' && (token.value === '-' || token.value === '!')) {
      const op = advance().value;
      const operand = parseUnary();
      return { type: 'UnaryOp', op, operand };
    }
    return parsePostfix();
  }

  function parsePostfix(): ASTNode {
    let node = parsePrimary();

    while (true) {
      const token = peek();
      if (token?.type === 'Dot') {
        advance();
        const prop = expect('Identifier');
        node = { type: 'MemberAccess', object: node, property: prop.value };
        continue;
      }
      break;
    }

    return node;
  }

  function parsePrimary(): ASTNode {
    const token = peek();
    if (!token) {
      throw new ParserError('Unexpected end of formula', tokens.length > 0 ? tokens[tokens.length - 1].position : 0);
    }

    if (token.type === 'Number') {
      advance();
      return { type: 'NumberLiteral', value: parseFloat(token.value) };
    }

    if (token.type === 'String') {
      advance();
      return { type: 'StringLiteral', value: token.value };
    }

    if (token.type === 'Boolean') {
      advance();
      return { type: 'BooleanLiteral', value: token.value === 'true' };
    }

    if (token.type === 'Identifier') {
      advance();
      if (peek()?.type === 'LeftParen') {
        advance();
        const args: ASTNode[] = [];
        if (peek()?.type !== 'RightParen') {
          args.push(parseExpression());
          while (peek()?.type === 'Comma') {
            advance();
            args.push(parseExpression());
          }
        }
        expect('RightParen');
        return { type: 'FunctionCall', name: token.value, args };
      }
      return { type: 'Identifier', name: token.value };
    }

    if (token.type === 'LeftParen') {
      advance();
      const expr = parseExpression();
      expect('RightParen');
      return expr;
    }

    throw new ParserError(`Unexpected token: ${token.type} '${token.value}'`, token.position);
  }

  const ast = parseExpression();

  if (pos < tokens.length) {
    const remaining = tokens[pos];
    throw new ParserError(`Unexpected token after expression: ${remaining.type} '${remaining.value}'`, remaining.position);
  }

  return ast;
}
