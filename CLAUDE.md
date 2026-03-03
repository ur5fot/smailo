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
/                   → HomeView       (landing: create user or enter existing userId)
/:userId            → UserView       (user's app list + AI chat for creating apps)
/:userId/:hash      → AppView        (two-column: app left, AI assistant right)
/app/:hash          → AppView        (backward-compatible; userId = null)
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
    dataSource?: { type: 'table'; tableId: number }  // bind to user-defined table (alternative to dataKey)
    // Input component fields (top-level, NOT inside props):
    action?: { key: string; value?: unknown }  // Button: fixed value; InputText: value from user input
    fields?: Array<{ name: string; type: 'text' | 'number'; label: string }>  // Form only; `name` must match /^[a-zA-Z0-9_]{1,100}$/ and 'timestamp' is reserved (auto-injected)
    outputKey?: string             // Form only: appData key for the submitted object
    computedValue?: string         // server-evaluated formula: "= SUM(expenses.amount)" — alternative to dataKey for display components
    // Conditional logic fields:
    showIf?: string                // client-evaluated formula; component hidden when falsy (e.g. "status == \"active\"" — note: only double-quoted strings are supported)
    styleIf?: Array<{ condition: string; class: string }>  // conditional CSS classes applied when condition is truthy
    // ConditionalGroup fields (only when component == 'ConditionalGroup'):
    condition?: string             // formula evaluated on client; group shown when truthy
    children?: UiComponent[]       // nested components shown/hidden together (max 1 level deep)
  }>
}
```

### Dynamic UI rendering (`client/src/components/AppRenderer.vue`)

Iterates `uiConfig` array and renders each component dynamically. Eleven components use dedicated wrappers:
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
- `fetch_url` — fetches external HTTPS URL, extracts via `dataPath` (dot notation from `$.`), stores result; has SSRF protection (private IP check + DNS rebinding check + redirect blocking + 1 MB limit + 10-second timeout). If the response body is not valid JSON, raw text is stored and `dataPath` extraction is skipped.
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
- `server/src/utils/computedValues.ts` — `extractReferencedTableNames(components)` extracts table names from formulas; `evaluateComputedValues(components, tables)` evaluates all `computedValue` formulas and returns `Record<number, unknown>` keyed by component index
- `server/src/utils/formulaColumns.ts` — `evaluateFormulaColumns(rows, columns)` evaluates formula columns per-row, injecting computed values into each row's data; formula columns can reference earlier formula columns in the same row

### Database (`server/src/db/schema.ts`)

Seven tables, all using Drizzle ORM with SQLite via better-sqlite3:

| Table | Purpose |
|---|---|
| `users` | Anonymous users; `userId` is a 10-char nanoid (unique); no auth — just identity |
| `apps` | One row per created app; `config` stores uiComponents JSON; `cronJobs` stripped before storage; `userId` FK (nullable for old apps) |
| `cron_jobs` | Automation jobs per app; `config` is action-specific JSON |
| `app_data` | Append-only log of key/value entries written by cron jobs and user input components (Button, InputText, Form); queries always get latest row per key; auto-pruned to 100 rows per key on startup and hourly |
| `chat_history` | Full chat history; home chat rows have `appId = NULL`; in-app rows use `sessionId = 'app-<hash>'` |
| `user_tables` | User-defined table schemas per app; `columns` is JSON array of `{ name, type, required?, options?, formula? }`. Max 20 tables per app, max 30 columns per table |
| `user_rows` | Row data for user-defined tables; `data` is JSON object matching column definitions. FK cascade-deletes when table is deleted. Max 10,000 rows per table |

### Auth

Password-protected apps use bcrypt (cost 12) + JWT (7d expiry). A one-time `creationToken` (SHA-256 stored, plaintext returned once at creation) gates the `set-password` endpoint to prevent race-condition hijacking. JWT is stored per-app in `localStorage` under key `smailo_token_<hash>`; the Axios interceptor selects the correct token by extracting the hash from the request URL. The `creationToken` is stored in `sessionStorage` (lost on tab close) — users must set a password before closing the tab if they want password protection. `GET /api/app/:hash` strips `cronJobs` from `apps.config` before returning to the client.

Unprotected apps (no password) use ownership verification via `X-User-Id` header for write operations (POST, PUT, DELETE). The Axios interceptor sends this header automatically from `localStorage`. Apps without a `userId` (legacy) skip this check for backward compatibility. Read operations remain open to anyone with the hash.

Auth middleware (`requireAuthIfProtected`) is extracted to `server/src/middleware/auth.ts` and shared between `app.ts` and `tables.ts`.

### User-triggered data writes (`POST /api/app/:hash/data`)

Input components write to `appData` directly without AI involvement:
- `key`: string matching `/^[a-zA-Z0-9_]{1,100}$/`
- `value`: any JSON-serializable value; JSON-stringified size must not exceed 10 KB
- Protected by `requireAuthIfProtected` middleware (JWT required if app has password; `X-User-Id` ownership check for unprotected apps on write ops)
- Returns `{ ok: true }` on success; 400 for invalid key or null/undefined value; 413 for oversized value
- Value size check uses `Buffer.byteLength(serialized, 'utf8')` (byte count, not character count)
- `AppForm` always injects a `timestamp: ISO8601` field into the submitted object alongside declared fields
- `AppInputText`'s Save button label is hardcoded to "Сохранить"; `AppForm`'s submit label is configurable via `props.submitLabel` (passed as `item.props.submitLabel` in the AI config)

### App data read (`GET /api/app/:hash/data`)

Returns `{ appData: [...], computedValues?: Record<number, unknown> }` — the latest value per key, same format as the `appData` field in `GET /api/app/:hash`. If the app config has components with `computedValue`, the server evaluates formulas against table data and includes results keyed by component index. Used by the client to refresh displayed values without reloading the full app config. Protected by `requireAuthIfProtected`. Shared query logic lives in `server/src/db/queries.ts`.

### User-defined tables (`server/src/routes/tables.ts`)

Structured relational data storage alongside the flat KV `app_data`. Tables are defined with typed columns and support CRUD operations. The AI can generate table definitions during app creation (via `tables` array in `appConfig`), and tables are also manageable via API.

Column types: `text`, `number`, `date`, `boolean`, `select` (with `options` array), `formula` (with `formula` expression string).
Column names: must start with letter, alphanumeric + underscore, max 50 chars (`/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/`).
Table names: can include Cyrillic and spaces, max 100 chars.

API endpoints (all under `/api/app/:hash/tables`, protected by `requireAuthIfProtected`):
- `POST /` — create table: `{ name, columns: [{ name, type, required?, options? }] }`
- `GET /` — list all tables for the app
- `GET /:tableId` — get table schema + all rows
- `PUT /:tableId` — update table schema (name and/or columns)
- `DELETE /:tableId` — delete table and all rows (cascade)
- `POST /:tableId/rows` — add row: `{ data: { col1: val1, ... } }` (validated against column types)
- `PUT /:tableId/rows/:rowId` — update row
- `DELETE /:tableId/rows/:rowId` — delete row

The `GET /api/app/:hash` endpoint returns table schemas in the `tables` field alongside `appData`.
Auth middleware (`server/src/middleware/auth.ts`) is shared between `app.ts` and `tables.ts`; it checks JWT for password-protected apps and `X-User-Id` ownership for unprotected apps on write operations (POST, PUT, DELETE).

### Rate limits

- `POST /api/chat` and `POST /api/app/:hash/chat`: 30 req/min
- `POST /api/app/:hash/data`: 30 req/min (same limiter as chat)
- `POST /api/app/:hash/verify` and `set-password`: 5 req/min
- All `/api/users` routes: 30 req/min
- All `/api/app/:hash/tables` write routes: 30 req/min

### Client state

Three Pinia stores:
- `user.ts` — user identity: `userId`, list of user's apps; methods: `createUser()`, `fetchApps(userId)`
- `chat.ts` — creation chat state: messages array, current phase, appHash after creation
- `app.ts` — per-app state: app config, appData map, tableData cache (table rows keyed by tableId), computedValues (formula results keyed by component index), auth token, in-app chat messages

Three views:
- `HomeView.vue` — minimal landing: create new userId or enter existing one; no chat
- `UserView.vue` — two-column: left = list of user's apps, right = Smailo + AI chat for creating apps
- `AppView.vue` — two-column: left = AppRenderer + app data, right = Smailo + in-app chat

`InputBar.vue` — chat input with two extra controls: (1) quick number buttons (1–N, up to 5) shown when the last assistant message contains a numbered list; (2) a microphone button for browser-native speech recognition (Web Speech API), hidden when unsupported. Number buttons auto-submit the digit immediately.

`chat.ts` store exposes two session management methods: `initSession(userId)` — called by `UserView` on mount — sets `sessionId = home-<userId>` (deterministic, persistent across visits) and reloads chat history (server validates `userId` matches the session); and `reset()` — generates a new random UUID session ID, used for a full clean break. The voice input microphone (`InputBar.vue`) uses Web Speech API configured for Russian (`lang: 'ru-RU'`).

Axios instance (`client/src/api/index.ts`) auto-attaches JWT from localStorage and sends `X-User-Id` header (from `smailo_user_id` in localStorage) for ownership verification.

### User API (`server/src/routes/users.ts`)

- `POST /api/users` — generate userId (nanoid 10), insert into users, return `{ userId }`
- `GET /api/users/:userId` — return `{ userId, createdAt }` or 404
- `GET /api/users/:userId/apps` — return `[{ hash, appName, description, createdAt, lastVisit }]`
