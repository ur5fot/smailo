# Smailo

A personal AI applications builder. Chat with Smailo — an expressive AI assistant — to design and create personal apps like trackers, schedulers, and data visualizers. Each app gets a dynamic PrimeVue UI and optional cron jobs that run automatically in the background.

## How It Works

1. Open the home page and describe your app idea to Smailo
2. Smailo walks you through a brainstorm → confirm → created flow
3. Once created, your app gets a unique URL you can bookmark
4. Optionally set a password to protect your app
5. Inside your app, chat with Smailo to update the UI or add automations

## Prerequisites

- Node.js 20+
- An Anthropic API key

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
| JWT_SECRET         | Secret used to sign app access tokens            | —                         |
| DATABASE_URL       | Path to the SQLite database file                 | ./smailo.sqlite           |
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
│       │   ├── Smailo.vue        # Animated SVG character (5 moods)
│       │   ├── InputBar.vue      # Text input with speech recognition
│       │   └── AppRenderer.vue   # Dynamic PrimeVue component renderer
│       ├── views/
│       │   ├── HomeView.vue      # Chat interface for creating apps
│       │   └── AppView.vue       # Per-app view with auth and data
│       ├── stores/
│       │   ├── chat.ts           # Pinia store for home chat state
│       │   └── app.ts            # Pinia store for app data and auth
│       ├── api/index.ts          # Axios instance with JWT interceptor
│       └── router/index.ts       # Vue Router (/ and /app/:hash)
│
└── server/                 # Express + TypeScript backend
    └── src/
        ├── db/
        │   ├── schema.ts         # Drizzle schema: apps, cronJobs, appData, chatHistory
        │   └── index.ts          # SQLite + Drizzle connection
        ├── services/
        │   ├── claude.ts         # Claude API integration with phase-aware prompts
        │   └── cronManager.ts    # node-cron scheduler for app automations
        ├── routes/
        │   ├── chat.ts           # POST /api/chat — home brainstorm flow
        │   └── app.ts            # GET/POST /api/app/:hash — app access and chat
        └── index.ts              # Express entry point
```

### Data Flow

- Home chat: client → `POST /api/chat` → Claude (brainstorm phase) → response with mood/phase
- App creation: when Claude returns `phase: 'created'`, server generates a 64-char hex hash, creates the app row, and schedules any cron jobs
- App access: client → `GET /api/app/:hash` → returns config + latest appData (JWT required if password set)
- In-app chat: client → `POST /api/app/:hash/chat` → Claude (chat phase) → optional UI update
- Cron jobs: node-cron runs scheduled actions (log_entry, fetch_url, send_reminder, aggregate_data) and writes results to appData

### Key Technologies

- Frontend: Vue 3, Pinia, Vue Router, PrimeVue 4 (Aura theme), GSAP, Axios
- Backend: Express, Drizzle ORM, better-sqlite3, node-cron, @anthropic-ai/sdk
- Auth: bcryptjs (password hashing), jsonwebtoken (app access tokens)
