import { ASTNode } from './parser.js';

const MAX_DEPTH = 20;
const BLOCKED_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);

type BuiltinFn = (args: unknown[]) => unknown;

const builtinFunctions: Record<string, BuiltinFn> = {
  // Conditional
  if: (args) => {
    if (args.length < 3) return null;
    return toBoolean(args[0]) ? args[1] : args[2];
  },

  // Math
  abs: (args) => {
    if (args.length < 1) return null;
    const n = toNumber(args[0]);
    return n === null ? null : Math.abs(n);
  },
  round: (args) => {
    if (args.length < 1) return null;
    const n = toNumber(args[0]);
    if (n === null) return null;
    const decimals = args.length >= 2 ? toNumber(args[1]) : 0;
    if (decimals === null || decimals < 0 || decimals > 15 || !Number.isInteger(decimals)) return null;
    // Use exponential notation to avoid floating-point multiply/divide precision issues
    // e.g. Math.round(1.005 * 100) / 100 = 1.00, but this approach gives 1.01
    return Number(Math.round(Number(n + 'e' + decimals)) + 'e-' + decimals);
  },
  floor: (args) => {
    if (args.length < 1) return null;
    const n = toNumber(args[0]);
    return n === null ? null : Math.floor(n);
  },
  ceil: (args) => {
    if (args.length < 1) return null;
    const n = toNumber(args[0]);
    return n === null ? null : Math.ceil(n);
  },
  min: (args) => {
    if (args.length < 2) return null;
    const a = toNumber(args[0]);
    const b = toNumber(args[1]);
    if (a === null || b === null) return null;
    return Math.min(a, b);
  },
  max: (args) => {
    if (args.length < 2) return null;
    const a = toNumber(args[0]);
    const b = toNumber(args[1]);
    if (a === null || b === null) return null;
    return Math.max(a, b);
  },

  // String
  upper: (args) => {
    if (args.length < 1) return null;
    return typeof args[0] === 'string' ? args[0].toUpperCase() : null;
  },
  lower: (args) => {
    if (args.length < 1) return null;
    return typeof args[0] === 'string' ? args[0].toLowerCase() : null;
  },
  concat: (args) => {
    return args.map(a => String(a ?? '')).join('');
  },
  len: (args) => {
    if (args.length < 1) return null;
    return typeof args[0] === 'string' ? args[0].length : null;
  },
  trim: (args) => {
    if (args.length < 1) return null;
    return typeof args[0] === 'string' ? args[0].trim() : null;
  },

  // Date
  now: () => new Date().toISOString(),
};

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
      if (BLOCKED_PROPERTIES.has(ast.property)) return null;

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

    case 'FunctionCall': {
      const fnName = ast.name.toLowerCase();

      // Aggregate functions need raw AST args to resolve table/column references
      if (fnName in aggregateFunctions) {
        // MIN/MAX with 2 args = scalar (use builtin), with 1 arg = aggregate
        if ((fnName === 'min' || fnName === 'max') && ast.args.length >= 2) {
          const evaluatedArgs = ast.args.map(arg => evaluate(arg, context, depth + 1));
          return builtinFunctions[fnName](evaluatedArgs);
        }
        return evaluateAggregate(fnName, ast.args, context, depth);
      }

      const fn = builtinFunctions[fnName];
      if (!fn) {
        throw new EvaluatorError(`Unknown function: ${ast.name}`);
      }
      // IF is special: only evaluate the branch that's selected (lazy)
      if (fnName === 'if') {
        if (ast.args.length < 3) return null;
        const cond = evaluate(ast.args[0], context, depth + 1);
        return toBoolean(cond)
          ? evaluate(ast.args[1], context, depth + 1)
          : evaluate(ast.args[2], context, depth + 1);
      }
      const evaluatedArgs = ast.args.map(arg => evaluate(arg, context, depth + 1));
      return fn(evaluatedArgs);
    }

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
    if (val.trim() === '') return null;
    const n = Number(val);
    return !Number.isFinite(n) ? null : n;
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

// Aggregate functions registry
const aggregateFunctions: Record<string, true> = {
  sum: true,
  avg: true,
  count: true,
  min: true,
  max: true,
};

/**
 * Resolve a column of numeric (or any) values from context based on AST argument.
 * - MemberAccess (table.column): look up in context.tables
 * - Identifier (column): look up in context.currentTable
 * Returns { values, found } where found indicates if the table/column was located.
 */
function resolveColumnValues(arg: ASTNode, context: FormulaContext): { values: unknown[]; found: boolean } {
  if (arg.type === 'MemberAccess' && arg.object.type === 'Identifier') {
    const tableName = arg.object.name;
    const columnName = arg.property;
    const table = context.tables?.[tableName];
    if (!table) return { values: [], found: false };
    return { values: table.rows.map(row => row[columnName]), found: true };
  }

  if (arg.type === 'Identifier') {
    const columnName = arg.name;
    // For COUNT(tableName), check if the identifier is a table name
    const table = context.tables?.[columnName];
    if (table) return { values: table.rows.map(() => 1), found: true };
    // Otherwise treat as column in current table
    if (context.currentTable) {
      return { values: context.currentTable.rows.map(row => row[columnName]), found: true };
    }
    return { values: [], found: false };
  }

  return { values: [], found: false };
}

/**
 * Resolve row count for COUNT function.
 * COUNT(table) or COUNT(table.column) — counts non-null values for column, or all rows for table.
 */
function resolveCountTarget(arg: ASTNode, context: FormulaContext): { count: number; found: boolean } {
  if (arg.type === 'MemberAccess' && arg.object.type === 'Identifier') {
    const tableName = arg.object.name;
    const columnName = arg.property;
    const table = context.tables?.[tableName];
    if (!table) return { count: 0, found: false };
    // Count non-null values in the column
    const count = table.rows.filter(row => row[columnName] !== null && row[columnName] !== undefined).length;
    return { count, found: true };
  }

  if (arg.type === 'Identifier') {
    const name = arg.name;
    // Check if it's a table name
    const table = context.tables?.[name];
    if (table) return { count: table.rows.length, found: true };
    // Otherwise column in current table — count non-null values
    if (context.currentTable) {
      const count = context.currentTable.rows.filter(row => row[name] !== null && row[name] !== undefined).length;
      return { count, found: true };
    }
    return { count: 0, found: false };
  }

  return { count: 0, found: false };
}

function evaluateAggregate(fnName: string, args: ASTNode[], context: FormulaContext, _depth: number): unknown {
  // COUNT with no args = count rows in current table
  if (fnName === 'count' && args.length === 0) {
    if (context.currentTable) {
      return context.currentTable.rows.length;
    }
    return 0;
  }

  if (args.length < 1) return null;
  const arg = args[0];

  if (fnName === 'count') {
    const { count, found } = resolveCountTarget(arg, context);
    if (!found) return 0;
    return count;
  }

  // SUM, AVG, MIN, MAX — need numeric column values
  const { values, found } = resolveColumnValues(arg, context);
  if (!found) return null;

  const numericValues = values
    .map(v => toNumber(v))
    .filter((v): v is number => v !== null);

  if (numericValues.length === 0) return null;

  switch (fnName) {
    case 'sum':
      return numericValues.reduce((a, b) => a + b, 0);
    case 'avg':
      return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    case 'min':
      return numericValues.reduce((a, b) => Math.min(a, b));
    case 'max':
      return numericValues.reduce((a, b) => Math.max(a, b));
    default:
      return null;
  }
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
