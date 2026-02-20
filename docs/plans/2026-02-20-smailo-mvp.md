# Smailo MVP — Monorepo Initialization

## Overview
Initialize the full "Smailo" platform — a personal AI applications builder with automation.
Users chat with an AI that helps them design and create personal apps (trackers, schedulers,
data visualizers), each backed by cron jobs and a dynamic PrimeVue UI. No tests — MVP first.

## Context (from discovery)
- Files/components involved: empty project directory `/Users/dim/code/smailo/`
- Related patterns found: none — greenfield project
- Dependencies identified: full stack (Vue 3, Node.js, Drizzle, SQLite, Claude API)

## Development Approach
- **Testing approach**: Minimal viable — no test files
- Complete each task fully before moving to the next
- Make small, focused changes per task
- No backward compatibility concerns — new project

## What Goes Where
- **Implementation Steps** (`[ ]` checkboxes): everything that can be done in this codebase
- **Post-Completion**: manual verification steps after scaffolding is complete

## Implementation Steps

### Task 1: Root monorepo scaffold
- [x] create root `package.json` with `name: "smailo"`, `private: true`, workspaces `["client", "server"]`
- [x] add root scripts: `dev` (concurrently client+server), `build` (client build), `start` (server prod)
- [x] install root dev deps: `concurrently`
- [x] create `.gitignore` (node_modules, dist, .env, *.sqlite, .DS_Store)
- [x] create `.env.example` with PORT, ANTHROPIC_API_KEY, JWT_SECRET, DATABASE_URL, CLIENT_URL

### Task 2: Server package setup
- [x] create `server/package.json` with all backend deps: express, drizzle-orm, better-sqlite3, node-cron, bcryptjs, jsonwebtoken, multer, @anthropic-ai/sdk, helmet, express-rate-limit
- [x] add dev deps: typescript, tsx, @types/node, @types/express, @types/better-sqlite3, @types/bcryptjs, @types/jsonwebtoken, drizzle-kit
- [x] create `server/tsconfig.json` (target ES2022, module NodeNext, strict false, outDir dist)
- [x] add server scripts: `dev` (tsx watch src/index.ts), `build` (tsc), `start` (node dist/index.js), `db:push` (drizzle-kit push)
- [x] create `server/drizzle.config.ts` pointing to DATABASE_URL

### Task 3: Database schema and connection
- [x] create `server/src/db/schema.ts` with all 4 tables: `apps`, `cronJobs`, `appData`, `chatHistory`
  - `apps`: id, hash (unique 64-hex), passwordHash, appName, description, config (JSON), createdAt, lastVisit
  - `cronJobs`: id, appId (→apps.id), name, schedule, humanReadable, action, config (JSON), isActive, lastRun, nextRun
  - `appData`: id, appId (→apps.id), key, value (JSON), createdAt
  - `chatHistory`: id, appId (nullable→apps.id), sessionId, role, content, phase, createdAt
- [x] create `server/src/db/index.ts` — initialize better-sqlite3 + drizzle, export `db`

### Task 4: Claude API service
- [x] create `server/src/services/claude.ts`
- [x] implement `chatWithClaude(messages, phase)` function using `@anthropic-ai/sdk`
- [x] embed full brainstorm system prompt (mood, message, phase, appConfig JSON format)
- [x] embed full in-app system prompt for `phase === 'chat'`
- [x] parse and validate JSON response from Claude (handle malformed JSON gracefully)
- [x] export `ClaudeResponse` type: `{ mood, message, phase, appConfig? }`

### Task 5: CronManager service
- [x] create `server/src/services/cronManager.ts`
- [x] implement `loadAll()` — query all `isActive=1` jobs from DB, schedule with node-cron
- [x] implement `addJobs(appId, cronJobs[])` — insert jobs into DB and schedule them
- [x] implement action handlers: `log_entry`, `fetch_url`, `send_reminder`, `aggregate_data`
- [x] each job run: update `lastRun`, compute `nextRun`, write result to `appData`
- [x] export singleton `cronManager` instance

### Task 6: API routes — /api/chat
- [x] create `server/src/routes/chat.ts`
- [x] `POST /api/chat`: accept `{ sessionId, message, appHash? }`, persist to `chatHistory`
- [x] load previous messages for session, call `chatWithClaude`
- [x] if `phase === 'created'`: generate hash via `crypto.randomBytes(32).toString('hex')`, insert into `apps`, call `cronManager.addJobs()`
- [x] return `{ mood, message, phase, appHash? }`
- [x] apply `express-rate-limit` (30 req/min) to this route

### Task 7: API routes — /api/app/:hash
- [x] create `server/src/routes/app.ts`
- [x] `GET /api/app/:hash`: if `passwordHash` set, require `Authorization: Bearer <token>` JWT; return app config + latest appData
- [x] `POST /api/app/:hash/verify`: accept `{ password }`, bcrypt compare, return `{ token }` JWT (7 days, secret from env)
- [x] `GET /api/app/:hash/data`: return all `appData` rows for this app
- [x] `POST /api/app/:hash/chat`: accept `{ message }`, call Claude with `phase=chat`, return `{ mood, message, uiUpdate? }`

### Task 8: Express server entry point
- [x] create `server/src/index.ts`
- [x] configure express: JSON body parser, CORS (CLIENT_URL from env), helmet
- [x] mount routes: `/api/chat`, `/api/app`
- [x] on startup: call `cronManager.loadAll()`
- [x] listen on PORT from env (default 3000)

### Task 9: Client package setup
- [x] scaffold `client/` with `npm create vite@latest . -- --template vue-ts` (or manual)
- [x] create `client/package.json` with deps: vue, vue-router, pinia, primevue@4, primeicons, @primevue/themes, gsap, axios, uuid
- [x] create `client/vite.config.ts` with proxy: `/api` → `http://localhost:3000`
- [x] create `client/src/main.ts`: install PrimeVue (Aura theme), PrimeIcons, Pinia, Router
- [x] create `client/index.html`

### Task 10: Pinia store + API client
- [x] create `client/src/api/index.ts` — axios instance with baseURL `/api`, interceptor for JWT token
- [x] create `client/src/stores/chat.ts` — Pinia store: `messages[]`, `sessionId`, `mood`, `phase`, `appHash`; action `sendMessage(text)`
- [x] create `client/src/stores/app.ts` — Pinia store: `appConfig`, `appData`, `isAuthenticated`; actions `fetchApp(hash)`, `verifyPassword(hash, pwd)`, `fetchData(hash)`

### Task 11: Smailo.vue SVG component
- [ ] create `client/src/components/Smailo.vue`
- [ ] SVG structure: circular head, two eyes (ellipses + pupils), mouth (path), two eyebrows (paths)
- [ ] style: stroke only, no fill, hand-drawn aesthetic (stroke-linecap: round)
- [ ] prop: `mood: 'idle' | 'thinking' | 'talking' | 'happy' | 'confused'`
- [ ] GSAP `idle`: slow blink every 3s (scaleY pupils 0→1), gentle sway (rotation ±2°)
- [ ] GSAP `thinking`: eyes shift left-right (translateX ±8px), head vibrate (x ±2px fast)
- [ ] GSAP `talking`: mouth open/close (scaleY path 0.5→1.5 rhythm), 300ms loop
- [ ] GSAP `happy`: wide smile (morph mouth path to arc), bounce (y ±10px)
- [ ] GSAP `confused`: head tilt (rotation 15°), fade-in "?" text element
- [ ] `watch(mood)` — kill previous timeline, start new one; `onUnmounted` kill all

### Task 12: InputBar.vue component
- [ ] create `client/src/components/InputBar.vue`
- [ ] PrimeVue `InputText` bound to local `text` ref
- [ ] send button (PrimeVue `Button`) — emit `submit(text)` on click; clear input after
- [ ] Enter keydown handler on input → same submit logic
- [ ] microphone button using `window.SpeechRecognition || window.webkitSpeechRecognition`
- [ ] mic button: red icon when recording, CSS pulse animation during active recording
- [ ] on speech result: fill `text` ref with transcript
- [ ] emit: `submit(message: string)`

### Task 13: AppRenderer.vue component
- [ ] create `client/src/components/AppRenderer.vue`
- [ ] prop: `uiConfig: Array<{ component: string, props: object, dataKey?: string }>`
- [ ] prop: `appData: Record<string, any>`
- [ ] `componentMap`: Card, DataTable, Chart, Timeline, Carousel, Knob, Tag, ProgressBar, Calendar (all from PrimeVue)
- [ ] render each item via `<component :is="componentMap[item.component]" v-bind="item.props" />`
- [ ] pass relevant `appData[item.dataKey]` as `:value` or `:data` prop where applicable

### Task 14: Vue Router
- [ ] create `client/src/router/index.ts`
- [ ] route `/` → `HomeView` (lazy import)
- [ ] route `/app/:hash` → `AppView` (lazy import)
- [ ] history mode

### Task 15: HomeView.vue
- [ ] create `client/src/views/HomeView.vue`
- [ ] white background, Smailo centered at 200px, InputBar fixed at bottom
- [ ] on first message: generate `sessionId` via `uuid` and store in chatStore
- [ ] display messages as chat bubbles (user right, assistant left with Smailo avatar)
- [ ] `sendMessage` calls chatStore action, updates `mood` on Smailo from response
- [ ] when `phase === 'created'`:
  - trigger `mood = 'happy'`
  - show card with link to `/app/:hash`
  - show optional "Set password" form (POST to `/api/app/:hash/set-password` or inline prompt)
- [ ] loading state: Smailo shows `thinking` mood while awaiting response

### Task 16: AppView.vue
- [ ] create `client/src/views/AppView.vue`
- [ ] on mount: `appStore.fetchApp(hash)` — if 401 → show password form
- [ ] password form: PrimeVue `Password` input + submit → `appStore.verifyPassword(hash, pwd)`; store JWT in localStorage
- [ ] after auth: layout — small Smailo (40px) top-left, app name as `<h1>`, AppRenderer in main area, InputBar fixed bottom
- [ ] InputBar submit → `appStore`-level chat action → update `mood` and optionally re-fetch data for `uiUpdate`
- [ ] polling or manual refresh button for appData

### Task 17: README
- [ ] create `README.md` at root with: project description, prerequisites (Node 20+), setup steps (`cp .env.example .env`, `npm install`, `npm run db:push`, `npm run dev`), architecture overview

## Technical Details

**Hash generation**: `crypto.randomBytes(32).toString('hex')` → 64-char hex string

**JWT flow**: `POST /api/app/:hash/verify` → bcrypt compare → `jwt.sign({ hash }, JWT_SECRET, { expiresIn: '7d' })` → client stores in localStorage → sends as `Authorization: Bearer <token>`

**Claude response parsing**: Claude always returns JSON string; parse with try/catch; fallback mood: `'confused'` if parse fails

**CronManager action types**:
- `log_entry`: insert timestamp + config data into `appData`
- `fetch_url`: GET request, store response body in `appData`
- `send_reminder`: log reminder text to `appData` (future: webhook)
- `aggregate_data`: sum/count existing `appData` entries, write aggregate

**PrimeVue theme**: Aura preset, import in main.ts via `@primevue/themes/aura`

**CORS**: server allows origin from `CLIENT_URL` env var (default `http://localhost:5173`)

## Post-Completion
*Manual steps after scaffolding is complete*

**Install and verify**:
- `npm install` at root
- add real `ANTHROPIC_API_KEY` to `.env`
- `npm run db:push` to create SQLite tables
- `npm run dev` — verify both client (5173) and server (3000) start

**Manual flow test**:
- Open `http://localhost:5173`
- Chat with Smailo through brainstorm → confirm → created phases
- Verify app link appears and navigates to `/app/:hash`
- Verify cron jobs are scheduled (check server logs)

**Smoke checks**:
- Smailo SVG renders with all 5 mood animations
- Speech-to-text mic button works in Chrome
- AppRenderer renders at least DataTable and Card components
