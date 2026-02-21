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

npm workspaces; root `package.json` has scripts that delegate to both.

### App lifecycle (the core flow)

Apps are created through a **three-phase home chat** (`POST /api/chat`):

1. **brainstorm** — AI asks clarifying questions about the app idea
2. **confirm** — AI returns an `appConfig` JSON for the user to review
3. **created** — user confirms; server creates the app row, generates a 64-char hex `hash`, and schedules cron jobs

Once created, the app lives at `/app/:hash`. Inside the app, a separate **chat** phase (`POST /api/app/:hash/chat`) lets the user update the UI layout via `uiUpdate`.

Phase transitions are enforced server-side: `created` can only follow `confirm` — AI cannot skip phases.

### AI service (`server/src/services/aiService.ts`)

Single `chatWithAI(messages, phase, appContext?)` function. Always returns a JSON `ClaudeResponse`. Two system prompts:
- **`BRAINSTORM_SYSTEM_PROMPT`** — used for `brainstorm`/`confirm`/`created` phases
- **`IN_APP_SYSTEM_PROMPT`** — used for `chat` phase; receives truncated app config + data as context

Provider is selected at runtime via `AI_PROVIDER` env var (`anthropic` or `deepseek`). The Anthropic model is overridable via `ANTHROPIC_MODEL` env var (default: `claude-sonnet-4-6`). Clients are lazily initialized singletons. AI response is always JSON — `parseResponse()` extracts JSON by finding the outermost `{`…`}` pair in the raw response, then validates/sanitizes all fields.

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
    fields?: Array<{ name: string; type: 'text' | 'number'; label: string }>  // Form only
    outputKey?: string             // Form only: appData key for the submitted object
  }>
}
```

### Dynamic UI rendering (`client/src/components/AppRenderer.vue`)

Iterates `uiConfig` array and renders each component dynamically. Eight components use dedicated wrappers:
- `Card` → `AppCard.vue`, `DataTable` → `AppDataTable.vue` (data display)
- `Button` → `AppButton.vue`, `InputText` → `AppInputText.vue`, `Form` → `AppForm.vue` (user input)
- `Accordion` → `AppAccordion.vue`, `Panel` → `AppPanel.vue`, `Tabs` → `AppTabs.vue` (slot-based layout)

All others use `<component :is="...">`. `dataKey` is resolved against the latest `appData` map; for `Chart` it binds to `data` prop, for all others to `value` prop. Props starting with `on` are stripped **client-side only** (in `resolvedProps`); the server whitelist validates component names and prop object shape but does not remove individual `on*` keys.

New display-only components: `Chip` (label tag), `Badge` (numeric badge with severity), `Slider` (read-only range slider), `Rating` (star display), `Image` (image from URL), `MeterGroup` (multi-segment progress). Accordion/Panel/Tabs use `props.tabs` array instead of `dataKey`.

Input wrapper components call `POST /api/app/:hash/data` on user interaction and emit `'data-written'`, which bubbles up through `AppRenderer` to `AppView.vue`, triggering `appStore.fetchData(hash)` to refresh displayed data.

### Cron automation (`server/src/services/cronManager.ts`)

`CronManager` singleton. Four action types:
- `log_entry` — inserts a timestamped entry into `appData`
- `fetch_url` — fetches external HTTPS URL, extracts via `dataPath` (dot notation from `$.`), stores result; has SSRF protection (private IP check + DNS rebinding check + redirect blocking + 1 MB limit)
- `send_reminder` — logs reminder text to `appData`
- `aggregate_data` — computes avg/sum/count/max/min over a time window from existing `appData` rows

All cron expressions must be 5-field only (no seconds). Minimum frequency: every 5 minutes. Jobs are loaded from DB on server start via `cronManager.loadAll()`. Max 5 jobs per app.

### Database (`server/src/db/schema.ts`)

Four tables, all using Drizzle ORM with SQLite via better-sqlite3:

| Table | Purpose |
|---|---|
| `apps` | One row per created app; `config` stores uiComponents JSON; `cronJobs` stripped before storage |
| `cron_jobs` | Automation jobs per app; `config` is action-specific JSON |
| `app_data` | Append-only log of key/value entries written by cron jobs and user input components (Button, InputText, Form); queries always get latest row per key |
| `chat_history` | Full chat history; home chat rows have `appId = NULL`; in-app rows use `sessionId = 'app-<hash>'` |

### Auth

Password-protected apps use bcrypt (cost 12) + JWT (7d expiry). A one-time `creationToken` (SHA-256 stored, plaintext returned once at creation) gates the `set-password` endpoint to prevent race-condition hijacking. JWT is stored in client `localStorage` and sent as `Authorization: Bearer`.

### User-triggered data writes (`POST /api/app/:hash/data`)

Input components write to `appData` directly without AI involvement:
- `key`: string matching `/^[a-zA-Z0-9_]{1,100}$/`
- `value`: any JSON-serializable value; JSON-stringified size must not exceed 10 KB
- Protected by `requireAuthIfProtected` middleware (JWT required if app has password)
- Returns `{ ok: true }` on success; 400 for invalid key or null/undefined value; 413 for oversized value
- Value size check uses `Buffer.byteLength(serialized, 'utf8')` (byte count, not character count)
- `AppForm` always injects a `timestamp: ISO8601` field into the submitted object alongside declared fields
- `AppInputText`'s Save button label is hardcoded to "Сохранить"; `AppForm`'s submit label is configurable via `props.submitLabel` (passed as `item.props.submitLabel` in the AI config)

### Rate limits

- `POST /api/chat` and `POST /api/app/:hash/chat`: 30 req/min
- `POST /api/app/:hash/data`: 30 req/min (same limiter as chat)
- `POST /api/app/:hash/verify` and `set-password`: 5 req/min

### Client state

Two Pinia stores:
- `chat.ts` — home page state: messages array, current phase, appHash after creation
- `app.ts` — per-app state: app config, appData map, auth token, in-app chat messages

Axios instance (`client/src/api/index.ts`) auto-attaches JWT from localStorage.
