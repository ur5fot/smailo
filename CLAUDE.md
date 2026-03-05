# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## README Policy

This project has two READMEs that must stay in sync: `README.md` (English) and `README.ru.md` (Russian). Update both before any commit that changes functionality, setup, or architecture.

## Commands

```sh
# Development (starts client on :5173 and server on :3000 concurrently)
npm run dev

# Initialize DB (run once after cloning or schema changes)
npm run db:push

# Build client for production
npm run build

# Start production server
npm run start

# Type-check server only
npm run build --workspace=server

# Type-check client only
npx vue-tsc --workspace=client
```

Server tests use vitest (`npm test --workspace=server`). Client tests use vitest (`npm test --workspace=client`). There is no linter configured.

## Architecture

### Monorepo structure

```
smailo/
├── client/   Vue 3 + Vite frontend
└── server/   Express + TypeScript backend
```

npm workspaces; root `package.json` has scripts that delegate to both. Server uses TypeScript strict mode.

### Routes

```
/                        → HomeView       (landing: create user or enter existing userId)
/:userId                 → UserView       (user's app list + AI chat for creating apps)
/:userId/:hash           → AppView        (two-column: app left, AI assistant right; redirects to first page if multi-page)
/:userId/:hash/:pageId   → AppView        (specific page of a multi-page app)
/app/:hash               → AppView        (backward-compatible; userId = null)
/invite/:hash/:token     → InviteView     (accept invite link — login/create user, then join app)
```

### App lifecycle (the core flow)

Users first get a `userId` (10-char nanoid stored in `localStorage` as `smailo_user_id`). Apps are then created through a **three-phase home chat** (`POST /api/chat`):

1. **brainstorm** — AI asks clarifying questions about the app idea
2. **confirm** — AI returns an `appConfig` JSON for the user to review
3. **created** — user confirms; server creates the app row, generates a 64-char hex `hash`, schedules cron jobs, and creates user-defined tables; `userId` is saved in `apps.userId`

Once created, the app lives at `/:userId/:hash`. The old `/app/:hash` route is kept for backward compatibility. Inside the app, a separate **chat** phase (`POST /api/app/:hash/chat`) lets the user update the UI layout via `uiUpdate`.

Phase transitions are enforced server-side: `created` can only follow `confirm` — AI cannot skip phases.

### AI service (`server/src/services/aiService.ts`)

Single `chatWithAI(messages, phase, appContext?)` function. Always returns a JSON `ClaudeResponse`. Two system prompts:
- **`BRAINSTORM_SYSTEM_PROMPT`** — used for `brainstorm`/`confirm`/`created` phases
- **`IN_APP_SYSTEM_PROMPT`** — used for `chat` phase; receives truncated app config + data as context

Provider is selected at runtime via `AI_PROVIDER` env var (`anthropic` or `deepseek`). The Anthropic model is overridable via `ANTHROPIC_MODEL` env var (default: `claude-sonnet-4-6`). Clients are lazily initialized singletons. AI response is always JSON — `parseResponse()` uses a brace-counting parser (`extractJson()`) that tracks brace depth while respecting string literals and escape sequences, then validates/sanitizes all fields.

### App config JSON shape

The AI generates and the server stores configs in this shape (cronJobs are stored separately in the `cron_jobs` table; tables are stored in the `user_tables` table — neither is kept in `apps.config`):

```ts
{
  appName: string
  description: string
  uiComponents: Array<{
    component: 'Card' | 'DataTable' | 'Chart' | 'Timeline' | 'Knob' | 'Tag' | 'ProgressBar' | 'Calendar'
             | 'Button' | 'InputText' | 'Form'
             | 'Accordion' | 'Panel' | 'Chip' | 'Badge' | 'Slider' | 'Rating' | 'Tabs' | 'Image' | 'MeterGroup'
             | 'CardList' | 'ConditionalGroup'
    props: Record<string, unknown>  // component-specific, no 'on*' props
    dataKey?: string                // key into appData to bind as value/data prop
    dataSource?: { type: 'table'; tableId: number; filter?: FilterCondition | FilterCondition[] }  // bind to user-defined table; filter limits rows shown (display components only, not Form)
    // FilterCondition: { column: string; operator?: 'eq'|'ne'|'lt'|'lte'|'gt'|'gte'|'contains'; value: string|number|boolean }
    // Input component fields (top-level, NOT inside props):
    actions?: ActionStep[]             // action chain for Button/InputText/Form (see ActionStep types below)
    // ActionStep types (executed sequentially, max 5 per chain):
    //   WriteDataAction:   { type: 'writeData'; key: string; value?: unknown; mode?: 'append' | 'increment' | 'delete-item'; index?: number }
    //   NavigateToAction:  { type: 'navigateTo'; pageId: string }                    — multi-page apps only
    //   ToggleVisAction:   { type: 'toggleVisibility'; key: string }                 — toggles boolean, pair with showIf
    //   RunFormulaAction:  { type: 'runFormula'; formula: string; outputKey: string } — client-side formula eval
    //   FetchUrlAction:    { type: 'fetchUrl'; url: string; outputKey: string; dataPath?: string } — HTTPS proxy fetch
    // Legacy `action?: { key; value? }` field still read by client for old apps not yet re-saved
    fields?: Array<{ name: string; type: 'text' | 'number'; label: string }>  // Form only; `name` must match /^[a-zA-Z0-9_]{1,100}$/ and 'timestamp' is reserved (auto-injected)
    outputKey?: string             // Form only: appData key for the submitted object
    computedValue?: string         // server-evaluated formula: "= SUM(expenses.amount)" — alternative to dataKey for display components
    // Conditional logic fields:
    showIf?: string                // client-evaluated formula; component hidden when falsy (e.g. "status == \"active\"" — note: only double-quoted strings are supported)
    styleIf?: Array<{ condition: string; class: string }>  // conditional CSS classes applied when condition is truthy
    // ConditionalGroup fields (only when component == 'ConditionalGroup'):
    condition?: string             // formula evaluated on client; group shown when truthy
    children?: UiComponent[]       // nested components shown/hidden together (max 1 level deep)
    // Layout fields (CSS Grid placement):
    layout?: { col: number; colSpan: number; row?: number; rowSpan?: number }  // col 1-12, colSpan 1-12, col+colSpan ≤ 13; without layout → full-width (grid-column: 1 / -1)
  }>
  pages?: Array<{                  // optional multi-page mode; if present, uiComponents is ignored for rendering
    id: string                     // URL-safe: /^[a-zA-Z0-9_-]{1,50}$/, unique across pages
    title: string                  // tab label, max 100 chars
    icon?: string                  // optional PrimeVue icon name with "pi " prefix, max 50 chars (e.g. "pi pi-home")
    uiComponents: UiComponent[]    // per-page components, max 20 each
  }>                               // max 10 pages per app
}
```

When `pages` is present the app enters multi-page mode: AppView renders PrimeVue tab navigation above the content area, the active page is reflected in the URL as `/:userId/:hash/:pageId`, and navigating to `/:userId/:hash` automatically redirects to the first page. `computedValues` from the server use global component indices (flatMap of all pages); the client maps them to local per-page indices via an offset calculated from preceding pages.

AI response may include `pagesUpdate?: Page[]` (replaces entire `config.pages`). `uiUpdate` still works for single-page apps.

### Dynamic UI rendering (`client/src/components/AppRenderer.vue`)

Uses CSS Grid (12 columns, 1rem gap) to render components. Each component's position is determined by `item.layout` (`grid-column: col / span colSpan`); components without layout default to `grid-column: 1 / -1` (full-width). On mobile (<=767px) all components are forced full-width. Iterates `uiConfig` array and renders each component dynamically. Eleven components use dedicated wrappers:
- `Card` → `AppCard.vue`, `DataTable` → `AppDataTable.vue`, `CardList` → `AppCardList.vue`, `Chart` → `AppChart.vue` (data display)
- `Button` → `AppButton.vue`, `InputText` → `AppInputText.vue`, `Form` → `AppForm.vue` (user input)
- `Accordion` → `AppAccordion.vue`, `Panel` → `AppPanel.vue`, `Tabs` → `AppTabs.vue` (slot-based layout)
- `ConditionalGroup` → `AppConditionalGroup.vue` (conditional visibility container)

All others use `<component :is="...">`. `dataKey` is resolved against the latest `appData` map with the following prop bindings:
- `Image` → binds to `src` prop
- `Chip` → binds to `label` prop
- All others → binds to `value` prop

`dataKey` supports dot notation for nested access: `"rates.USD"` first looks up `appData["rates"]`, auto-parses it from JSON if it is a string, then accesses `["USD"]`. The resolver returns `undefined` if any segment is missing or non-object. Segments matching `__proto__`, `constructor`, or `prototype` are blocked to prevent prototype pollution. The resolver is shared from `client/src/utils/dataKey.ts`.

`Calendar` is aliased in `componentMap` to PrimeVue's `DatePicker` component (`primevue/datepicker`); the AI config uses `'Calendar'`.

`Slider` and `Rating` are forced read-only by the renderer (`disabled: true` and `readonly: true` respectively), regardless of AI config props.

Props starting with `on` are stripped **client-side only** (in `resolvedProps`); the server whitelist validates component names and prop object shape but does not remove individual `on*` keys.

New display-only components: `Chip` (label tag), `Badge` (numeric badge with severity), `Slider` (read-only range slider), `Rating` (star display), `Image` (image from URL), `MeterGroup` (multi-segment progress). `Accordion` and `Tabs` use `props.tabs` array (each item: `{ header, dataKey }`) instead of top-level `dataKey`. `Panel` uses top-level `dataKey` (bound to `value` prop) plus `props.header` and `props.toggleable`.

The server validates and truncates `uiComponents` to a maximum of 20 items after filtering invalid ones.

`dataSource` is an alternative to `dataKey` for binding components to user-defined tables. When `dataSource: { type: 'table', tableId }` is present, it takes priority over `computedValue` and `dataKey`. `computedValue` (server-evaluated formula) takes priority over `dataKey`. Four components support table binding:
- `DataTable` — auto-generates columns from table schema, fetches and displays rows
- `Form` — auto-generates form fields from table schema columns (text→InputText, number→InputNumber, date→DatePicker, boolean→Checkbox, select→Dropdown), submits rows via `POST /api/app/:hash/tables/:tableId/rows`
- `CardList` — displays table rows as cards with key-value pairs per column, supports row deletion via `DELETE /api/app/:hash/tables/:tableId/rows/:rowId`
- `Chart` — builds Chart.js data from table rows (first column as labels, numeric columns as datasets) via `buildChartDataFromTable()` utility (`client/src/utils/chartData.ts`)

Table data is cached in the `app.ts` store (`tableData` map keyed by tableId). Rows are fetched on demand when a component with `dataSource` first renders. After Form writes or CardList deletes a row, `appStore.refreshTable()` is called to update all bound components.

Input wrapper components call `POST /api/app/:hash/data` on user interaction and emit `'data-written'`, which bubbles up through `AppRenderer` to `AppView.vue`, triggering `appStore.fetchData(hash)` to refresh displayed data.

**Conditional logic (showIf / styleIf / ConditionalGroup)**: Evaluated client-side in `AppRenderer.vue` using a ported copy of the server formula parser (`client/src/utils/formula/`). `buildFormulaContext()` assembles a flat `Record<string, unknown>` from `appStore.appData` (JSON string values are auto-parsed into objects for member access); this context is passed to `evaluateShowIf()` and `evaluateStyleIf()`.
- `showIf` — hides the component when the expression is falsy; absence means always visible
- `styleIf` — applies CSS classes conditionally; predefined classes: `warning` (yellow), `critical` (red), `success` (green), `muted` (gray), `highlight` (blue highlight)
- `ConditionalGroup` — container that shows or hides all its `children` together; max 1 level of nesting; validated on server, rendered via `AppConditionalGroup.vue`
- Server validates `showIf`/`styleIf` expressions via `parseFormula()` at save time; invalid expressions are silently dropped
- Client utilities: `client/src/utils/showIf.ts` → `evaluateShowIf(expr, ctx): boolean`; `client/src/utils/styleIf.ts` → `evaluateStyleIf(conditions, ctx): string[]`; `client/src/utils/conditionalClasses.ts` → `getConditionalClasses(styleIf, appData): string[]` (applies `si-` prefix; CSS in `client/src/assets/conditional-styles.css`); `client/src/utils/formulaContext.ts` → `buildFormulaContext(appData): Record<string, unknown>`

### Cron automation (`server/src/services/cronManager.ts`)

`CronManager` singleton. Five action types:
- `log_entry` — inserts a timestamped entry into `appData`
- `fetch_url` — fetches external HTTPS URL, extracts via `dataPath` (dot notation from `$.`), stores result; SSRF protection via shared `server/src/utils/fetchProxy.ts` (private IP check + DNS rebinding check + redirect blocking + 1 MB limit + 10-second timeout). If the response body is not valid JSON, raw text is stored and `dataPath` extraction is skipped.
- `send_reminder` — stores `{ text: string, sentAt: ISO8601 }` under `outputKey` (not a raw string)
- `aggregate_data` — computes avg/sum/count/max/min over a time window; result stored as a plain `number` under `outputKey`
- `compute` — performs calculated operations (currently supports `date_diff`: computes difference between two dates from `inputKeys`, stores `{ totalDays, years, months, days }` under `outputKey`)

All cron expressions must be 5-field only (no seconds). Minimum frequency: every 5 minutes. Jobs are loaded from DB on server start via `cronManager.loadAll()`. Max 5 jobs per app. Cron job configs are validated per action type in `isValidCronJobConfig()` (`server/src/routes/chat.ts`) before storage (e.g., `fetch_url` requires `url` starting with `https://` and a non-empty `outputKey`).

### Formula engine (`server/src/utils/formula/`)

Safe expression evaluator (recursive descent parser, no `eval`). Used for two features:

**Formula columns** in user-defined tables: `{ name: "total", type: "formula", formula: "price * quantity" }`. Evaluated per-row on the server when reading table data (`GET /api/app/:hash/tables/:tableId`). Formula columns are read-only — skipped in form inputs and row validation.

**computedValue on UI components**: `computedValue: "= SUM(expenses.amount)"`. Evaluated on the server during `GET /api/app/:hash/data`. Returns `{ appData: [...], computedValues: Record<number, unknown> }` where keys are component indices. Priority: `dataSource` > `computedValue` > `dataKey`.

**Syntax**: arithmetic (`+`, `-`, `*`, `/`, `%`), comparisons (`==`, `!=`, `<`, `>`, `<=`, `>=`), logic (`&&`, `||`, `!`), string concatenation (`+`), parentheses, function calls, member access (`.`).

**Built-in functions** (case-insensitive):
- Conditional: `IF(cond, then, else)`
- Math: `ABS(n)`, `ROUND(n, decimals?)`, `FLOOR(n)`, `CEIL(n)`, `MIN(a, b)`, `MAX(a, b)`
- String: `UPPER(s)`, `LOWER(s)`, `CONCAT(s1, s2, ...)`, `LEN(s)`, `TRIM(s)`
- Date: `NOW()`
- Aggregate: `SUM(col)`, `AVG(col)`, `COUNT(tbl?)`, `MIN(col)`, `MAX(col)` — aggregate over table columns

**Identifiers**: supports ASCII and Cyrillic letters (`\u0400-\u04FF`), digits, and underscores.

**Safety**: max formula length 500 chars, max AST depth 20, division by zero returns `null`, type mismatch in functions returns `null`, missing references return `null`.

Formula integration utilities:
- `server/src/utils/computedValues.ts` — `getGlobalComponents(config)` returns the flat list of all components across pages (flatMap if `config.pages` exists, else `config.uiComponents`); `extractReferencedTableNames(components)` extracts table names from formulas; `evaluateComputedValues(components, tables)` evaluates all `computedValue` formulas and returns `Record<number, unknown>` keyed by component index
- `server/src/utils/formulaColumns.ts` — `evaluateFormulaColumns(rows, columns)` evaluates formula columns per-row, injecting computed values into each row's data; formula columns can reference earlier formula columns in the same row

### Database (`server/src/db/schema.ts`)

Nine tables, all using Drizzle ORM with SQLite via better-sqlite3:

| Table | Purpose |
|---|---|
| `users` | Anonymous users; `userId` is a 10-char nanoid (unique); no auth — just identity |
| `apps` | One row per created app; `config` stores uiComponents JSON; `cronJobs` stripped before storage; `userId` FK (nullable for old apps); `passwordVersion` counter for JWT revocation on password change |
| `app_members` | Role assignments per app; unique `(appId, userId)`; `role`: 'owner'\|'editor'\|'viewer'; cascade-deletes with app |
| `app_invites` | Single-use invite tokens; `token` (32-char hex, unique); `expiresAt` (+7 days); `acceptedByUserId` (null until used); cascade-deletes with app |
| `cron_jobs` | Automation jobs per app; `config` is action-specific JSON |
| `app_data` | Append-only log of key/value entries written by cron jobs and user input components (Button, InputText, Form); queries always get latest row per key; auto-pruned to 100 rows per key on startup and hourly |
| `chat_history` | Full chat history; home chat rows have `appId = NULL`; in-app rows use `sessionId = 'app-<hash>'` |
| `user_tables` | User-defined table schemas per app; `columns` is JSON array of `{ name, type, required?, options?, formula? }`. Max 20 tables per app, max 30 columns per table. `rlsEnabled` (0\|1) enables row-level security |
| `user_rows` | Row data for user-defined tables; `data` is JSON object matching column definitions. `createdByUserId` (nullable) tracks row author for RLS. FK cascade-deletes when table is deleted. Max 10,000 rows per table |

### Auth

Two layers of authentication, both JWT-based:

**Global JWT** (`smailo_token` in localStorage): issued at user creation (`POST /api/users`), 30-day expiry, payload `{ userId }`. Sent via `Authorization: Bearer <token>` header. Used by `resolveUserAndRole` middleware to identify the user and look up their role in `app_members`.

**Per-app JWT** (`smailo_token_<hash>` in localStorage): issued on password verification (`POST /:hash/verify`), 7-day expiry, payload `{ hash, userId, pv }` where `pv` is `passwordVersion`. Sent via `X-App-Token` header. Used as fallback for password-protected apps when the user has no `app_members` role. Password changes increment `passwordVersion`, revoking all existing per-app JWTs.

**Roles**: `owner` (full control), `editor` (read + write data + chat, no config changes), `viewer` (read-only), `anonymous` (unprotected apps only, read-only).

**Auth middleware** (`server/src/middleware/auth.ts`):
- `resolveUserAndRole` — extracts userId from global JWT → finds app by hash → looks up role in `app_members` → for password-protected apps without role, tries per-app JWT → attaches `app_row`, `userId`, `userRole` to request. Backward compatibility: legacy apps without `app_members` rows use `apps.userId` for owner detection.
- `requireRole(...roles)` — checks `req.userRole` against allowed roles, returns 403 if insufficient.
- `requireAuthIfProtected` — legacy middleware, still present for backward compatibility.

**Password protection**: A one-time `creationToken` (SHA-256 stored, plaintext returned once at creation) gates the `set-password` endpoint (owner only). The `creationToken` is stored in `sessionStorage`. On successful password verification, if the user has no role in `app_members`, they are auto-added as `viewer`. Members with roles access the app via global JWT without needing the password.

`GET /api/app/:hash` strips `cronJobs` from `apps.config` before returning to the client.

### User-triggered data writes (`POST /api/app/:hash/data`)

Input components write to `appData` directly without AI involvement:
- `key`: string matching `/^[a-zA-Z0-9_]{1,100}$/`
- `value`: any JSON-serializable value; JSON-stringified size must not exceed 10 KB
- Protected by `resolveUserAndRole` + `requireRole('editor', 'owner')` middleware
- Returns `{ ok: true }` on success; 400 for invalid key or null/undefined value; 413 for oversized value
- Value size check uses `Buffer.byteLength(serialized, 'utf8')` (byte count, not character count)
- `AppForm` always injects a `timestamp: ISO8601` field into the submitted object alongside declared fields
- `AppInputText`'s Save button label is hardcoded to "Сохранить"; `AppForm`'s submit label is configurable via `props.submitLabel` (passed as `item.props.submitLabel` in the AI config)

### App data read (`GET /api/app/:hash/data`)

Returns `{ appData: [...], computedValues?: Record<number, unknown> }` — the latest value per key, same format as the `appData` field in `GET /api/app/:hash`. If the app config has components with `computedValue`, the server evaluates formulas against table data and includes results keyed by component index. Used by the client to refresh displayed values without reloading the full app config. Protected by `resolveUserAndRole` (viewer+ can read). Shared query logic lives in `server/src/db/queries.ts`.

### Action chains (`client/src/utils/actionExecutor.ts`)

Button, InputText, and Form support `actions: ActionStep[]` — an ordered list of up to 5 steps executed sequentially on user interaction. Five action types: `writeData`, `navigateTo`, `toggleVisibility`, `runFormula`, `fetchUrl`.

Client-side executor: `executeActions(actions, ctx)` iterates steps sequentially. Auth errors (401/403) abort remaining steps; other errors log and continue. After all steps, `appStore.fetchData()` is always called to refresh UI.

Server-side validation: `validateActions()` in `aiService.ts` validates each step per-type, drops invalid steps silently, enforces max 5 steps per chain. Migration: legacy `action: { key, value }` is converted to `actions: [{ type: 'writeData', key, value }]` at save time; `action` field is removed after migration. Client components still support the legacy `action` prop for configs not yet re-saved.

### Action fetch-url endpoint (`POST /api/app/:hash/actions/fetch-url`)

Server-side proxy for the `fetchUrl` action step. Request body: `{ url: string, outputKey: string, dataPath?: string }`. Validates: `url` must start with `https://` (max 2048 chars), `outputKey` must match `/^[a-zA-Z0-9_]{1,100}$/`, `dataPath` if present must be non-empty string (max 500 chars). Calls `fetchSafe(url)` then `extractDataPath(body, dataPath)`, writes result to `appData` along with `{outputKey}_updated_at` timestamp, returns `{ ok: true, value }`. Protected by `resolveUserAndRole` + `requireRole('editor', 'owner')`. Rate-limited at 30 req/min (chatLimiter). Returns 502 on upstream fetch failure, 413 if fetched value exceeds 10 KB.

### Visual editor (`client/src/components/editor/`)

Alternative to AI chat for editing app UI. Toggle between chat and editor mode via button in AppView header.

Editor components:
- `AppEditor.vue` — main canvas: 12-column CSS Grid mirroring AppRenderer, but with draggable component cards; supports multi-page editing via tabs
- `EditorComponentCard.vue` — card representing a component: shows type icon, label, dataKey info; click to select, drag handle for reordering, delete button
- `ComponentPalette.vue` — component palette grouped by category (Display, Input, Layout); drag from palette to canvas to add components
- `PropertyEditor.vue` — panel for editing selected component properties: General (type, delete), Props (dynamic form), Data (dataKey, dataSource, computedValue), Actions (chain builder), Conditional (showIf, styleIf), Layout (col, colSpan, row, rowSpan)

Editor state: `client/src/stores/editor.ts` — Pinia store with `isEditMode`, `selectedComponentIndex`, `editableConfig` (working copy), `isDirty`, `activePage`. Actions: `enterEditMode`, `exitEditMode`, `selectComponent`, `updateComponent`, `removeComponent`, `addComponent`, `moveComponent`, `updateLayout`, `saveConfig(hash)` (calls `PUT /api/app/:hash/config`).

Drag-and-drop: `vue-draggable-plus` (SortableJS wrapper for Vue 3). Supports reordering on canvas, cross-container drag from palette, and resize handles for changing `colSpan`.

Save flow: Save button (or Ctrl+S) → `PUT /api/app/:hash/config` → updates `appStore.appConfig` → `isDirty = false`. Discard button resets to last saved config.

### Config save endpoint (`PUT /api/app/:hash/config`)

Direct config save without AI involvement. Body: `{ uiComponents?: UiComponent[] }` or `{ pages?: Page[] }` (one of two). Validates via existing `validateUiComponents()` / `validatePages()`. Protected by `resolveUserAndRole` + `requireRole('owner')`. Rate-limited at 30 req/min (chatLimiter). Returns `{ ok: true, config: {...} }`.

### SSRF-safe fetch utility (`server/src/utils/fetchProxy.ts`)

Shared fetch utility used by both cron `fetch_url` and the action `fetchUrl` endpoint. Exports: `isPrivateHost(hostname)` — checks IPv4/IPv6 private ranges; `fetchSafe(url)` — HTTPS-only fetch with SSRF protection (private IP block, DNS rebinding check, redirect blocking, 1 MB body limit, 10s timeout); `extractDataPath(body, dataPath?)` — dot-notation JSON extraction with prototype-pollution protection.

### User-defined tables (`server/src/routes/tables.ts`)

Structured relational data storage alongside the flat KV `app_data`. Tables are defined with typed columns and support CRUD operations. The AI can generate table definitions during app creation (via `tables` array in `appConfig`), and tables are also manageable via API.

Column types: `text`, `number`, `date`, `boolean`, `select` (with `options` array), `formula` (with `formula` expression string).
Column names: must start with letter, alphanumeric + underscore, max 50 chars (`/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/`).
Table names: can include Cyrillic and spaces, max 100 chars.

API endpoints (all under `/api/app/:hash/tables`, protected by `resolveUserAndRole`):
- `POST /` — create table (owner only)
- `GET /` — list all tables for the app (viewer+)
- `GET /:tableId` — get table schema + rows (viewer+; RLS filtering applied for viewers on `rlsEnabled` tables)
- `PUT /:tableId` — update table schema including `rlsEnabled` toggle (owner only)
- `DELETE /:tableId` — delete table and all rows (owner only)
- `POST /:tableId/rows` — add row (editor+); `createdByUserId` set from `req.userId`
- `PUT /:tableId/rows/:rowId` — update row (editor+; viewer can only update own rows in RLS tables)
- `DELETE /:tableId/rows/:rowId` — delete row (editor+; viewer can only delete own rows in RLS tables)

The `GET /api/app/:hash` endpoint returns table schemas in the `tables` field alongside `appData`.

### Row-level security (RLS)

Tables with `rlsEnabled = 1` restrict row visibility for viewers: `GET /:tableId` filters rows where `createdByUserId === req.userId`. Owners and editors always see all rows. Anonymous users see no rows in RLS tables. Viewers can only update/delete their own rows.

Server-side `computedValue` formulas respect RLS: `evaluateComputedValues` receives `userRole` and `userId`; for viewers with RLS tables, rows are filtered before formula aggregation.

### Members API (`server/src/routes/members.ts`)

Endpoints under `/api/app/:hash/members`, rate-limited at 30 req/min:
- `GET /` — list members (owner only): returns `[{ userId, role, joinedAt }]`
- `POST /invite` — create invite (owner only): body `{ role: 'editor'|'viewer' }`, returns `{ token, inviteUrl, expiresAt }`
- `POST /invite/:token/accept` — accept invite (authenticated user): validates token not expired/used, adds user to `app_members`, marks invite as used; returns `{ appHash, role }`
- `PUT /:userId` — change member role (owner only): body `{ role: 'editor'|'viewer' }`; cannot change own role or another owner's role
- `DELETE /:userId` — remove member (owner only); cannot remove self

### Rate limits

- `POST /api/chat` and `POST /api/app/:hash/chat`: 30 req/min
- `POST /api/app/:hash/data`: 30 req/min (same limiter as chat)
- `POST /api/app/:hash/verify` and `set-password`: 5 req/min
- All `/api/users` routes: 30 req/min
- All `/api/app/:hash/tables` write routes: 30 req/min
- `POST /api/app/:hash/actions/fetch-url`: 30 req/min (chatLimiter)
- `PUT /api/app/:hash/config`: 30 req/min (chatLimiter)
- All `/api/app/:hash/members` routes: 30 req/min

### Client state

Four Pinia stores:
- `user.ts` — user identity: `userId`, list of user's apps split into `myApps` (owner) and `sharedApps` (editor/viewer); methods: `createUser()` (also stores global JWT), `fetchApps(userId)`
- `chat.ts` — creation chat state: messages array, current phase, appHash after creation
- `app.ts` — per-app state: app config, appData map, tableData cache (table rows keyed by tableId), computedValues (formula results keyed by component index), auth token, in-app chat messages, `myRole` (current user's role in the app)
- `editor.ts` — visual editor state: edit mode toggle, selected component, editable config copy, dirty tracking, active page; save via `PUT /api/app/:hash/config`

Four views:
- `HomeView.vue` — minimal landing: create new userId or enter existing one; no chat
- `UserView.vue` — two-column: left = list of user's apps ("My apps" + "Shared with me" sections), right = Smailo + AI chat for creating apps
- `AppView.vue` — two-column: left = AppRenderer (view mode) or AppEditor (edit mode), right = Smailo + in-app chat (view mode) or ComponentPalette + PropertyEditor (edit mode); role-aware: editor button hidden for non-owners, inputs disabled for viewers, role badge in header, members button for owner
- `InviteView.vue` — accept invite link: if user not logged in, prompts to create account; calls accept endpoint; redirects to app on success

`InputBar.vue` — chat input with two extra controls: (1) quick number buttons (1–N, up to 5) shown when the last assistant message contains a numbered list; (2) a microphone button for browser-native speech recognition (Web Speech API), hidden when unsupported. Number buttons auto-submit the digit immediately.

`chat.ts` store exposes two session management methods: `initSession(userId)` — called by `UserView` on mount — sets `sessionId = home-<userId>` (deterministic, persistent across visits) and reloads chat history (server validates `userId` matches the session); and `reset()` — generates a new random UUID session ID, used for a full clean break. The voice input microphone (`InputBar.vue`) uses Web Speech API configured for Russian (`lang: 'ru-RU'`).

Axios instance (`client/src/api/index.ts`) auto-attaches global JWT from `smailo_token` in localStorage via `Authorization: Bearer` header. For app routes, also sends per-app JWT from `smailo_token_<hash>` via `X-App-Token` header. `X-User-Id` header has been removed.

### User API (`server/src/routes/users.ts`)

- `POST /api/users` — generate userId (nanoid 10), insert into users, generate global JWT (30d), return `{ userId, token }`
- `GET /api/users/:userId` — return `{ userId, createdAt }` or 404
- `GET /api/users/:userId/apps` — return `[{ hash, appName, description, createdAt, lastVisit, role }]` — includes both owned apps and shared apps (via `app_members`)
