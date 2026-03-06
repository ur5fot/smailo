# Project Cleanup & Test Coverage

## Overview
- Исправление npm audit уязвимостей (8 vulnerabilities)
- Оптимизация bundle size (AppView 782 KB → code splitting)
- Расширение клиентских тестов (32% → 60%+ покрытие файлов)
- Фокус на критичных непротестированных модулях: formula engine, chat store, display components

## Context (from discovery)
- 872 серверных + 396 клиентских тестов — все проходят
- Клиентские тесты: 19 файлов из 44 source files (32% file coverage)
- Критичные пробелы: formula engine (766 lines, 0 тестов), chat.ts store (0 тестов), display components (1437 lines, 0 тестов)
- npm audit: 2 high (minimatch, rollup), 6 moderate (dompurify, esbuild, vite)
- AppView.vue: 954 lines, bundle chunk 782 KB
- Vite config: нет code-splitting, нет lazy loading

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

### Task 1: Fix npm audit vulnerabilities
- [x] Запустить `npm audit` для baseline
- [x] `npm audit fix` — исправить автоматически fixable (6 moderate)
- [x] Для оставшихся high: проверить есть ли новые версии vite/drizzle-kit, обновить если безопасно
- [x] Если high не фиксятся (dev-only): документировать в комментарии почему приемлемо
- [x] Запустить `npm test --workspace=server && npm test --workspace=client` — всё должно проходить
- [x] Запустить `npm run build` — build не сломан
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 2: Route-based code splitting
- [x] Обновить `client/src/router/index.ts`: lazy import для тяжёлых views:
  - `AppView`: `() => import('../views/AppView.vue')`
  - `UserView`: `() => import('../views/UserView.vue')`
  - `InviteView`: `() => import('../views/InviteView.vue')`
  - `HomeView` оставить eager (landing page, должна грузиться мгновенно)
- [x] Проверить что роутинг работает (dev mode, navigate между views)
- [x] Запустить `npm run build` — проверить что chunk split произошёл (AppView больше не 782 KB в main chunk)
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 3: Тесты для client formula engine
- [x] Создать `client/src/utils/formula/__tests__/tokenizer.test.ts`:
  - Tokenize numbers, strings, identifiers, operators
  - Tokenize function calls, member access
  - Edge cases: Cyrillic identifiers, empty input, max length
- [x] Создать `client/src/utils/formula/__tests__/parser.test.ts`:
  - Parse arithmetic, comparisons, logic operators
  - Parse function calls, member access
  - Error cases: invalid syntax, max depth
- [x] Создать `client/src/utils/formula/__tests__/evaluator.test.ts`:
  - Arithmetic: +, -, *, /, %
  - Comparisons: ==, !=, <, >, <=, >=
  - Logic: &&, ||, !
  - Built-in functions: IF, ABS, ROUND, UPPER, LOWER, CONCAT, LEN
  - Error handling: division by zero → null, missing refs → null
  - Edge cases: type coercion, nested expressions, max depth
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 4: Тесты для chat.ts store
- [x] Создать `client/src/stores/__tests__/chat.test.ts`:
  - `initSession(userId)`: sets sessionId to `home-<userId>`, loads history
  - `reset()`: generates new random session ID
  - `addMessage()`: adds message to array
  - Phase transitions: brainstorm → confirm → created
  - `appHash` set after creation phase
  - Error handling: API errors during loadHistory
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 5: Тесты для dataKey.ts и chartData.ts
- [x] Создать `client/src/utils/__tests__/dataKey.test.ts`:
  - Simple key lookup
  - Dot notation: `"rates.USD"` → nested access
  - Auto-parse JSON strings
  - Missing segments → undefined
  - Prototype pollution blocked: `__proto__`, `constructor`, `prototype`
- [x] Создать `client/src/utils/__tests__/chartData.test.ts`:
  - `buildChartDataFromTable()`: first column as labels, numeric columns as datasets
  - Empty table → empty chart data
  - Mixed column types → only numeric as datasets
  - Single column table
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 6: Тесты для input components (AppButton, AppInputText, AppForm)
- [x] Создать `client/src/components/__tests__/AppButton.test.ts`:
  - Renders button with label
  - Click triggers action chain (mock executeActions)
  - Disabled when role is viewer or no role
  - Loading state during action execution
- [x] Создать `client/src/components/__tests__/AppInputText.test.ts`:
  - Renders text/number/date input variants
  - Validates empty input → error message
  - Calls executeActions with inputValue on save
  - Falls back to legacy action prop
  - Disabled for viewer role
- [x] Создать `client/src/components/__tests__/AppForm.test.ts`:
  - Renders fields from props.fields
  - Table mode: auto-generates fields from table schema
  - Validates required fields
  - Submits to correct API (KV mode vs table mode)
  - Calls executeActions after submit
  - Resets form after successful submit
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 7: Тесты для display components (AppCard, AppDataTable, AppCardList)
- [x] Создать `client/src/components/__tests__/AppCard.test.ts`:
  - Renders value from dataKey
  - Renders computedValue
  - Handles undefined/null data gracefully
- [x] Создать `client/src/components/__tests__/AppDataTable.test.ts`:
  - Table mode: auto-generates columns from schema
  - Renders rows from table data
  - KV mode: renders from appData
- [x] Создать `client/src/components/__tests__/AppCardList.test.ts`:
  - Table mode: renders cards from table rows
  - Delete button shown for owner/editor only (operator precedence fix verified)
  - Delete row calls correct API
  - KV mode: renders from appData array
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 8: Тесты для AppRenderer
- [x] Создать `client/src/components/__tests__/AppRenderer.test.ts`:
  - Renders components from uiConfig array
  - CSS Grid layout: col, colSpan applied correctly
  - Default full-width when no layout
  - showIf: hides component when falsy
  - styleIf: applies conditional CSS classes
  - dataKey resolution: simple, dot notation, JSON parse
  - dataSource takes priority over computedValue and dataKey
  - computedValue takes priority over dataKey
  - Unknown component type handled gracefully
  - on* props stripped from resolved props
- [x] Запустить тесты — должны проходить перед следующим таском

### Task 9: Verify acceptance criteria
- [ ] Verify: `npm audit` показывает 0 high vulnerabilities (или документировано почему приемлемо)
- [ ] Verify: `npm run build` — chunk sizes уменьшились (AppView в отдельном chunk)
- [ ] Verify: клиентских тест-файлов >= 27 (было 19, добавлено ~8+)
- [ ] Verify: formula engine, chat store, dataKey, chartData протестированы
- [ ] Verify: input и display components протестированы
- [ ] Run full test suite: `npm test --workspace=server && npm test --workspace=client`

### Task 10: [Final] Update documentation
- [ ] Обновить CLAUDE.md если новые паттерны тестирования обнаружены

## Technical Details

### Текущее покрытие клиентских тестов
| Категория | Файлов | Протестировано | % |
|-----------|--------|---------------|---|
| Stores | 4 | 3 | 75% |
| Views | 4 | 2 (partial) | 25% |
| Display components | 11 | 0 | 0% |
| Input components | 3 | 0 | 0% |
| Formula engine | 4 | 0 | 0% |
| Utils (core) | 7 | 3 | 43% |
| Utils (conditional) | 5 | 4 | 80% |

### После выполнения плана (цель)
| Категория | Файлов | Протестировано | % |
|-----------|--------|---------------|---|
| Stores | 4 | 4 | 100% |
| Views | 4 | 2 (partial) | 25% |
| Display components | 11 | 3 | 27% |
| Input components | 3 | 3 | 100% |
| Formula engine | 4 | 3 | 75% |
| Utils (core) | 7 | 5 | 71% |
| Utils (conditional) | 5 | 4 | 80% |

### npm audit baseline (2026-03-06)
- 2 high: minimatch (ReDoS), rollup (Path Traversal) — FIXED via `npm audit fix`
- 1 moderate: dompurify (XSS) — FIXED via `npm audit fix`
- 5 moderate: esbuild (dev server cross-origin, GHSA-67mh-4wv8-2f99) via vite 5.x & drizzle-kit 0.30.x
  - Fix requires vite 6.2+ (breaking) or drizzle-kit 0.31.9 (breaking) — too risky for this cleanup
  - Dev-only: esbuild vulnerability only affects local dev server, not production builds or runtime
  - Accepted risk: no production impact, all are devDependencies
- Final: 0 high, 5 moderate (all dev-only esbuild, accepted)

## Post-Completion

**Follow-up (отдельные планы):**
- Тесты для Views (UserView, HomeView) — требуют сложный DOM setup
- Тесты для Smailo.vue (576 lines) — AI chat component
- Тесты для AppEditor.vue (628 lines) — visual editor canvas
- ESLint/Prettier setup (optional)
