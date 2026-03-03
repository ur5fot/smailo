# Stage 5.5: Row Filtering in dataSource

## Overview

Add `filter` field to `dataSource` that allows components to display only a subset of table rows.
Solves the multi-page app problem: e.g. a task manager with pages per priority — each page binds
to the same table but shows only rows with matching column value.

Filter support: operators `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `contains`; single condition or
array (AND logic); default operator is `eq` if omitted.

Integrates with: `DataTable`, `CardList`, `Chart` (read-only display components). `Form` is
excluded — it writes to the table, filtering write targets doesn't make sense.

## Context (from discovery)

- **DataSource type**: `server/src/services/aiService.ts` lines 25–28 — currently `{ type, tableId }` only
- **Row fetching endpoint**: `server/src/routes/tables.ts` GET `/:tableId` — returns all rows, no filtering
- **Client fetch**: `client/src/stores/app.ts` `fetchTableRows()` — `GET /app/:hash/tables/:tableId`, no params
- **Client cache**: `tableData: Record<number, { schema, rows }>` — one entry per tableId; needs filter-aware key
- **DataSource validation**: `server/src/services/aiService.ts` lines 686–696
- **Components using dataSource**: `AppDataTable.vue`, `AppCardList.vue`, `AppChart.vue` (via `AppRenderer.vue`)
- **Test files**: `server/src/__tests__/validateUiComponents.test.ts`, `tables.test.ts`
- **Row data shape**: stored as JSON blob in `user_rows.data` column; in-memory filtering used (no SQL JSON ops needed)

## Development Approach

- **Testing approach**: Regular (code first, then tests)
- Complete each task fully before moving to the next
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- Maintain backward compatibility: `dataSource` without `filter` works exactly as before
- Server filters in memory after fetching rows (avoids complex SQLite JSON function queries)

## Testing Strategy

- **Unit tests**: vitest — server (`npm test --workspace=server`) and client (`npm test --workspace=client`)
- No E2E tests in this project

## Progress Tracking

- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix

## What Goes Where

- **Implementation Steps**: code changes, tests, documentation
- **Post-Completion**: manual UI/UX verification

## Implementation Steps

### Task 1: Define FilterCondition type + extend DataSource + server validation

- [x] add `FilterOperator` and `FilterCondition` types to `server/src/services/aiService.ts`
  ```ts
  export type FilterOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains';
  export type FilterCondition = {
    column: string;
    operator?: FilterOperator;   // defaults to 'eq'
    value: string | number | boolean;
  };
  ```
- [x] extend `DataSource` type: `filter?: FilterCondition | FilterCondition[]`
- [x] update dataSource validation in `validateUiComponents()` (aiService.ts lines ~686–696):
  - if `filter` present, validate it is an object or array of objects with `column: string`, optional `operator` from enum, `value` string|number|boolean
  - invalid `filter` is silently dropped (consistent with existing approach); tableId stays valid
  - `Form` component: `filter` is stripped (not applicable for writes)
- [x] write tests in `server/src/__tests__/validateUiComponents.test.ts`:
  - valid single filter `{ column, value }`
  - valid single filter with operator `{ column, operator: 'gt', value: 100 }`
  - valid array filter (AND logic)
  - invalid: unknown operator → filter dropped
  - invalid: missing column → filter dropped
  - invalid: value is object → filter dropped
  - Form component: filter stripped even if valid
  - backward compat: dataSource without filter still valid
- [x] run server tests — must pass before task 2: `npm test --workspace=server`

### Task 2: Server-side in-memory row filtering

- [x] create utility `server/src/utils/filterRows.ts`:
  ```ts
  export function applyFilter(rows: TableRow[], filter: FilterCondition | FilterCondition[]): TableRow[]
  ```
  - normalize single condition to array
  - for each condition: extract `row.data[column]`, apply operator comparison
  - `eq`: `==` (loose), `ne`: `!=`, `lt`/`lte`/`gt`/`gte`: numeric/date comparison, `contains`: case-insensitive string include
  - unknown column → condition passes (don't exclude rows for missing data)
  - operator default: `eq`
- [x] update `GET /:tableId` handler in `server/src/routes/tables.ts`:
  - accept `filter` query param (JSON string)
  - parse and validate via `parseFilter()` helper (or inline)
  - apply `applyFilter()` after `evaluateFormulaColumns()` call
  - malformed `filter` param → ignored (return all rows)
- [x] write tests in `server/src/__tests__/filterRows.test.ts` (new file):
  - eq: match, no match
  - ne: match, no match
  - lt/lte/gt/gte: numbers, dates as strings
  - contains: case-insensitive
  - missing column: row passes through (not excluded)
  - array of conditions (AND): all must match
  - invalid operator → ignored (row passes)
  - empty filter array → all rows returned
- [x] run server tests — must pass before task 3: `npm test --workspace=server`

### Task 3: Client store — filter-aware caching

- [ ] update `FilterCondition` type export to `client/src/stores/app.ts` (import from server types or re-declare)
- [ ] change `tableData` cache key from `number` to `string`:
  ```ts
  // Before: tableData: Record<number, { schema: TableSchema; rows: TableRow[] }>
  // After:  tableData: Record<string, { schema: TableSchema; rows: TableRow[] }>
  ```
  - cache key: `String(tableId)` for no filter; `${tableId}:${JSON.stringify(normalizedFilter)}` for filtered
  - `normalizedFilter` = array sorted by column name for stable key
- [ ] update `fetchTableRows(hash, tableId, filter?)`:
  - compute cache key
  - pass `filter` as JSON query param when present: `api.get(..., { params: { filter: JSON.stringify(filter) } })`
  - cache under the computed key
- [ ] update `refreshTable(hash, tableId, filter?)`:
  - invalidate and re-fetch using the correct cache key
- [ ] write tests in `client/src/stores/app.test.ts` (or existing client tests):
  - cache hit with same tableId + same filter
  - cache miss with same tableId + different filter
  - cache key is stable regardless of filter array ordering
  - refreshTable invalidates correct key
- [ ] run client tests — must pass before task 4: `npm test --workspace=client`

### Task 4: Wire filter through AppRenderer → components

- [ ] update `AppRenderer.vue`: pass `item.dataSource` (including `filter`) as prop to wrapper components
  - check how dataSource is currently passed; ensure `filter` field flows through
- [ ] update `AppDataTable.vue`:
  - extract `dataSource.filter` from props
  - pass `filter` to `fetchTableRows(hash, tableId, filter)`
  - pass `filter` to `appStore.refreshTable(hash, tableId, filter)` on data-written events
- [ ] update `AppCardList.vue` same as DataTable
- [ ] update `AppChart.vue` same as DataTable
  - `buildChartDataFromTable()` already works on the returned rows, no changes needed there
- [ ] run server + client tests: `npm test --workspace=server && npm test --workspace=client`

### Task 5: AI system prompts + CLAUDE.md

- [ ] update `BRAINSTORM_SYSTEM_PROMPT` in `server/src/services/aiService.ts`:
  - add `filter` field to dataSource documentation block
  - show shorthand example: `{ "type": "table", "tableId": 1, "filter": { "column": "priority", "value": "high" } }`
  - show extended example: array with operators
  - note: `Form` does not support `filter`
- [ ] update `IN_APP_SYSTEM_PROMPT` same additions
- [ ] update `CLAUDE.md` App config JSON shape section:
  - extend `dataSource` type comment: `filter?: FilterCondition | FilterCondition[]`
  - document `FilterCondition` inline
- [ ] update tests in `server/src/__tests__/buildSystemPrompt.test.ts` if it checks prompt content for dataSource; add assertion that prompts mention `filter`
- [ ] run server tests — must pass before task 6: `npm test --workspace=server`

### Task 6: Verify acceptance criteria

- [ ] verify DataTable with `filter` shows only matching rows
- [ ] verify CardList with `filter` shows only matching rows
- [ ] verify Chart with `filter` uses only matching rows for datasets
- [ ] verify Form ignores `filter` field (stripped during validation)
- [ ] verify dataSource without `filter` still works (backward compat)
- [ ] verify multiple filters (AND) work correctly
- [ ] verify all operators work: eq, ne, lt, lte, gt, gte, contains
- [ ] run full server tests: `npm test --workspace=server`
- [ ] run full client tests: `npm test --workspace=client`

### Task 7: [Final] Update documentation

- [ ] update `README.md`: add dataSource filter to feature list / config reference
- [ ] update `README.ru.md`: same in Russian
- [ ] update roadmap `docs/roadmap-v2.md`: mark Stage 5.5 as ✅ Реализован

*Note: ralphex automatically moves completed plans to `docs/plans/completed/`*

## Technical Details

**DataSource extended type:**
```ts
export type FilterOperator = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'contains';
export type FilterCondition = {
  column: string;
  operator?: FilterOperator;   // defaults to 'eq'
  value: string | number | boolean;
};
export type DataSource = {
  type: 'table';
  tableId: number;
  filter?: FilterCondition | FilterCondition[];
};
```

**Cache key strategy:**
```
no filter:  "5"
filtered:   '5:[{"column":"priority","operator":"eq","value":"high"}]'
```
Filter conditions normalized to array, sorted by `column` for stable key.

**In-memory filtering logic (server):**
- Runs AFTER `evaluateFormulaColumns()` so formula column values are available for filtering
- Unknown column → condition is skipped (row passes); avoids breaking existing apps
- `contains` is case-insensitive (`String(val).toLowerCase().includes(...)`)
- Date comparison: ISO string lexicographic works for `lt/gt` (YYYY-MM-DD format)

**AI config examples:**
```json
// Single condition (shorthand, operator defaults to eq)
{ "type": "table", "tableId": 1, "filter": { "column": "priority", "value": "high" } }

// With explicit operator
{ "type": "table", "tableId": 2, "filter": { "column": "amount", "operator": "gt", "value": 100 } }

// Multiple conditions (AND)
{ "type": "table", "tableId": 1, "filter": [
  { "column": "status", "value": "active" },
  { "column": "score", "operator": "gte", "value": 80 }
]}
```

## Post-Completion

**Manual verification:**
- Create a multi-page task app in UI; verify each page filters correctly by priority
- Test with Chart: verify filtered data produces correct chart (not all-rows chart)
- Test backward compat: open existing app without filter — verify no regressions
