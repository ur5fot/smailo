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

There are no tests. There is no linter configured.

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
3. **created** — user confirms; server creates the app row, generates a 64-char hex `hash`, and schedules cron jobs; `userId` is saved in `apps.userId`

Once created, the app lives at `/:userId/:hash`. The old `/app/:hash` route is kept for backward compatibility. Inside the app, a separate **chat** phase (`POST /api/app/:hash/chat`) lets the user update the UI layout via `uiUpdate`.

Phase transitions are enforced server-side: `created` can only follow `confirm` — AI cannot skip phases.

### AI service (`server/src/services/aiService.ts`)

Single `chatWithAI(messages, phase, appContext?)` function. Always returns a JSON `ClaudeResponse`. Two system prompts:
- **`BRAINSTORM_SYSTEM_PROMPT`** — used for `brainstorm`/`confirm`/`created` phases
- **`IN_APP_SYSTEM_PROMPT`** — used for `chat` phase; receives truncated app config + data as context

Provider is selected at runtime via `AI_PROVIDER` env var (`anthropic` or `deepseek`). The Anthropic model is overridable via `ANTHROPIC_MODEL` env var (default: `claude-sonnet-4-6`). Clients are lazily initialized singletons. AI response is always JSON — `parseResponse()` uses a brace-counting parser (`extractJson()`) that tracks brace depth while respecting string literals and escape sequences, then validates/sanitizes all fields.

### App config JSON shape

The AI generates and the server stores configs in this shape (cronJobs are stored separately in the `cron_jobs` table, not in `apps.config`):

```ts
{
  appName: string
  description: string
  uiComponents: Array<{
    component: 'Card' | 'DataTable' | 'Chart' | 'Timeline' | 'Knob' | 'Tag' | 'ProgressBar' | 'Calendar'
             | 'Button' | 'InputText' | 'Form'
             | 'Accordion' | 'Panel' | 'Chip' | 'Badge' | 'Slider' | 'Rating' | 'Tabs' | 'Image' | 'MeterGroup'
    props: Record<string, unknown>  // component-specific, no 'on*' props
    dataKey?: string                // key into appData to bind as value/data prop
    // Input component fields (top-level, NOT inside props):
    action?: { key: string; value?: unknown }  // Button: fixed value; InputText: value from user input
    fields?: Array<{ name: string; type: 'text' | 'number'; label: string }>  // Form only; `name` must match /^[a-zA-Z0-9_]{1,100}$/ and 'timestamp' is reserved (auto-injected)
    outputKey?: string             // Form only: appData key for the submitted object
  }>
}
```

### Dynamic UI rendering (`client/src/components/AppRenderer.vue`)

Iterates `uiConfig` array and renders each component dynamically. Eight components use dedicated wrappers:
- `Card` → `AppCard.vue`, `DataTable` → `AppDataTable.vue` (data display)
- `Button` → `AppButton.vue`, `InputText` → `AppInputText.vue`, `Form` → `AppForm.vue` (user input)
- `Accordion` → `AppAccordion.vue`, `Panel` → `AppPanel.vue`, `Tabs` → `AppTabs.vue` (slot-based layout)

All others use `<component :is="...">`. `dataKey` is resolved against the latest `appData` map with the following prop bindings:
- `Chart` → binds to `data` prop
- `Image` → binds to `src` prop
- `Chip` → binds to `label` prop
- All others → binds to `value` prop

`dataKey` supports dot notation for nested access: `"rates.USD"` first looks up `appData["rates"]`, auto-parses it from JSON if it is a string, then accesses `["USD"]`. The resolver returns `undefined` if any segment is missing or non-object. Segments matching `__proto__`, `constructor`, or `prototype` are blocked to prevent prototype pollution. The resolver is shared from `client/src/utils/dataKey.ts`.

`Calendar` is aliased in `componentMap` to PrimeVue's `DatePicker` component (`primevue/datepicker`); the AI config uses `'Calendar'`.

`Slider` and `Rating` are forced read-only by the renderer (`disabled: true` and `readonly: true` respectively), regardless of AI config props.

Props starting with `on` are stripped **client-side only** (in `resolvedProps`); the server whitelist validates component names and prop object shape but does not remove individual `on*` keys.

New display-only components: `Chip` (label tag), `Badge` (numeric badge with severity), `Slider` (read-only range slider), `Rating` (star display), `Image` (image from URL), `MeterGroup` (multi-segment progress). `Accordion` and `Tabs` use `props.tabs` array (each item: `{ header, dataKey }`) instead of top-level `dataKey`. `Panel` uses top-level `dataKey` (bound to `value` prop) plus `props.header` and `props.toggleable`.

The server validates and truncates `uiComponents` to a maximum of 20 items after filtering invalid ones.

Input wrapper components call `POST /api/app/:hash/data` on user interaction and emit `'data-written'`, which bubbles up through `AppRenderer` to `AppView.vue`, triggering `appStore.fetchData(hash)` to refresh displayed data.

### Cron automation (`server/src/services/cronManager.ts`)

`CronManager` singleton. Four action types:
- `log_entry` — inserts a timestamped entry into `appData`
- `fetch_url` — fetches external HTTPS URL, extracts via `dataPath` (dot notation from `$.`), stores result; has SSRF protection (private IP check + DNS rebinding check + redirect blocking + 1 MB limit + 10-second timeout). If the response body is not valid JSON, raw text is stored and `dataPath` extraction is skipped.
- `send_reminder` — stores `{ text: string, sentAt: ISO8601 }` under `outputKey` (not a raw string)
- `aggregate_data` — computes avg/sum/count/max/min over a time window; result stored as a plain `number` under `outputKey`

All cron expressions must be 5-field only (no seconds). Minimum frequency: every 5 minutes. Jobs are loaded from DB on server start via `cronManager.loadAll()`. Max 5 jobs per app. Cron job configs are validated per action type before storage (e.g., `fetch_url` requires `url` starting with `https://`).

### Database (`server/src/db/schema.ts`)

Five tables, all using Drizzle ORM with SQLite via better-sqlite3:

| Table | Purpose |
|---|---|
| `users` | Anonymous users; `userId` is a 10-char nanoid (unique); no auth — just identity |
| `apps` | One row per created app; `config` stores uiComponents JSON; `cronJobs` stripped before storage; `userId` FK (nullable for old apps) |
| `cron_jobs` | Automation jobs per app; `config` is action-specific JSON |
| `app_data` | Append-only log of key/value entries written by cron jobs and user input components (Button, InputText, Form); queries always get latest row per key; auto-pruned to 100 rows per key on startup and hourly |
| `chat_history` | Full chat history; home chat rows have `appId = NULL`; in-app rows use `sessionId = 'app-<hash>'` |

### Auth

Password-protected apps use bcrypt (cost 12) + JWT (7d expiry). A one-time `creationToken` (SHA-256 stored, plaintext returned once at creation) gates the `set-password` endpoint to prevent race-condition hijacking. JWT is stored per-app in `localStorage` under key `smailo_token_<hash>`; the Axios interceptor selects the correct token by extracting the hash from the request URL. The `creationToken` is stored in `sessionStorage` (lost on tab close) — users must set a password before closing the tab if they want password protection. `GET /api/app/:hash` strips `cronJobs` from `apps.config` before returning to the client.

Unprotected apps (no password) use ownership verification via `X-User-Id` header for write operations (POST). The Axios interceptor sends this header automatically from `localStorage`. Apps without a `userId` (legacy) skip this check for backward compatibility. Read operations remain open to anyone with the hash.

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

Returns `{ appData: [...] }` — the latest value per key, same format as the `appData` field in `GET /api/app/:hash`. Used by the client to refresh displayed values without reloading the full app config. Protected by `requireAuthIfProtected`. Shared query logic lives in `server/src/db/queries.ts`.

### Rate limits

- `POST /api/chat` and `POST /api/app/:hash/chat`: 30 req/min
- `POST /api/app/:hash/data`: 30 req/min (same limiter as chat)
- `POST /api/app/:hash/verify` and `set-password`: 5 req/min
- All `/api/users` routes: 30 req/min

### Client state

Three Pinia stores:
- `user.ts` — user identity: `userId`, list of user's apps; methods: `createUser()`, `fetchApps(userId)`
- `chat.ts` — creation chat state: messages array, current phase, appHash after creation
- `app.ts` — per-app state: app config, appData map, auth token, in-app chat messages

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
