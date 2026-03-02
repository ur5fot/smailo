export { tokenize, TokenizerError } from './tokenizer.js';
export type { Token, TokenType } from './tokenizer.js';
export { parse, ParserError } from './parser.js';
export type { ASTNode } from './parser.js';
export { evaluate, EvaluatorError } from './evaluator.js';
export type { FormulaContext } from './evaluator.js';

import { parse } from './parser.js';
import { evaluate } from './evaluator.js';
import type { FormulaContext } from './evaluator.js';

export function evaluateFormula(formula: string, context: FormulaContext = {}): unknown {
  const ast = parse(formula);
  return evaluate(ast, context);
}
