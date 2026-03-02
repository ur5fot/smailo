# Формулы и вычисляемые поля — Этап 3 дорожной карты Low-Code

## Overview
- Полноценный движок формул для Smailo: арифметика, сравнения, строковые операции, IF/THEN, агрегатные функции
- Безопасный парсер (рекурсивный спуск, без eval) — полный контроль над синтаксисом и безопасностью
- Два применения формул:
  1. **Вычисляемые колонки** в таблицах: `{ name: "total", type: "formula", formula: "price * quantity" }` — вычисляются per-row на сервере при чтении
  2. **computedValue на компонентах**: `computedValue: "= SUM(expenses.amount)"` — агрегаты по таблицам, вычисляются на сервере
- Замена текущего `compute` cron job на формулы (обратная совместимость через обёртку)
- Вычисления исключительно на сервере — клиент получает готовые значения

## Context (from discovery)
- **Текущие compute/aggregate cron jobs** — `cronManager.ts`: `compute` поддерживает только `date_diff`, `aggregate_data` считает avg/sum/count/max/min по appData. Оба хранят результат в appData
- **Таблицы (Этап 1-2)** — `userTables` + `userRows` + CRUD API + привязка к компонентам через `dataSource`
- **Типы колонок** — text, number, date, boolean, select. Нужно добавить `formula`
- **Валидация** — `tableValidation.ts`: `isValidColumnDef()`, `validateRowData()` — нужно расширить для формул
- **AppRenderer** — `resolveDataKey()` привязывает данные к компонентам через `dataKey`. Нужно добавить `computedValue`
- **AI промпты** — документируют таблицы и dataSource. Нужно добавить формулы
- **Тесты** — vitest настроен, 112 тестов в 5 файлах. Парсер формул — идеальный кандидат для unit-тестов

## Development Approach
- **Testing approach**: Regular (код сначала, потом тесты)
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: vitest for formula parser, evaluator, validation, API endpoints
- **Client**: TypeScript compilation check (`npx vue-tsc`) — no component test framework in scope
- No e2e tests in this project

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Formula tokenizer and AST parser
- [x] Create `server/src/utils/formula/tokenizer.ts`:
  - Token types: `Number`, `String`, `Boolean`, `Identifier`, `Operator`, `LeftParen`, `RightParen`, `Comma`, `Dot`
  - Operators: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`
  - String literals: double-quoted `"hello"`, with escape sequences
  - Boolean literals: `true`, `false`
  - Identifiers: alphanumeric + underscore, starting with letter
  - Max formula length: 500 characters
- [x] Create `server/src/utils/formula/parser.ts` — recursive descent:
  - AST nodes: `NumberLiteral`, `StringLiteral`, `BooleanLiteral`, `Identifier`, `BinaryOp`, `UnaryOp`, `FunctionCall`, `MemberAccess`
  - Operator precedence (low → high): `||`, `&&`, `==`/`!=`, `<`/`>`/`<=`/`>=`, `+`/`-`, `*`/`/`/`%`, unary `-`/`!`, function call, member access (`.`)
  - Parenthesized expressions
  - Function calls: `FUNC(arg1, arg2, ...)`
  - Member access: `tableName.columnName`
- [x] Create `server/src/utils/formula/index.ts` — public API re-exports
- [x] Write tests for tokenizer: all token types, edge cases (empty, max length, unterminated string)
- [x] Write tests for parser: all AST node types, precedence, nested expressions, error cases
- [x] Run tests — must pass before next task

### Task 2: Formula evaluator — core operations
- [x] Create `server/src/utils/formula/evaluator.ts`:
  - `evaluate(ast: ASTNode, context: FormulaContext): unknown`
  - `FormulaContext` type: `{ row?: Record<string, unknown>; tables?: Record<string, { columns: ColumnDef[]; rows: RowData[] }> }`
  - Arithmetic: `+` (also string concatenation), `-`, `*`, `/`, `%`
  - Division by zero → `null`
  - Comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=` — type coercion for numbers/strings
  - Logic: `&&`, `||`, `!` — truthy/falsy semantics
  - Unary: `-` (negate), `!` (not)
  - Identifier resolution: look up in `context.row` first
  - MemberAccess: `a.b` → `context.row?.a?.b` or `context.tables?.a` (for aggregates)
  - Safety: max AST depth 20, recursion limit
- [x] Create public API: `evaluateFormula(formula: string, context: FormulaContext): unknown` — tokenize → parse → evaluate
- [x] Write tests for evaluator: arithmetic, comparisons, logic, variable resolution, division by zero, depth limit
- [x] Run tests — must pass before next task

### Task 3: Built-in functions
- [x] Add function registry to evaluator:
  - **Conditional**: `IF(condition, thenValue, elseValue)`
  - **Math**: `ABS(n)`, `ROUND(n, decimals?)`, `FLOOR(n)`, `CEIL(n)`, `MIN(a, b)`, `MAX(a, b)`
  - **String**: `UPPER(s)`, `LOWER(s)`, `CONCAT(s1, s2, ...)`, `LEN(s)`, `TRIM(s)`
  - **Date**: `NOW()` — returns ISO 8601 string
- [x] Function names are case-insensitive (`sum` = `SUM` = `Sum`)
- [x] Type validation in functions: return `null` on type mismatch (e.g., `ABS("hello")`)
- [x] Write tests for each function: normal cases, edge cases, type errors
- [x] Run tests — must pass before next task

### Task 4: Aggregate functions
- [x] Add aggregate functions to evaluator:
  - `SUM(column)` — sum numeric values in a column
  - `AVG(column)` — average of numeric values
  - `COUNT(tableOrColumn)` — count rows (no args = current table, or `COUNT(tableName)`)
  - `MIN(column)` — minimum value
  - `MAX(column)` — maximum value
- [x] Resolution of aggregate arguments:
  - In formula columns (row context): `SUM(amount)` → aggregate over current table's `amount` column
  - In computedValue (app context): `SUM(expenses.amount)` → aggregate over `expenses` table's `amount` column
  - `COUNT(tasks)` → count rows in `tasks` table
- [x] Handle edge cases: empty table → `null` for SUM/AVG/MIN/MAX, `0` for COUNT; non-numeric values skipped
- [x] Write tests for aggregates: normal data, empty table, mixed types, table not found
- [x] Run tests — must pass before next task

### Task 5: Formula column type in table schema
- [ ] Add `'formula'` to `ColumnType` in `server/src/utils/tableValidation.ts`
- [ ] Add optional `formula?: string` field to `ColumnDef`
- [ ] Update `isValidColumnDef()`: if type is `formula`, `formula` string must be present and parseable (call parser to validate syntax)
- [ ] Update `validateRowData()`: skip formula columns (they are read-only, not submitted by user)
- [ ] Update `validateTableDefs()` in `server/src/routes/chat.ts` if it validates column types
- [ ] Write tests for formula column validation: valid formula, invalid syntax, missing formula field, formula column skipped in row data
- [ ] Run tests — must pass before next task

### Task 6: Server-side formula column evaluation in table rows
- [ ] Update `GET /api/app/:hash/tables/:tableId` in `server/src/routes/tables.ts`:
  - After fetching rows, identify formula columns in schema
  - For each row, evaluate each formula column with row data as context
  - Add table-level context for aggregate functions within formula columns
  - Inject computed values into row's `data` object
- [ ] Error handling: if formula evaluation fails, set value to `null`
- [ ] Formula columns appear in response like regular columns (transparent to client)
- [ ] Write tests: formula column evaluation with row data, aggregate in formula column, error handling
- [ ] Run tests — must pass before next task

### Task 7: computedValue on UI components
- [ ] Add optional `computedValue?: string` to `UiComponent` type in `server/src/services/aiService.ts`
- [ ] Update `validateUiComponents()`: if `computedValue` present, strip `= ` prefix and validate formula syntax
- [ ] Update `GET /api/app/:hash/data` endpoint in `server/src/routes/app.ts`:
  - Read app config to find components with `computedValue`
  - Fetch all referenced tables (by name from formulas)
  - Evaluate each formula with table context
  - Return `{ appData: [...], computedValues: Record<number, unknown> }` — key is component index in uiComponents array
- [ ] Write tests for computedValue validation and evaluation endpoint
- [ ] Run tests — must pass before next task

### Task 8: Client integration
- [ ] Add `computedValues` to app store (`client/src/stores/app.ts`):
  - New ref: `computedValues: Record<number, unknown>`
  - Update `fetchData()` to store computedValues from response
  - Clear on `fetchApp()`
- [ ] Update `AppRenderer.vue`:
  - If component has `computedValue`, resolve from `appStore.computedValues[index]` instead of `dataKey`
  - Priority: `dataSource` > `computedValue` > `dataKey`
- [ ] Update `AppForm.vue`: skip formula columns when generating form fields (read-only)
- [ ] Update `AppDataTable.vue`: formula columns display normally (values come pre-computed from server)
- [ ] Update `AppChart.vue` / `chartData.ts`: formula columns are numeric and usable in charts
- [ ] TypeScript compiles cleanly for both client and server

### Task 9: AI prompt updates
- [ ] Update `BRAINSTORM_SYSTEM_PROMPT` in `aiService.ts`:
  - Document formula column type: `{ name: "total", type: "formula", formula: "price * quantity" }`
  - Document computedValue on components: `computedValue: "= SUM(expenses.amount)"`
  - List available functions: IF, UPPER, LOWER, CONCAT, LEN, TRIM, ABS, ROUND, FLOOR, CEIL, MIN, MAX, NOW, SUM, AVG, COUNT
  - Examples for common patterns: totals, averages, conditional values, string formatting
  - Guidance: when to use formula columns vs computedValue vs cron aggregate_data
- [ ] Update `IN_APP_SYSTEM_PROMPT`:
  - Add formula syntax to uiUpdate component guide
  - Document computedValue as alternative to dataKey
- [ ] Write tests verifying prompt includes formula documentation
- [ ] Run tests — must pass before next task

### Task 10: Backward compatibility with compute cron
- [ ] Verify existing `compute` cron job (date_diff) still works unchanged
- [ ] Verify existing `aggregate_data` cron job still works unchanged
- [ ] Add note in AI prompts: prefer formula columns and computedValue for new apps, keep cron for scheduled/periodic computations
- [ ] Run full test suite — all existing tests must pass
- [ ] Run tests — must pass before next task

### Task 11: Verify acceptance criteria
- [ ] Verify formula parser handles: arithmetic, comparisons, logic, IF/THEN, string ops, nested expressions
- [ ] Verify formula columns evaluate correctly in table row responses
- [ ] Verify computedValue evaluates correctly in app data responses
- [ ] Verify aggregate functions (SUM, AVG, COUNT, MIN, MAX) work across table data
- [ ] Verify existing apps with dataKey/dataSource still work (backward compatibility)
- [ ] Verify existing compute/aggregate cron jobs still work
- [ ] Run full test suite
- [ ] Server TypeScript compiles (`npm run build --workspace=server`)
- [ ] Client TypeScript compiles (`npx vue-tsc --noEmit`)

### Task 12: [Final] Update documentation
- [ ] Update `CLAUDE.md` — add formula column type, computedValue, formula syntax documentation
- [ ] Update `README.md` and `README.ru.md` — mention Stage 3 formulas in features
- [ ] Update `docs/roadmap-v2.md` — mark Stage 3 as completed

## Technical Details

### Formula syntax

**Row-level (formula columns):**
```
price * quantity
IF(status == "active", amount, 0)
CONCAT(first_name, " ", last_name)
ROUND(total / count, 2)
UPPER(category)
```

**Component-level (computedValue):**
```
= SUM(expenses.amount)
= COUNT(tasks)
= AVG(ratings.score)
= MAX(orders.total) - MIN(orders.total)
```

### AST node types
```typescript
type ASTNode =
  | { type: 'NumberLiteral'; value: number }
  | { type: 'StringLiteral'; value: string }
  | { type: 'BooleanLiteral'; value: boolean }
  | { type: 'Identifier'; name: string }
  | { type: 'BinaryOp'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'UnaryOp'; op: string; operand: ASTNode }
  | { type: 'FunctionCall'; name: string; args: ASTNode[] }
  | { type: 'MemberAccess'; object: ASTNode; property: string }
```

### Evaluation context
```typescript
interface FormulaContext {
  row?: Record<string, unknown>       // current row data (for formula columns)
  tables?: Record<string, {           // all tables (for aggregates/computedValue)
    columns: ColumnDef[]
    rows: Array<Record<string, unknown>>
  }>
  currentTable?: {                    // current table (for formula columns with aggregates)
    columns: ColumnDef[]
    rows: Array<Record<string, unknown>>
  }
}
```

### Built-in functions
| Category | Functions |
|---|---|
| Conditional | `IF(cond, then, else)` |
| Math | `ABS(n)`, `ROUND(n, dec?)`, `FLOOR(n)`, `CEIL(n)`, `MIN(a, b)`, `MAX(a, b)` |
| String | `UPPER(s)`, `LOWER(s)`, `CONCAT(s1, s2, ...)`, `LEN(s)`, `TRIM(s)` |
| Date | `NOW()` |
| Aggregate | `SUM(col)`, `AVG(col)`, `COUNT(tbl?)`, `MIN(col)`, `MAX(col)` |

### Safety constraints
- Max formula length: 500 characters
- Max AST depth: 20
- No eval, no Function constructor
- Identifier access only from provided context
- Division by zero → `null`
- Type mismatch in functions → `null`
- Missing references → `null`

### Data flow — formula columns
```
Client: GET /api/app/:hash/tables/:tableId
  ↓
Server: fetch rows from DB
  ↓
Server: identify formula columns in schema
  ↓
Server: for each row, evaluate formula columns with {row, currentTable}
  ↓
Server: inject computed values into row.data
  ↓
Response: rows include formula column values (transparent to client)
```

### Data flow — computedValue
```
Client: GET /api/app/:hash/data
  ↓
Server: fetch appData as usual
  ↓
Server: read app config, find components with computedValue
  ↓
Server: fetch referenced tables by name
  ↓
Server: evaluate each formula with {tables}
  ↓
Response: { appData: [...], computedValues: { 0: 1500, 2: 42 } }
  ↓
Client: AppRenderer resolves computedValues[componentIndex]
```

### ColumnDef extension
```typescript
// Existing
type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'select'

// New
type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'formula'

interface ColumnDef {
  name: string
  type: ColumnType
  required?: boolean
  options?: string[]     // for 'select'
  formula?: string       // for 'formula' — expression to evaluate
}
```

### UiComponent extension
```typescript
interface UiComponent {
  component: string
  props: Record<string, unknown>
  dataKey?: string
  dataSource?: { type: 'table'; tableId: number }
  computedValue?: string  // NEW: "= SUM(expenses.amount)"
  // ... existing fields
}
```

## Post-Completion

**Manual verification:**
- Create a test app with formula columns (e.g., invoice: items table with price, quantity, total=price*quantity)
- Verify formula column values appear correctly in DataTable, Chart, CardList
- Test computedValue on Card component with SUM/AVG/COUNT
- Test error handling: division by zero, missing references
- Test backward compatibility: old apps with compute cron, aggregate_data cron
- Verify AI generates formula columns and computedValue in new apps

**Roadmap update:**
- Mark Stage 3 as completed in `docs/roadmap-v2.md`
- Stage 4 (Conditional Logic) depends on this parser — document readiness
