export { tokenize, TokenizerError } from './tokenizer';
export type { Token, TokenType } from './tokenizer';
export { parse, ParserError } from './parser';
export type { ASTNode } from './parser';
export { evaluate, EvaluatorError } from './evaluator';
export type { FormulaContext } from './evaluator';

import { parse } from './parser';
import { evaluate } from './evaluator';
import type { FormulaContext } from './evaluator';

export function evaluateFormula(formula: string, context: FormulaContext = {}): unknown {
  const ast = parse(formula);
  return evaluate(ast, context);
}
