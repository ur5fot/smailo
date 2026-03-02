import { ASTNode } from './parser.js';

const MAX_DEPTH = 20;

export interface FormulaContext {
  row?: Record<string, unknown>;
  tables?: Record<string, {
    columns: Array<{ name: string; type: string; required?: boolean; options?: string[]; formula?: string }>;
    rows: Array<Record<string, unknown>>;
  }>;
  currentTable?: {
    columns: Array<{ name: string; type: string; required?: boolean; options?: string[]; formula?: string }>;
    rows: Array<Record<string, unknown>>;
  };
}

export class EvaluatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvaluatorError';
  }
}

export function evaluate(ast: ASTNode, context: FormulaContext, depth: number = 0): unknown {
  if (depth > MAX_DEPTH) {
    throw new EvaluatorError('Maximum expression depth exceeded');
  }

  switch (ast.type) {
    case 'NumberLiteral':
      return ast.value;

    case 'StringLiteral':
      return ast.value;

    case 'BooleanLiteral':
      return ast.value;

    case 'Identifier':
      if (context.row && ast.name in context.row) {
        return context.row[ast.name];
      }
      return null;

    case 'MemberAccess': {
      // a.b — first try row context, then tables context
      if (ast.object.type === 'Identifier') {
        const objName = ast.object.name;
        const prop = ast.property;

        // Try row context first: row.a.b
        if (context.row && objName in context.row) {
          const obj = context.row[objName];
          if (obj !== null && obj !== undefined && typeof obj === 'object') {
            return (obj as Record<string, unknown>)[prop] ?? null;
          }
          return null;
        }

        // Try tables context: tables.a (for aggregates — return table reference)
        if (context.tables && objName in context.tables) {
          // MemberAccess on a table returns the column data for aggregate use
          // This is handled by aggregate functions; here we just return null
          // as direct table.column access doesn't produce a scalar value
          return null;
        }
      }

      // General case: evaluate object, access property
      const obj = evaluate(ast.object, context, depth + 1);
      if (obj !== null && obj !== undefined && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[ast.property] ?? null;
      }
      return null;
    }

    case 'UnaryOp': {
      const operand = evaluate(ast.operand, context, depth + 1);
      if (ast.op === '-') {
        if (typeof operand === 'number') return -operand;
        return null;
      }
      if (ast.op === '!') {
        return !toBoolean(operand);
      }
      return null;
    }

    case 'BinaryOp':
      return evaluateBinaryOp(ast.op, ast.left, ast.right, context, depth);

    case 'FunctionCall':
      // Functions will be added in Task 3; for now return null
      throw new EvaluatorError(`Unknown function: ${ast.name}`);

    default:
      return null;
  }
}

function evaluateBinaryOp(op: string, left: ASTNode, right: ASTNode, context: FormulaContext, depth: number): unknown {
  // Short-circuit for logical operators
  if (op === '&&') {
    const leftVal = evaluate(left, context, depth + 1);
    if (!toBoolean(leftVal)) return leftVal;
    return evaluate(right, context, depth + 1);
  }
  if (op === '||') {
    const leftVal = evaluate(left, context, depth + 1);
    if (toBoolean(leftVal)) return leftVal;
    return evaluate(right, context, depth + 1);
  }

  const leftVal = evaluate(left, context, depth + 1);
  const rightVal = evaluate(right, context, depth + 1);

  // Arithmetic
  if (op === '+') {
    // String concatenation if either side is a string
    if (typeof leftVal === 'string' || typeof rightVal === 'string') {
      return String(leftVal ?? '') + String(rightVal ?? '');
    }
    if (typeof leftVal === 'number' && typeof rightVal === 'number') {
      return leftVal + rightVal;
    }
    return null;
  }

  if (op === '-' || op === '*' || op === '/' || op === '%') {
    const l = toNumber(leftVal);
    const r = toNumber(rightVal);
    if (l === null || r === null) return null;

    switch (op) {
      case '-': return l - r;
      case '*': return l * r;
      case '/': return r === 0 ? null : l / r;
      case '%': return r === 0 ? null : l % r;
    }
  }

  // Comparisons
  if (op === '==' || op === '!=') {
    const equal = looseEqual(leftVal, rightVal);
    return op === '==' ? equal : !equal;
  }

  if (op === '<' || op === '>' || op === '<=' || op === '>=') {
    return compareValues(op, leftVal, rightVal);
  }

  return null;
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return isNaN(n) ? null : n;
  }
  if (typeof val === 'boolean') return val ? 1 : 0;
  return null;
}

function toBoolean(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  return true;
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;

  // Number-string coercion
  if (typeof a === 'number' && typeof b === 'string') {
    const bNum = Number(b);
    return !isNaN(bNum) && a === bNum;
  }
  if (typeof a === 'string' && typeof b === 'number') {
    const aNum = Number(a);
    return !isNaN(aNum) && aNum === b;
  }

  return a === b;
}

function compareValues(op: string, a: unknown, b: unknown): boolean | null {
  // Both numbers
  if (typeof a === 'number' && typeof b === 'number') {
    switch (op) {
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
    }
  }

  // Both strings
  if (typeof a === 'string' && typeof b === 'string') {
    switch (op) {
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
    }
  }

  // Mixed number/string — try coerce to number
  const aNum = toNumber(a);
  const bNum = toNumber(b);
  if (aNum !== null && bNum !== null) {
    switch (op) {
      case '<': return aNum < bNum;
      case '>': return aNum > bNum;
      case '<=': return aNum <= bNum;
      case '>=': return aNum >= bNum;
    }
  }

  return null;
}
