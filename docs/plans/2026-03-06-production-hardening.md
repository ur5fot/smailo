# Production Hardening

## Overview
- Подготовка Smailo к production-деплою на Railway
- Graceful shutdown, глобальная обработка ошибок, health checks
- Dockerfile с multi-stage build, production static serving
- Structured logging (Pino), error tracking (Sentry)
- GitHub Actions CI (test → build), env validation
- DB backups

## Context (from discovery)
- Express + better-sqlite3 backend, Vue 3 + Vite frontend
- Сейчас: только console.log, нет Docker, нет CI/CD, нет graceful shutdown
- WAL mode включён, foreign keys включены
- Rate limiting есть (in-memory), но нет Redis (достаточно для single-instance Railway)
- 817 серверных тестов, 393 клиентских — все проходят
- Деплой на Railway: PaaS с auto-deploy из GitHub, Dockerfile для production
- SQLite подходит для single-instance Railway (без горизонтального масштабирования)
- ⚠️ Railway имеет ephemeral filesystem — нужен Volume для SQLite persistence
- ⚠️ Root `npm run build` строит только client — нужно обновить для server
- ⚠️ `cronManager.stopAll()` не существует — нужно реализовать
- ⚠️ `sqlite` instance не экспортирован из `db/index.ts` — нужно для graceful shutdown
- ⚠️ Alpine Linux требует build-зависимости для better-sqlite3 (python3, make, g++)
- 76 `console.log/warn/error` в 11 серверных файлах — требуется structured migration

## Development Approach
- **Testing approach**: Regular (code first, tests after)
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: required for every task (vitest)
- Server tests: `npm test --workspace=server`
- Client tests: `npm test --workspace=client`

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Environment validation + NODE_ENV
- [x] Создать `server/src/utils/env.ts` — централизованная валидация env vars при старте:
  - Required: `JWT_SECRET` (min 32 chars в production)
  - Required in production: `ANTHROPIC_API_KEY` или `DEEPSEEK_API_KEY`
  - Optional: `PORT` (default 3000), `CLIENT_URL`, `NODE_ENV`, `SENTRY_DSN`
  - Throw с понятным сообщением если required var отсутствует
- [x] Обновить `server/src/index.ts`: импортировать env.ts первым, использовать validated config
- [x] Обновить `server/src/middleware/auth.ts`: использовать env config вместо inline IIFE
- [x] Добавить в `.env.example` все новые переменные с комментариями
- [x] Написать тесты для env validation (missing vars, invalid values, defaults)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 2: Global error handling middleware
- [x] Создать `server/src/middleware/errorHandler.ts`:
  - Express error middleware `(err, req, res, next)` — ловит все необработанные ошибки в routes
  - Логирует ошибку (stack trace в development, без stack в production)
  - Возвращает `{ error: 'Internal server error' }` с status 500
  - Не утекает stack trace клиенту в production
- [x] Добавить `process.on('uncaughtException', ...)` в `index.ts` — логирует и gracefully завершает процесс (после Task 6: добавить `Sentry.captureException()` + `await Sentry.flush(2000)` перед exit)
- [x] Добавить `process.on('unhandledRejection', ...)` в `index.ts` — логирует как error
- [x] Подключить error middleware последним в Express pipeline (`app.use(errorHandler)`)
- [x] Написать тесты для error middleware (синхронная ошибка, async ошибка, не утекает stack)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 3: Graceful shutdown
- [x] Экспортировать `sqlite` instance из `server/src/db/index.ts` (сейчас экспортируется только `db`)
- [x] Реализовать `stopAll()` в `cronManager.ts` — останавливает все активные cron jobs (метод НЕ существует)
- [x] Создать `server/src/utils/shutdown.ts`:
  - Обработка SIGTERM и SIGINT
  - Закрытие HTTP сервера (перестаёт принимать новые соединения, дожидается текущих)
  - Остановка cron jobs через `cronManager.stopAll()`
  - Закрытие SQLite connection через `sqlite.close()`
  - Timeout 10 секунд — force exit если не закрылось
- [x] Обновить `index.ts`: `app.listen()` → сохранить `server` reference, передать в shutdown handler
- [x] Написать тесты для stopAll() в cronManager
- [x] Написать тесты для shutdown logic (signal handling, timeout, cleanup order)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 4: Health check endpoint
- [x] Добавить `GET /api/health` в `server/src/routes/app.ts` или отдельный файл:
  - Проверяет: DB доступна (простой SELECT 1), cron manager loaded
  - Возвращает `{ ok: true, uptime: process.uptime() }`
  - Если DB недоступна: `{ ok: false, error: 'db' }` с status 503
- [x] Не требует аутентификации, не rate-limited (load balancer должен иметь быстрый доступ)
- [x] Написать тесты для health endpoint (success, DB failure)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 5a: Structured logging — logger + middleware
- [x] Установить `pino` + `pino-http` + `pino-pretty` (dev) — `npm install pino pino-http --workspace=server` и `npm install -D pino-pretty --workspace=server`
- [x] Создать `server/src/utils/logger.ts`:
  - Production: JSON output (для Railway log drain)
  - Development: pretty print через pino-pretty (transport)
  - Log levels: по NODE_ENV (development=debug, production=info)
- [x] Настроить `pino-http` middleware:
  - `customProps`: извлекать `userId` (из `X-User-Id` header), `appHash` (из `req.params.hash`)
  - `redact`: `['req.headers.authorization', 'req.headers.cookie']` — не логировать JWT/cookies
  - `autoLogging.ignore`: пропускать `/api/health` и static assets (`/assets/*`, `.js`, `.css`)
  - `genReqId`: предпочитать входящий `X-Request-Id`, fallback на `crypto.randomUUID()`
- [x] Добавить response header `X-Request-Id` — возвращать request ID клиенту для корреляции
- [x] Подключить pino-http middleware в Express pipeline
- [x] Написать тесты для logger creation (correct level by env, JSON output в production)
- [x] Написать тесты для request ID (incoming header preserved, fallback generated)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 5b: Migrate console.* to Pino (76 occurrences, 11 files)
- [x] Заменить `console.log/warn/error` → Pino во всех серверных файлах:
  - **ВАЖНО**: конвертировать template literals в structured first-argument objects:
    - `console.error(\`Job ${jobId} failed:\`, err)` → `logger.error({ jobId, err }, 'Job failed')`
    - `console.warn(\`fetch_url failed for app ${appId}:\`, msg)` → `logger.warn({ appId }, 'fetch_url failed')`
  - Маппинг уровней:
    - `console.log` (startup) → `logger.info`
    - `console.log` (per-execution, "Running job") → `logger.debug`
    - `console.warn` (bad config, missing data) → `logger.warn`
    - `console.error` (route failures, DB errors) → `logger.error`
- [x] Файлы: cronManager.ts (29), app.ts (14), tables.ts (8), index.ts (6), members.ts (5), chat.ts (4), aiService.ts (4), users.ts (3), auth.ts (1), computedValues.ts (1), formulaColumns.ts (1)
- [x] Написать тест-grep: проверить что `console.log/warn/error` не осталось в server/src (кроме тестов)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 6: Sentry error tracking
- [x] Установить `@sentry/node` — `npm install @sentry/node --workspace=server`
- [x] Создать `server/src/utils/sentry.ts`:
  - Init Sentry только если `SENTRY_DSN` задан (опционален в dev)
  - `environment`: из NODE_ENV
  - `release`: из package.json version
  - Проверить актуальный API `@sentry/node` (v8+) — `setupExpressErrorHandler` может быть deprecated
- [x] Интегрировать с Express: Sentry error handler перед custom error handler
- [x] Добавить Sentry middleware для context enrichment: `appHash`, `userId`, `requestId` в каждый event
- [x] Обновить `errorHandler.ts`: `Sentry.captureException(err)` перед ответом клиенту
- [x] Обновить `process.on('uncaughtException')`: `Sentry.captureException()` + `await Sentry.flush(2000)` ПЕРЕД `process.exit(1)` — без flush event потеряется
- [x] Добавить `Sentry.captureException()` в `cronManager.ts` runJob catch block — фоновые ошибки не проходят через Express middleware
- [x] Добавить `Sentry.captureException()` в `aiService.ts` parseResponse failure — AI parse failures критичны
- [x] Написать тесты: Sentry не крашится если DSN не задан, init вызывается при наличии DSN, captureException вызывается в cron/AI catch
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 7: Static asset serving в production
- [x] Обновить `server/src/index.ts`: в production (`NODE_ENV=production`) сервить `client/dist` через `express.static`
- [x] SPA fallback: все не-`/api` GET запросы → `client/dist/index.html` (для Vue Router HTML5 history mode)
- [x] Cache headers: `max-age=31536000` для assets с хешем в имени (js, css), `no-cache` для index.html
- [x] Обновить `npm run start` script в root package.json: `NODE_ENV=production node server/dist/index.js`
- [x] Написать тесты: static middleware подключается в production, не подключается в development
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 8: Dockerfile (multi-stage build)
- [ ] Обновить root `package.json` build script: `"build": "npm run build --workspace=client && npm run build --workspace=server"` (сейчас строит только client!)
- [ ] Создать `Dockerfile` в корне проекта:
  - Stage 1 (build): `node:20-alpine`, установить build-зависимости: `python3 make g++` (нужны для better-sqlite3 native compilation), `npm ci`, `npm run build`
  - Stage 2 (runtime): `node:20-alpine`, установить `libstdc++` (runtime dep для better-sqlite3), copy только `server/dist`, `client/dist`, `node_modules` (production only), `package.json`, `server/package.json`
  - `EXPOSE 3000`, `CMD ["node", "server/dist/index.js"]`
  - `HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1` (curl не установлен в Alpine!)
  - `ENV DATABASE_PATH=/data/smailo.sqlite` — default path для Volume mount
- [ ] Создать `.dockerignore`: `node_modules`, `.git`, `*.sqlite*` (glob для WAL/SHM), `.env`, `dist/`
- [ ] Создать `docker-compose.yml` для локальной разработки:
  - Сервис `app`: build context, port mapping, volume для SQLite data, env_file
  - Named volume `smailo-data` mounted to `/data`
- [ ] Проверить что Docker build проходит: `docker build -t smailo .`
- [ ] Проверить что контейнер стартует и /api/health отвечает
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 9: GitHub Actions CI
- [ ] Создать `.github/workflows/ci.yml`:
  - Trigger: push to master, pull_request to master
  - Matrix: Node 20.x
  - Steps: checkout → npm ci → type-check server → type-check client → test server → test client → build
- [ ] Добавить build step: `npm run build` (client + server) — проверяет что production build не сломан
- [ ] Env vars для CI: `JWT_SECRET=ci-test-secret`
- [ ] Проверить что workflow проходит (если есть возможность запустить локально с act)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 10: DB backup utility
- [ ] Создать `server/src/utils/dbBackup.ts`:
  - Функция `backupDatabase(destPath)` — использует SQLite `.backup()` API из better-sqlite3
  - Backup в файл с timestamp: `smailo-backup-YYYY-MM-DD-HHmmss.sqlite`
  - Cleanup: удалять бэкапы старше 7 дней
- [ ] Добавить cron job в `index.ts`: ежедневный backup в `/data/backups/` (опционально, через env `BACKUP_DIR`)
- [ ] Добавить `npm run db:backup` script в server package.json
- [ ] Написать тесты для backup (создание файла, cleanup старых)
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 11: Railway deployment config
- [ ] Создать `railway.toml`:
  ```toml
  [build]
  builder = "DOCKERFILE"
  dockerfilePath = "Dockerfile"

  [deploy]
  healthcheckPath = "/api/health"
  healthcheckTimeout = 10
  restartPolicyType = "ON_FAILURE"
  ```
- [ ] ⚠️ Railway Volume: настроить persistent volume mounted to `/data` для SQLite:
  - `DATABASE_PATH=/data/smailo.sqlite`
  - `BACKUP_DIR=/data/backups`
  - Без Volume данные теряются при redeploy!
- [ ] Запустить тесты — должны проходить перед следующим таском

### Task 12: Verify acceptance criteria
- [ ] Verify: `npm run build` проходит без ошибок (client + server)
- [ ] Verify: Docker build проходит и контейнер стартует
- [ ] Verify: /api/health отвечает 200 с корректным payload
- [ ] Verify: graceful shutdown работает (SIGTERM → сервер завершается чисто)
- [ ] Verify: structured logging выводит JSON в production
- [ ] Verify: ошибка в route → 500 без stack trace в production
- [ ] Verify: static assets раздаются в production mode
- [ ] Verify: CI workflow проходит все шаги
- [ ] Verify: `console.log/warn/error` не осталось в server/src (кроме тестов)
- [ ] Run full test suite (server + client)

### Task 13: [Final] Update documentation
- [ ] Обновить `README.md` — секция Deployment (Docker, Railway, env vars)
- [ ] Обновить `README.ru.md` — то же самое на русском
- [ ] Обновить `CLAUDE.md` — добавить: env config, logging, health check, error handling, deployment
- [ ] Обновить `.env.example` — все новые переменные

## Technical Details

### Environment variables (полный список)
```
# Required
JWT_SECRET=<min 32 chars>
ANTHROPIC_API_KEY=<or DEEPSEEK_API_KEY>

# Optional
PORT=3000
NODE_ENV=production|development
CLIENT_URL=https://yourdomain.com
AI_PROVIDER=anthropic|deepseek
ANTHROPIC_MODEL=claude-sonnet-4-6
SENTRY_DSN=https://...@sentry.io/...
BACKUP_DIR=/data/backups
DATABASE_PATH=/data/smailo.sqlite
```

### Dockerfile structure
```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
RUN apk add --no-cache libstdc++
WORKDIR /app
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json ./server/
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/smailo.sqlite
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/dist/index.js"]
```

### Graceful shutdown flow
```
SIGTERM received
  → Stop accepting new connections
  → Stop cron jobs
  → Wait for in-flight requests (max 10s)
  → Close DB connection
  → process.exit(0)

Timeout (10s)
  → Force process.exit(1)
```

### Pino logger config
```ts
import pino from 'pino'
import crypto from 'crypto'

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
})

// pino-http config
export const httpLoggerOptions = {
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customProps: (req) => ({
    userId: req.headers['x-user-id'] || null,
    appHash: req.params?.hash || null,
  }),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  autoLogging: {
    ignore: (req) => req.url === '/api/health'
      || req.url?.startsWith('/assets/')
      || req.url?.endsWith('.js')
      || req.url?.endsWith('.css'),
  },
}
```

### Structured logging migration rules
```
# Конвертировать template literals в structured fields (first-argument object):
console.error(`Job ${jobId} failed:`, err)    → logger.error({ jobId, err }, 'Job failed')
console.warn(`Invalid config for ${appId}`)   → logger.warn({ appId }, 'Invalid config')
console.log(`Server listening on ${port}`)    → logger.info({ port }, 'Server listening')
console.log(`Running job ${jobId}`)           → logger.debug({ jobId }, 'Running job')  # debug, не info!
```

## Post-Completion

**Manual verification:**
- Deploy to Railway staging environment
- Настроить Railway Volume для `/data` (SQLite persistence!)
- Verify health check works from outside
- Trigger an error → check Sentry receives it
- Check logs в Railway dashboard — JSON format, request IDs
- Kill container → verify graceful shutdown in logs
- Create app → verify full flow works in production

**Sentry configuration (в UI, не код):**
- Alert on first occurrence of a new error type
- Alert if error rate exceeds N per hour
- Alert if cron job fails repeatedly

**Follow-up (отдельные планы):**
- Client-side Sentry (`@sentry/vue`) — отслеживание frontend ошибок
- Пагинация для больших таблиц (убрано из этого плана — это фича, не hardening)
- External uptime monitoring (UptimeRobot / Betteruptime)
- Database query timing для обнаружения медленных запросов

**Ongoing maintenance:**
- Monitor Sentry for new errors
- Check DB backup cron runs daily
- Review Railway metrics (CPU, memory, response times)
- Update dependencies monthly (npm audit)
