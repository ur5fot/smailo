# Data Source Binding — Stage 2 of Low-Code Roadmap

## Overview
- Bind UI components (DataTable, Form, Chart, CardList) to user-defined tables, not just flat KV `appData`
- New `dataSource` field in component config: `{ type: "table", tableId }` as alternative to `dataKey`
- Lazy loading: table schemas arrive with the app, rows are fetched on demand per table
- Backward compatible: existing apps with `dataKey` continue working unchanged

## Context (from discovery)
- **Backend tables API**: Fully implemented — CRUD for tables and rows at `/api/app/:hash/tables`
- **DB schema**: `userTables` + `userRows` with FK cascades, validation, limits
- **AI already generates tables** during app creation (`validateTableDefs()`)
- **Current gap**: Components only bind to flat KV `appData` via `dataKey` / `resolveDataKey()`
- **`GET /api/app/:hash`** returns table schemas but NOT rows
- **No test infrastructure** — vitest needs to be set up

## Development Approach
- **Testing approach**: Regular (code first, then tests)
- Set up vitest for server first since that's where the critical logic lives
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: vitest for server-side validation, data resolution, and API endpoints
- **Client**: TypeScript compilation check (`npx vue-tsc`) — no component test framework in scope
- No e2e tests in this project

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Set up vitest for server
- [x] Install vitest as devDependency in `server/`
- [x] Create `server/vitest.config.ts` (resolve `.js` imports to `.ts` for ESM compat)
- [x] Add `"test"` script to `server/package.json`
- [x] Create a smoke test `server/src/__tests__/smoke.test.ts` that imports something and passes
- [x] Run tests — must pass before next task

### Task 2: Add `dataSource` type and validation to server
- [ ] Extend `UiComponent` type in `aiService.ts` with optional `dataSource?: { type: 'table'; tableId: number }`
- [ ] Update `validateUiComponents()` to validate `dataSource` field: if present, must have `type === 'table'` and `tableId` must be a positive integer; drop invalid dataSource (set to undefined) rather than rejecting the entire component
- [ ] Update `UiConfigItem` interface in `AppRenderer.vue` to include `dataSource`
- [ ] Write tests for `validateUiComponents()` with dataSource (valid, invalid, missing)
- [ ] Run tests — must pass before next task

### Task 3: Update AI system prompts for dataSource
- [ ] Update `BRAINSTORM_SYSTEM_PROMPT` — add dataSource documentation for DataTable, Form, Chart, CardList components; remove "coming in a future update" note from tables section
- [ ] Add examples: DataTable with `dataSource: { type: "table", tableId: 1 }`, Form with `dataSource`, Chart with `dataSource`, CardList with `dataSource`
- [ ] Update `IN_APP_SYSTEM_PROMPT` — add dataSource to uiUpdate component guide; remove "coming in future update"
- [ ] Explain when to use `dataSource` vs `dataKey`: tables for structured lists (expenses, tasks), KV for single values (counters, settings, API data)
- [ ] Update AI context in `chatWithAI()` to include table row counts (not full rows — too large) so AI knows which tables have data
- [ ] Write tests verifying prompt includes table context when tables exist
- [ ] Run tests — must pass before next task

### Task 4: Client store — table data management
- [ ] Add `tableData` ref to `app.ts` store: `Map<number, { schema: TableSchema; rows: TableRow[] }>` (using plain reactive ref)
- [ ] Add `tableSchemas` ref populated from `fetchApp()` response (already returned as `tables`)
- [ ] Add `fetchTableRows(hash: string, tableId: number): Promise<TableRow[]>` — calls `GET /api/app/:hash/tables/:tableId`, caches result in `tableData`, returns rows
- [ ] Add `getTableData(tableId: number)` computed/getter — returns cached `{ schema, rows }` or `{ schema, rows: [] }` if not yet loaded
- [ ] Add `refreshTable(hash: string, tableId: number)` — re-fetches rows for a specific table (called after Form writes a row)
- [ ] Ensure `fetchApp()` clears `tableData` cache on full reload
- [ ] TypeScript compiles cleanly (`npm run build --workspace=server`)

### Task 5: AppRenderer — dataSource resolution and plumbing
- [ ] Import table-related types and composable
- [ ] In `AppRenderer.vue`, detect `item.dataSource?.type === 'table'` and pass `tableId` + `hash` to components that support it
- [ ] Update `AppDataTable` rendering branch to pass `dataSource` prop when present
- [ ] Update `AppForm` rendering branch to pass `dataSource` prop when present
- [ ] Update `AppCardList` rendering branch to pass `dataSource` prop when present
- [ ] For `Chart` with `dataSource`, pass `dataSource` prop to the dynamic `<component>`
- [ ] Components without `dataSource` continue using `resolvedProps(item)` unchanged
- [ ] TypeScript compiles cleanly (`npx vue-tsc --noEmit` in client)

### Task 6: AppDataTable — table binding
- [ ] Add optional `dataSource` and `hash` props to `AppDataTable.vue`
- [ ] When `dataSource.type === 'table'`, use the app store to fetch/get table data by `tableId`
- [ ] Auto-generate columns from table schema (use `columns[].name` as `field`, `columns[].name` as `header`) — better than data-driven since schema is always available
- [ ] Allow explicit `columns` prop to override auto-generated ones
- [ ] Show loading state while rows are being fetched
- [ ] Handle empty table (show existing "Записей пока нет." message)
- [ ] When `dataSource` is absent, keep existing `value` prop behavior unchanged (backward compatible)
- [ ] Write server-side tests for the `GET /api/app/:hash/tables/:tableId` response shape
- [ ] Run tests — must pass before next task

### Task 7: AppForm — table row writing
- [ ] Add optional `dataSource` and `hash` props to `AppForm.vue`
- [ ] When `dataSource.type === 'table'`, auto-generate form fields from table schema columns (name→label, type→input type)
- [ ] Map column types to form field types: `text`→InputText, `number`→InputNumber, `date`→DatePicker (calendar), `boolean`→Checkbox, `select`→Dropdown
- [ ] On submit, call `POST /api/app/:hash/tables/:tableId/rows` with `{ data: { ... } }` instead of KV `POST /api/app/:hash/data`
- [ ] After successful submit, call `appStore.refreshTable(hash, tableId)` so DataTable/CardList/Chart update
- [ ] Emit `'data-written'` event for consistency (AppView handles refresh)
- [ ] Handle required fields from schema (show validation errors)
- [ ] Handle `select` type columns — render as dropdown with column's `options`
- [ ] When `dataSource` is absent, keep existing `outputKey` + KV behavior unchanged
- [ ] Write server-side tests for table row creation via `POST /tables/:tableId/rows` with typed validation
- [ ] Run tests — must pass before next task

### Task 8: AppCardList — table row display + delete
- [ ] Add optional `dataSource` and `hash` props to `AppCardList.vue`
- [ ] When `dataSource.type === 'table'`, fetch table data via store and render each row as a card
- [ ] Use table schema columns to render key-value pairs per row (column name → label, row data → value)
- [ ] Delete button calls `DELETE /api/app/:hash/tables/:tableId/rows/:rowId` instead of KV delete
- [ ] After delete, call `appStore.refreshTable(hash, tableId)` to update other bound components
- [ ] When `dataSource` is absent, keep existing KV array behavior unchanged
- [ ] Write server-side tests for row deletion endpoint
- [ ] Run tests — must pass before next task

### Task 9: Chart — table data binding
- [ ] When `Chart` receives `dataSource.type === 'table'`, fetch table data via store
- [ ] Build Chart.js-compatible data structure from table rows: use first column as labels, numeric columns as datasets
- [ ] Create a utility function `buildChartDataFromTable(schema, rows, chartType)` in a shared util
- [ ] Pass the built data as the `data` prop to PrimeVue Chart
- [ ] Handle edge cases: no rows → empty chart, no numeric columns → skip
- [ ] When `dataSource` is absent, keep existing `dataKey` behavior unchanged
- [ ] Write tests for `buildChartDataFromTable()` utility
- [ ] Run tests — must pass before next task

### Task 10: AppView — table-aware data refresh
- [ ] Update `handleDataWritten()` in `AppView.vue` to also refresh any cached table data (or rely on component-level refresh via store)
- [ ] Update `handleRefresh()` to clear table data cache so next render re-fetches
- [ ] Verify the full flow: Form submits row → DataTable shows new row → Chart updates → CardList updates
- [ ] TypeScript compiles cleanly for both client and server

### Task 11: Verify acceptance criteria
- [ ] Verify DataTable can display rows from a user-defined table via `dataSource`
- [ ] Verify Form can write rows to a user-defined table via `dataSource`
- [ ] Verify Chart can build graphs from table data via `dataSource`
- [ ] Verify CardList can display table rows as cards with delete support
- [ ] Verify existing apps with `dataKey` still work (backward compatibility)
- [ ] Run full test suite
- [ ] Server TypeScript compiles (`npm run build --workspace=server`)
- [ ] Client TypeScript compiles (`npx vue-tsc --noEmit`)

### Task 12: [Final] Update documentation
- [ ] Update `CLAUDE.md` — add dataSource to app config JSON shape, document table-binding in component descriptions
- [ ] Update `README.md` and `README.ru.md` — mention Stage 2 table binding in features
- [ ] Update `docs/roadmap-v2.md` — mark Stage 2 as completed

## Technical Details

### dataSource field shape
```typescript
interface DataSource {
  type: 'table'
  tableId: number
}
```
Added to `UiComponent` as optional field alongside existing `dataKey`. When `dataSource` is present, it takes priority over `dataKey`.

### Client table data flow
```
AppView.vue
  → AppRenderer.vue (detects dataSource, passes tableId + hash)
    → AppDataTable.vue (calls appStore.fetchTableRows, renders rows)
    → AppForm.vue (auto-generates fields from schema, POSTs to tables API)
    → AppCardList.vue (fetches rows, renders as cards, deletes via tables API)
    → Chart (via wrapper logic, builds chart data from table rows)
```

### Store table data cache
```typescript
// In app.ts store
const tableData = ref<Record<number, { schema: TableSchema; rows: TableRow[] }>>({})

async function fetchTableRows(hash: string, tableId: number) {
  const res = await api.get(`/app/${hash}/tables/${tableId}`)
  tableData.value[tableId] = { schema: res.data, rows: res.data.rows }
  return res.data.rows
}

function refreshTable(hash: string, tableId: number) {
  return fetchTableRows(hash, tableId)  // re-fetch and cache
}
```

### Form field type mapping (table schema → form input)
| Column type | Form input |
|---|---|
| text | InputText |
| number | InputNumber |
| date | DatePicker |
| boolean | Checkbox |
| select | Dropdown (with column.options) |

## Post-Completion

**Manual verification:**
- Create a test app via chat with tables (e.g., expense tracker)
- Verify AI generates `dataSource` bindings in config
- Test Form → DataTable → Chart data flow with real table data
- Test CardList delete functionality with table rows
- Verify old apps without tables still work

**Roadmap update:**
- Mark Stage 2 as completed in `docs/roadmap-v2.md`
- Consider if Stage 3 (Formulas) or Stage 5 (Multi-page) is the better next step
