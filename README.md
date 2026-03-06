# Smailo

> ⚡ **Vibe coding project** — built entirely through AI-assisted development (Claude Code). Production-hardened with structured logging (Pino), error tracking (Sentry), graceful shutdown, health checks, Docker multi-stage build, and CI/CD. Not recommended for storing sensitive data.

A personal AI applications builder. Chat with Smailo — an expressive AI assistant — to design and create personal apps like trackers, task lists, schedulers, and data visualizers. Each app gets a dynamic PrimeVue UI and optional cron jobs that run automatically in the background.

## How It Works

1. Open the home page — create a new personal user ID or enter an existing one
2. On your user page, pick an example app or describe your idea to Smailo in the AI chat
3. Smailo walks you through a brainstorm → confirm → created flow
4. Once created, your app gets a unique URL at `/:userId/:hash` you can bookmark
5. Optionally set a password to protect your app
6. Inside your app, chat with Smailo in the right panel to update the UI or add automations — or switch to the visual editor to drag-and-drop components on a 12-column grid, resize them, and edit properties directly
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
| JWT_SECRET         | Secret for signing tokens (min 32 chars in prod) | —                         |
| ANTHROPIC_API_KEY  | Your Anthropic API key (required for anthropic)  | —                         |
| ANTHROPIC_MODEL    | Anthropic model name                             | claude-sonnet-4-6         |
| PORT               | Server port                                      | 3000                      |
| NODE_ENV           | Environment: production or development           | development               |
| DATABASE_URL       | Path to the SQLite database file                 | smailo.sqlite             |
| DATABASE_PATH      | SQLite path in Docker/Railway (overrides DATABASE_URL) | —                   |
| CLIENT_URL         | Origin allowed by CORS                           | http://localhost:5173     |
| AI_PROVIDER        | AI provider to use: anthropic or deepseek        | anthropic                 |
| DEEPSEEK_API_KEY   | Your DeepSeek API key (required for deepseek)    | —                         |
| DEEPSEEK_MODEL     | DeepSeek model name                              | deepseek-chat             |
| SENTRY_DSN         | Sentry DSN for error tracking (optional)         | —                         |
| BACKUP_DIR         | Directory for daily DB backups                   | —                         |

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
│       │   ├── AppConditionalGroup.vue  # Container that shows/hides children based on a condition
│       │   ├── MembersPanel.vue   # Dialog for managing app members (invite, change role, remove)
│       │   └── editor/
│       │       ├── AppEditor.vue          # Visual drag-and-drop editor canvas (CSS Grid)
│       │       ├── EditorComponentCard.vue # Component card in editor with drag handle and controls
│       │       ├── ComponentPalette.vue    # Draggable component palette (Display, Input, Layout groups)
│       │       └── PropertyEditor.vue     # Property editor panel (props, data, actions, layout)
│       ├── views/
│       │   ├── HomeView.vue      # Landing: create/enter user ID
│       │   ├── UserView.vue      # User page: app list with "My apps" + "Shared with me" sections
│       │   ├── AppView.vue       # Two-column: AppRenderer (left) + in-app AI chat (right)
│       │   └── InviteView.vue    # Accept invite link: login/create user → accept → redirect to app
│       ├── stores/
│       │   ├── user.ts           # Pinia store for user identity and app list
│       │   ├── chat.ts           # Pinia store for app creation chat state
│       │   ├── app.ts            # Pinia store for app data and auth
│       │   └── editor.ts         # Pinia store for visual editor state (edit mode, selection, dirty tracking)
│       ├── utils/
│       │   ├── format.ts         # Shared formatIfDate utility (ISO → localized RU date)
│       │   ├── markdown.ts       # Shared renderMd (marked + DOMPurify)
│       │   ├── dataKey.ts        # Shared resolveDataKey with prototype-pollution guard
│       │   ├── chartData.ts      # buildChartDataFromTable utility for table→Chart.js conversion
│       │   ├── showIf.ts         # evaluateShowIf — client-side formula evaluation for component visibility
│       │   ├── styleIf.ts        # evaluateStyleIf — client-side conditional CSS class evaluation
│       │   ├── actionExecutor.ts # executeActions — sequential action chain executor for Button/InputText/Form
│       │   └── formula/          # Client-side copy of the formula parser (tokenizer, parser, evaluator)
│       ├── api/index.ts          # Axios instance with global JWT + per-app JWT interceptor
│       └── router/index.ts       # Vue Router with regex-constrained params
│
└── server/                 # Express + TypeScript backend
    └── src/
        ├── db/
        │   ├── schema.ts         # Drizzle schema: users, apps, appMembers, appInvites, cronJobs, appData, chatHistory, userTables, userRows
        │   ├── queries.ts        # Shared DB queries (getLatestAppData)
        │   ├── migrateOwners.ts  # Auto-create owner records in app_members for legacy apps on startup
        │   └── index.ts          # SQLite + Drizzle connection
        ├── middleware/
        │   ├── auth.ts           # resolveUserAndRole + requireRole middleware (role-based access control)
        │   └── errorHandler.ts   # Global Express error handler (500 without stack leak in production)
        ├── services/
        │   ├── aiService.ts      # Unified AI service: Anthropic or DeepSeek via AI_PROVIDER
        │   └── cronManager.ts    # node-cron scheduler for app automations
        ├── routes/
        │   ├── users.ts          # POST/GET /api/users — user creation and lookup
        │   ├── chat.ts           # POST/GET /api/chat — home brainstorm flow + chat history
        │   ├── app.ts            # GET/POST /api/app/:hash — app access, chat, data writes
        │   ├── tables.ts         # CRUD /api/app/:hash/tables — user-defined tables and rows
        │   └── members.ts        # /api/app/:hash/members — invite, list, change role, remove members
        ├── utils/
        │   ├── env.ts            # Centralized env validation at startup
        │   ├── logger.ts         # Pino structured logger (JSON in prod, pretty in dev)
        │   ├── shutdown.ts       # Graceful shutdown (SIGTERM/SIGINT handling)
        │   ├── sentry.ts         # Sentry error tracking integration (optional)
        │   ├── dbBackup.ts       # SQLite backup utility with old backup cleanup
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
| `/invite/:hash/:token` | InviteView | Accept invite link — login/create user, then join app |

### Data Flow

- User creation: client → `POST /api/users` → returns `{ userId, token }` → userId and global JWT stored in `localStorage`
- App list: client → `GET /api/users/:userId/apps` → list of user's own apps + shared apps (with role field)
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
- Visual editor: toggle between chat and editor mode in AppView; editor shows components on a 12-column CSS Grid with drag-and-drop reordering, resize handles, a component palette, and a property editor panel; changes are saved via `PUT /api/app/:hash/config`
- Layout metadata: each component may have `layout: { col, colSpan, row?, rowSpan? }` for CSS Grid placement; components without layout default to full-width; responsive breakpoint at 767px forces all components to full-width
- Multi-user access: owners invite users via links; members management panel in AppView header; UserView shows "My apps" and "Shared with me" sections; role badges (editor/viewer) in AppView header; input components disabled for viewers; editor/chat hidden for non-owners
- Invite flow: owner creates invite → link copied → recipient opens `/invite/:hash/:token` → accepts → redirected to app; InviteView handles login/account creation if needed

### Security

- **Role-based access**: Apps support `owner`, `editor`, `viewer` roles via `app_members` table; permissions enforced server-side by `resolveUserAndRole` + `requireRole` middleware
- **Invite links**: Owners generate single-use invite links (`/invite/:hash/:token`) with 7-day expiry; accepting adds the user as a member
- **Row-level security (RLS)**: Tables with `rlsEnabled` filter rows by `createdByUserId` for viewers; owners/editors see all rows
- **Global JWT auth**: Users get a long-lived JWT (`smailo_token`) at creation; per-app JWTs (`smailo_token_<hash>`) still used for password-protected apps; `X-User-Id` header removed
- **Data pruning**: Old `app_data` rows are automatically pruned on startup and hourly (keeps latest 100 rows per key per app)
- **CSP headers**: Helmet configures Content-Security-Policy (`'self'` for scripts/default, `'unsafe-inline'` for styles needed by PrimeVue)
- **Trust proxy**: `app.set('trust proxy', 1)` ensures rate limiting works correctly behind a reverse proxy
- **Prototype pollution guard**: `dataKey` resolution blocks `__proto__`, `constructor`, `prototype` segments (client and server)
- **Race condition protection**: Append and delete-item operations are wrapped in database transactions
- **Prompt injection containment**: User-generated app memory is wrapped in XML delimiters before injection into AI prompts
- **Cron job validation**: Action-specific config objects are validated per type before storage (e.g., `fetch_url` requires HTTPS URL)

### Production Infrastructure

- **Structured logging**: Pino with JSON output in production, pretty-print in development; pino-http middleware with request ID correlation (`X-Request-Id`), auth header redaction, and health check filtering
- **Error tracking**: Optional Sentry integration (`SENTRY_DSN`); captures Express errors, uncaught exceptions, cron job failures, and AI parse errors
- **Health check**: `GET /api/health` — verifies DB connectivity, returns `{ ok, uptime }`; used by Docker HEALTHCHECK and Railway
- **Graceful shutdown**: SIGTERM/SIGINT → stop accepting connections → stop cron jobs → wait for in-flight requests (10s timeout) → close DB → exit
- **Global error handler**: Express error middleware catches unhandled route errors; returns 500 without stack trace in production
- **Static serving**: In production, serves `client/dist` with cache headers (`max-age=1y` for hashed assets, `no-cache` for index.html) and SPA fallback
- **DB backups**: Daily SQLite backup via `.backup()` API; configurable directory (`BACKUP_DIR`); auto-cleanup of backups older than 7 days
- **CI/CD**: GitHub Actions workflow — type-check, test, build on push/PR to master

### Deployment

#### Docker

```sh
# Build and run locally
docker compose up --build

# Or build manually
docker build -t smailo .
docker run -p 3000:3000 -v smailo-data:/data --env-file .env smailo
```

The Dockerfile uses a multi-stage build (node:20-alpine). A named volume mounted at `/data` persists the SQLite database and backups.

#### Railway

The project includes `railway.toml` with Dockerfile builder config and health check settings. Key setup steps:

1. Connect the GitHub repo to Railway
2. Add a persistent volume mounted to `/data` (required for SQLite — without it, data is lost on redeploy)
3. Set environment variables: `JWT_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_PATH=/data/smailo.sqlite`, `BACKUP_DIR=/data/backups`

### Roadmap

Smailo is evolving from a data dashboard builder into a low-code app platform. The transformation is happening in stages, each self-contained and backward-compatible:

1. **User-defined tables** — relational data storage with typed columns (text, number, date, boolean, select) ✅
2. **Table data binding** — bind DataTable, Form, Chart, and CardList to table data via `dataSource` ✅
3. **Formula engine** — computed columns and aggregate functions (SUM, AVG, COUNT) ✅
4. **Conditional logic** — show/hide components and apply conditional styles based on data conditions ✅
5. **Multi-page apps** — multiple pages with shared data and navigation ✅
5.5. **Row filtering** — filter table rows in `dataSource` by column values with 7 operators ✅
6. **Event system** — action chains triggered by user interactions (writeData, navigateTo, toggleVisibility, runFormula, fetchUrl) ✅
7. **Visual editor** — drag-and-drop UI builder alongside the AI chat ✅
8. **Multi-user access** — roles (owner/editor/viewer), invite links, row-level security, shared apps ✅

See [docs/roadmap-v2.md](docs/roadmap-v2.md) for the full plan.

### Key Technologies

- Frontend: Vue 3, Pinia, Vue Router, PrimeVue 4 (Aura theme), GSAP, Axios
- Backend: Express, Drizzle ORM, better-sqlite3, node-cron, @anthropic-ai/sdk, openai
- Auth: bcryptjs (password hashing), jsonwebtoken (app access tokens)
