# Smailo

> ⚡ **Vibe coding project** — built entirely through AI-assisted development (Claude Code). The code works, but it is not production-hardened. Use at your own risk: no thorough test coverage, security audit, or stability guarantees. Not recommended for storing sensitive data.

A personal AI applications builder. Chat with Smailo — an expressive AI assistant — to design and create personal apps like trackers, task lists, schedulers, and data visualizers. Each app gets a dynamic PrimeVue UI and optional cron jobs that run automatically in the background.

## How It Works

1. Open the home page — create a new personal user ID or enter an existing one
2. On your user page, pick an example app or describe your idea to Smailo in the AI chat
3. Smailo walks you through a brainstorm → confirm → created flow
4. Once created, your app gets a unique URL at `/:userId/:hash` you can bookmark
5. Optionally set a password to protect your app
6. Inside your app, chat with Smailo in the right panel to update the UI or add automations
7. Chat history is persisted across sessions — both in the home creation chat and inside each app
8. Smailo builds a per-app memory of important context and uses it in future conversations
9. All your apps are listed on your personal page `/:userId`

## Prerequisites

- Node.js 20+
- An API key for your chosen AI provider: Anthropic (default) or DeepSeek

## Setup

```sh
# 1. Copy the environment file and fill in your values
cp .env.example .env

# 2. Install all dependencies (root + client + server)
npm install

# 3. Create the SQLite database tables
npm run db:push

# 4. Start the development server
npm run dev
```

The client runs at http://localhost:5173 and the server at http://localhost:3000.

## Environment Variables

| Variable           | Description                                      | Default                   |
|--------------------|--------------------------------------------------|---------------------------|
| PORT               | Server port                                      | 3000                      |
| ANTHROPIC_API_KEY  | Your Anthropic API key (required for anthropic)  | —                         |
| ANTHROPIC_MODEL    | Anthropic model name                             | claude-sonnet-4-6         |
| JWT_SECRET         | Secret used to sign app access tokens            | —                         |
| DATABASE_URL       | Path to the SQLite database file                 | smailo.sqlite             |
| CLIENT_URL         | Origin allowed by CORS                           | http://localhost:5173     |
| AI_PROVIDER        | AI provider to use: anthropic or deepseek        | anthropic                 |
| DEEPSEEK_API_KEY   | Your DeepSeek API key (required for deepseek)    | —                         |
| DEEPSEEK_MODEL     | DeepSeek model name                              | deepseek-chat             |

## Architecture

```
smailo/
├── client/                 # Vue 3 + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── Smailo.vue        # Animated SVG character (5 moods + thinking animation)
│       │   ├── InputBar.vue      # Text input with quick-number buttons and voice input
│       │   ├── AppRenderer.vue   # Dynamic PrimeVue component renderer
│       │   ├── AppCard.vue       # Card wrapper (uses PrimeVue slots)
│       │   ├── AppDataTable.vue  # DataTable wrapper (auto-generates columns)
│       │   ├── AppButton.vue     # Clickable button with action chains (writeData, navigateTo, etc.)
│       │   ├── AppInputText.vue  # Text/number/date input with Save button and action chains
│       │   ├── AppForm.vue       # Multi-field form with post-submit action chains
│       │   ├── AppCardList.vue   # Card-per-item list from appData array or table rows (with delete)
│       │   ├── AppAccordion.vue  # Accordion wrapper for collapsible sections
│       │   ├── AppPanel.vue      # Panel wrapper with header slot
│       │   ├── AppTabs.vue       # Tabs wrapper showing data per tab
│       │   └── AppConditionalGroup.vue  # Container that shows/hides children based on a condition
│       ├── views/
│       │   ├── HomeView.vue      # Landing: create/enter user ID
│       │   ├── UserView.vue      # User page: app list (left) + AI chat with example prompts (right)
│       │   └── AppView.vue       # Two-column: AppRenderer (left) + in-app AI chat (right)
│       ├── stores/
│       │   ├── user.ts           # Pinia store for user identity and app list
│       │   ├── chat.ts           # Pinia store for app creation chat state
│       │   └── app.ts            # Pinia store for app data and auth
│       ├── utils/
│       │   ├── format.ts         # Shared formatIfDate utility (ISO → localized RU date)
│       │   ├── markdown.ts       # Shared renderMd (marked + DOMPurify)
│       │   ├── dataKey.ts        # Shared resolveDataKey with prototype-pollution guard
│       │   ├── chartData.ts      # buildChartDataFromTable utility for table→Chart.js conversion
│       │   ├── showIf.ts         # evaluateShowIf — client-side formula evaluation for component visibility
│       │   ├── styleIf.ts        # evaluateStyleIf — client-side conditional CSS class evaluation
│       │   ├── actionExecutor.ts # executeActions — sequential action chain executor for Button/InputText/Form
│       │   └── formula/          # Client-side copy of the formula parser (tokenizer, parser, evaluator)
│       ├── api/index.ts          # Axios instance with JWT + X-User-Id interceptor
│       └── router/index.ts       # Vue Router with regex-constrained params
│
└── server/                 # Express + TypeScript backend
    └── src/
        ├── db/
        │   ├── schema.ts         # Drizzle schema: users, apps, cronJobs, appData, chatHistory, userTables, userRows
        │   ├── queries.ts        # Shared DB queries (getLatestAppData)
        │   └── index.ts          # SQLite + Drizzle connection
        ├── middleware/
        │   └── auth.ts           # requireAuthIfProtected middleware (shared by app.ts and tables.ts)
        ├── services/
        │   ├── aiService.ts      # Unified AI service: Anthropic or DeepSeek via AI_PROVIDER
        │   └── cronManager.ts    # node-cron scheduler for app automations
        ├── routes/
        │   ├── users.ts          # POST/GET /api/users — user creation and lookup
        │   ├── chat.ts           # POST/GET /api/chat — home brainstorm flow + chat history
        │   ├── app.ts            # GET/POST /api/app/:hash — app access, chat, data writes
        │   └── tables.ts         # CRUD /api/app/:hash/tables — user-defined tables and rows
        ├── utils/
        │   ├── fetchProxy.ts     # SSRF-safe HTTP fetch + dataPath extraction (shared by cron + action endpoint)
        │   └── formula/          # Safe formula engine (tokenizer, parser, evaluator)
        └── index.ts              # Express entry point
```

### Routes

| Path | View | Description |
|------|------|-------------|
| `/` | HomeView | Landing — create new user or enter existing userId |
| `/:userId` | UserView | Personal page with app list and AI creation chat |
| `/:userId/:hash` | AppView | App view with two-column layout (redirects to first page for multi-page apps) |
| `/:userId/:hash/:pageId` | AppView | Specific page of a multi-page app |
| `/app/:hash` | AppView | Backward-compatible (userId = null) |

### Data Flow

- User creation: client → `POST /api/users` → returns `{ userId }` → stored in `localStorage`
- App list: client → `GET /api/users/:userId/apps` → list of user's apps
- Creation chat: client → `POST /api/chat` (with `userId`) → AI service (brainstorm phase) → response with mood/phase
- App creation: when the AI returns `phase: 'created'`, server generates a 64-char hex hash, creates the app row, schedules cron jobs, and creates user-defined tables
- App access: client → `GET /api/app/:hash` → returns config + latest appData (JWT required if password set)
- In-app chat: client → `POST /api/app/:hash/chat` → AI service → optional UI update and/or memory update
- Chat history: restored on page load from `GET /api/chat?sessionId=...&userId=...` / `GET /api/app/:hash/chat`
- AI memory: each in-app response may include a `memoryUpdate` saved to `apps.notes` and injected into future AI calls
- User-triggered writes: Button/InputText/Form/CardList → `POST /api/app/:hash/data` → appData updated, UI refreshes
- Action chains: Button/InputText/Form support `actions: ActionStep[]` — ordered list of steps executed sequentially on user interaction; 5 types: `writeData` (write to appData), `navigateTo` (page navigation), `toggleVisibility` (toggle boolean for showIf), `runFormula` (evaluate formula client-side), `fetchUrl` (proxy HTTPS fetch via server); max 5 steps per chain; legacy `action` field still supported
- Append mode: InputText/Form support `mode: "append"` — each save adds an item to an array
- Delete item: CardList delete button → `POST /api/app/:hash/data` with `mode: "delete-item"` + `index`
- Cron jobs: node-cron runs scheduled actions (log_entry, fetch_url, send_reminder, aggregate_data, compute) and writes results to appData
- User-defined tables: AI can define structured tables during app creation; CRUD operations available via `/api/app/:hash/tables` endpoints (create/list/update/delete tables, add/update/delete rows)
- Table data binding: components with `dataSource: { type: "table", tableId }` bind directly to table data — DataTable/CardList display rows, Form writes rows, Chart builds graphs from table data
- Row filtering: `dataSource` supports an optional `filter` field — single condition `{ column, operator?, value }` or array (AND logic); operators: `eq` (default), `ne`, `lt`, `lte`, `gt`, `gte`, `contains`; server filters rows in memory; enables multi-page apps with per-page views of the same table (e.g., tasks filtered by priority)
- Multi-page apps: app config may include a `pages` array (max 10 pages, each with its own `uiComponents`); AppView renders PrimeVue tab navigation and reflects the active page in the URL as `/:userId/:hash/:pageId`; AI uses `pagesUpdate` response field to replace the pages array

### Security

- **Ownership verification**: Write operations on unprotected apps require the `X-User-Id` header to match the app owner (sent automatically by the Axios interceptor)
- **Data pruning**: Old `app_data` rows are automatically pruned on startup and hourly (keeps latest 100 rows per key per app)
- **CSP headers**: Helmet configures Content-Security-Policy (`'self'` for scripts/default, `'unsafe-inline'` for styles needed by PrimeVue)
- **Trust proxy**: `app.set('trust proxy', 1)` ensures rate limiting works correctly behind a reverse proxy
- **Prototype pollution guard**: `dataKey` resolution blocks `__proto__`, `constructor`, `prototype` segments (client and server)
- **Race condition protection**: Append and delete-item operations are wrapped in database transactions
- **Prompt injection containment**: User-generated app memory is wrapped in XML delimiters before injection into AI prompts
- **Cron job validation**: Action-specific config objects are validated per type before storage (e.g., `fetch_url` requires HTTPS URL)

### Roadmap

Smailo is evolving from a data dashboard builder into a low-code app platform. The transformation is happening in stages, each self-contained and backward-compatible:

1. **User-defined tables** — relational data storage with typed columns (text, number, date, boolean, select) ✅
2. **Table data binding** — bind DataTable, Form, Chart, and CardList to table data via `dataSource` ✅
3. **Formula engine** — computed columns and aggregate functions (SUM, AVG, COUNT) ✅
4. **Conditional logic** — show/hide components and apply conditional styles based on data conditions ✅
5. **Multi-page apps** — multiple pages with shared data and navigation ✅
5.5. **Row filtering** — filter table rows in `dataSource` by column values with 7 operators ✅
6. **Event system** — action chains triggered by user interactions (writeData, navigateTo, toggleVisibility, runFormula, fetchUrl) ✅
7. **Visual editor** — drag-and-drop UI builder alongside the AI chat
8. **Multi-user access** — roles, permissions, and shared apps

See [docs/roadmap-v2.md](docs/roadmap-v2.md) for the full plan.

### Key Technologies

- Frontend: Vue 3, Pinia, Vue Router, PrimeVue 4 (Aura theme), GSAP, Axios
- Backend: Express, Drizzle ORM, better-sqlite3, node-cron, @anthropic-ai/sdk, openai
- Auth: bcryptjs (password hashing), jsonwebtoken (app access tokens)
