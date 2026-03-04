# Stage 6: Event System & Action Chains

## Overview

Replace the current single-action `action: { key, value, mode }` on Button/InputText with a
full action chain `actions: ActionStep[]` — an ordered list of steps executed sequentially when
a user interaction fires (click, save, submit).

Five action types:
- `writeData` — write a value to appData (replaces current `action`)
- `navigateTo` — navigate to another page (uses Vue Router; no-op on single-page apps)
- `toggleVisibility` — toggle a boolean key in appData (used with `showIf`)
- `runFormula` — evaluate a formula client-side and write result to appData
- `fetchUrl` — proxy-fetch an HTTPS URL through the server, store result in appData

Migration: at save time, old `action` field is converted to `actions[0]` of type `writeData`.
Client components also support legacy `action` field as fallback (for apps in DB not yet re-saved).

Server validates chains: max 5 steps, per-type field checks.
Cycle detection: N/A — linear chains have no branching, cycles are structurally impossible.

## Context (from discovery)

- **UiComponent type**: `server/src/services/aiService.ts` lines 45–59 — `action?: { key, value?, mode? }`
- **Existing modes**: POST `/api/app/:hash/data` supports `'append' | 'increment' | 'delete-item'` (delete-item requires extra `index` field)
- **Button/InputText validator**: currently REQUIRES `action.key`; must be updated to accept `actions` as alternative
- **AppButton.vue**: `@click` → POST `/api/app/:hash/data` via `action`
- **AppInputText.vue**: save click → POST with user input
- **AppForm.vue**: submit → POST to KV or table; no `action` prop (actions-only, no legacy fallback needed)
- **AppRenderer.vue**: only passes `:action="item.action"` — needs to also pass `:actions="item.actions"`
- **appData shape**: array of `{ key: string, value: unknown }` (NOT a keyed object); access via `.find(d => d.key === k)`
- **Client formula engine**: `client/src/utils/formula/` — `buildFormulaContext(appData)` builds flat `Record<string,unknown>`; evaluator accepts `{ row?: Record<string,unknown> }` context — pass as `{ row: formulaContext }`
- **Router in components**: `useRouter()` / `useRoute()` must be called inside each component (not passed as prop)
- **Store `app.ts`**: has `fetchData()`, `refreshTable()`, no `getDataValue()` — use `appData.value.find(d => d.key === k)?.value` directly
- **SSRF protection**: `cronManager.ts` `handleFetchUrl()` — mixed with cron-specific logic; extract only: private IP check, DNS rebinding, redirect block, 1 MB limit, 10s timeout
- **Rate limits**: existing chatLimiter = 30 req/min; new `/actions/fetch-url` reuses same limiter for consistency
- **dataPath format**: dot notation without `$` prefix: `"data.price"`, `"rates.USD"` (same as cronManager)

## Development Approach

- **Testing approach**: Regular (code first, then tests)
- Complete each task fully before moving to the next
- **CRITICAL: every task MUST include new/updated tests**
- **CRITICAL: all tests must pass before starting next task**
- Backward compat: old `action` field still works client-side via fallback; server converts `action` → `actions` on write

## Testing Strategy

- **Unit tests**: vitest — server (`npm test --workspace=server`) and client (`npm test --workspace=client`)
- No E2E tests in this project

## Progress Tracking

- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix

## What Goes Where

- **Implementation Steps**: code changes, tests, docs
- **Post-Completion**: manual UI/UX verification

## Implementation Steps

### Task 1: Define ActionStep types + server validation + migration

- [x] add types to `server/src/services/aiService.ts` after existing `DataSource` types:
  ```ts
  export type FilterOperator = ...  // (already exists from Stage 5.5)
  export type WriteDataAction   = { type: 'writeData'; key: string; value?: unknown; mode?: 'append' | 'increment' | 'delete-item'; index?: number };
  export type NavigateToAction  = { type: 'navigateTo'; pageId: string };
  export type ToggleVisAction   = { type: 'toggleVisibility'; key: string };
  export type RunFormulaAction  = { type: 'runFormula'; formula: string; outputKey: string };
  export type FetchUrlAction    = { type: 'fetchUrl'; url: string; outputKey: string; dataPath?: string };
  export type ActionStep = WriteDataAction | NavigateToAction | ToggleVisAction | RunFormulaAction | FetchUrlAction;
  ```
  Notes:
  - `delete-item` mode requires `index?: number` field (consistent with existing `/data` endpoint)
  - `dataPath` is dot-notation without `$` prefix: `"data.price"`, `"rates.USD"`
- [x] add `actions?: ActionStep[]` to `UiComponent` type; keep `action?` field for backward compat reading
- [x] add `validateActions(raw: unknown): ActionStep[] | undefined` in `aiService.ts` (inline helper, not exported):
  - must be non-empty array; max 5 steps; unknown `type` → step dropped silently
  - `writeData`: `key` matches `/^[a-zA-Z0-9_]{1,100}$/`; `mode` if present must be `'append'|'increment'|'delete-item'`; `index` if present must be non-negative integer
  - `navigateTo`: `pageId` is non-empty string
  - `toggleVisibility`: `key` matches key regex
  - `runFormula`: `formula` is string ≤500 chars validated via `parseFormula()`; `outputKey` matches key regex
  - `fetchUrl`: `url` starts with `https://`; `outputKey` non-empty string matching key regex; `dataPath` if present is non-empty string
  - if all steps invalid → return `undefined` (empty array treated same as missing)
- [x] update `validateUiComponents()` migration logic:
  - if component has `action: { key }` but no `actions` → convert: `actions = [{ type: 'writeData', key: action.key, value: action.value, mode: action.mode, ...(action.index !== undefined ? { index: action.index } : {}) }]`; delete `action`
  - if component has both `action` and `actions` → keep `actions`, discard `action`
  - Button/InputText: valid when `actions` present (even without `action`); update validator to accept `actions` as alternative to `action` for these components
- [x] write tests in `server/src/__tests__/validateUiComponents.test.ts`:
  - valid chain: multiple steps, all 5 types
  - max 5 steps: chain of 6 → 5 stored, 6th dropped
  - invalid step type → step dropped
  - `writeData` bad key → step dropped
  - `writeData` with `delete-item` mode + `index` → valid
  - `runFormula` invalid formula → step dropped
  - `fetchUrl` with `http://` url → step dropped
  - `fetchUrl` with missing `outputKey` → step dropped
  - old `action` field migrated to `actions[0]` writeData; `action` field removed from result
  - both `action` + `actions` → `action` discarded, `actions` kept
  - Button with `actions` and no `action` → valid component
  - empty array after filtering invalid steps → `actions` absent from component
- [x] run server tests: `npm test --workspace=server`

### Task 2: Server proxy endpoint for fetchUrl action

- [x] create `server/src/utils/fetchProxy.ts` extracting SSRF-safe fetch from `cronManager.ts`:
  - extract only the safety checks: private IP block (127.x, 10.x, 172.16-31.x, 192.168.x, ::1), DNS rebinding check, redirect blocking, 1 MB body limit, 10s timeout
  - signature: `fetchSafe(url: string): Promise<{ body: string; contentType: string }>`
  - returns raw body + content type; caller handles JSON parsing and dataPath extraction
  - does NOT include template substitution (cron-specific) or outputKey logic
- [x] add `extractDataPath(body: string, dataPath?: string): unknown` helper in `fetchProxy.ts`:
  - parse body as JSON; if invalid → return raw body string
  - if `dataPath` absent → return parsed JSON (or raw string)
  - `dataPath` is dot-notation: split by `.`, traverse object; missing key → return `null`
- [x] update `cronManager.ts` to import and use `fetchSafe` + `extractDataPath` (DRY refactor)
- [x] add route `POST /api/app/:hash/actions/fetch-url` in `server/src/routes/app.ts`:
  - body: `{ url: string, outputKey: string, dataPath?: string }`
  - validate: url starts with `https://`; outputKey non-empty and matches key regex
  - call `fetchSafe(url)` then `extractDataPath(body, dataPath)`
  - write result to appData via existing insert logic (same as `/data` endpoint)
  - return `{ ok: true, value: result }` where `value` is the extracted/stored value
  - protected by `requireAuthIfProtected` middleware
  - rate limit: use existing `chatLimiter` (30 req/min) for consistency with other write ops
- [x] write tests in `server/src/__tests__/fetchProxy.test.ts` (new file):
  - `fetchSafe`: private IPs rejected (127.0.0.1, 192.168.1.1, 10.0.0.1, ::1)
  - `fetchSafe`: http:// URL rejected
  - `extractDataPath`: valid JSON + dotted path → correct value
  - `extractDataPath`: valid JSON + missing key → null
  - `extractDataPath`: invalid JSON + no dataPath → raw string
  - `extractDataPath`: no dataPath → full parsed object
- [x] run server tests: `npm test --workspace=server`

### Task 3: Client action executor utility

- [x] create `client/src/utils/actionExecutor.ts`:
  ```ts
  export interface ActionContext {
    hash: string;
    userId: string | null | undefined;
    currentPageId: string | undefined;   // from route.params.pageId (already narrowed to string)
    appData: Array<{ key: string; value: unknown }>;  // current snapshot
    appStore: ReturnType<typeof useAppStore>;
    inputValue?: unknown;    // user-typed value from InputText
  }
  export async function executeActions(actions: ActionStep[], ctx: ActionContext): Promise<void>
  ```
- [x] implement per-type execution:
  - `writeData`: `value = action.value ?? ctx.inputValue ?? true`; POST `/api/app/:hash/data` with `{ key, value, mode, index }`
  - `navigateTo`: if no pages in app config → no-op (log warning); else call `router.push` to `/${ctx.userId}/${ctx.hash}/${action.pageId}` or `/app/${ctx.hash}/${action.pageId}` if no userId
  - `toggleVisibility`: `current = ctx.appData.find(d => d.key === action.key)?.value ?? false`; POST `!current` to `/data`
  - `runFormula`: `formulaCtx = buildFormulaContext(ctx.appData)`; evaluate with `evaluateExpression(action.formula, { row: formulaCtx })`; POST result to `action.outputKey`
  - `fetchUrl`: substitute URL templates (`{key}` → `appData[key]` value, same as cron); POST to `/api/app/:hash/actions/fetch-url` with `{ url: substitutedUrl, outputKey, dataPath }`
  - after ALL steps complete: call `ctx.appStore.fetchData(ctx.hash)` once to refresh appData
- [x] error handling:
  - auth errors (401/403) on any step → abort remaining chain, log error
  - other errors (network, formula eval) → log to console, continue chain
  - fetchData() is called even on partial failure (chain error does not prevent refresh)
- [x] write tests in `client/src/utils/actionExecutor.test.ts` (new file, mock api calls):
  - `writeData`: posts correct payload; uses `inputValue` when `value` not explicit
  - `writeData` with `delete-item` + `index`: posts correct payload
  - `navigateTo`: pushes correct route with userId / without userId
  - `navigateTo` when no pages: no router.push called (no-op)
  - `toggleVisibility`: reads current from appData array, posts negated boolean
  - `runFormula`: evaluates formula, posts result to outputKey
  - `fetchUrl`: substitutes `{key}` templates, posts to fetch-url endpoint
  - `fetchUrl` with missing template key → sends literal empty string or `{key}` unchanged
  - chain: all steps execute in order
  - 401 error on step 2 → steps 3-N skipped; fetchData still called
  - non-auth error on step 2 → steps 3-N still execute
- [x] run client tests: `npm test --workspace=client`

### Task 4: Wire actions into Button, InputText, Form + AppRenderer

- [ ] update `AppRenderer.vue`: pass `item.actions` alongside `item.action` to input wrapper components
  - add `:actions="item.actions"` to AppButton, AppInputText, AppForm slots/component bindings
  - also pass `:current-page-id="currentPageId"` — AppRenderer must receive `currentPageId` prop from AppView or derive from `useRoute()`
- [ ] update `AppButton.vue`:
  - add props: `actions?: ActionStep[]`, `currentPageId?: string`
  - add `useRouter()` and `useRoute()` (internal to component)
  - on `@click`: build `ActionContext` (hash from props, userId from appStore, appData from appStore, etc.)
  - if `actions` present → `executeActions(actions, ctx)`; emit `data-written` on completion
  - else fall back to legacy `action` behavior (existing code unchanged)
- [ ] update `AppInputText.vue`:
  - add props: `actions?: ActionStep[]`, `currentPageId?: string`
  - add `useRouter()` internal to component
  - on save: if `actions` → `executeActions(actions, { ...ctx, inputValue: inputModel.value })`; else legacy
  - emit `data-written` after chain (same as legacy path)
- [ ] update `AppForm.vue`:
  - add prop: `actions?: ActionStep[]`; no legacy fallback needed (Form never had `action`)
  - after successful write (KV or table): if `actions` → run `executeActions(actions, ctx)`
  - emit `data-written` after chain completes
- [ ] run client tests: `npm test --workspace=client`

### Task 5: AI system prompts + CLAUDE.md

- [ ] update `BRAINSTORM_SYSTEM_PROMPT` in `server/src/services/aiService.ts`:
  - replace old `action` docs with `actions: ActionStep[]` documentation
  - include examples for all 5 types with chain example:
    ```json
    // writeData with mode
    { "component": "Button", "props": { "label": "+1" },
      "actions": [{ "type": "writeData", "key": "count", "value": 1, "mode": "increment" }] }

    // navigateTo
    { "component": "Button", "props": { "label": "Далее" },
      "actions": [{ "type": "navigateTo", "pageId": "step2" }] }

    // toggleVisibility (pair with showIf on another component)
    { "component": "Button", "props": { "label": "Детали" },
      "actions": [{ "type": "toggleVisibility", "key": "showDetails" }] }

    // runFormula
    { "component": "Button", "props": { "label": "Обновить итог" },
      "actions": [{ "type": "runFormula", "formula": "SUM(expenses.amount)", "outputKey": "total" }] }

    // fetchUrl — url supports {key} templates from appData
    { "component": "Button", "props": { "label": "Обновить курс" },
      "actions": [{ "type": "fetchUrl", "url": "https://api.example.com/rates?key={apiKey}",
                    "outputKey": "rates", "dataPath": "USD" }] }

    // chain: write + navigate
    { "component": "Button", "props": { "label": "Сохранить и продолжить" },
      "actions": [
        { "type": "writeData", "key": "step", "value": 2 },
        { "type": "navigateTo", "pageId": "step2" }
      ] }
    ```
  - document: max 5 steps; `navigateTo` only works in multi-page apps; `dataPath` is dot-notation
- [ ] update `IN_APP_SYSTEM_PROMPT` with same `actions` documentation
- [ ] update `CLAUDE.md`:
  - in App config JSON shape: replace `action?: { key; value? }` with `actions?: ActionStep[]` + document all 5 step types inline; note `action` field still read for legacy apps
  - in Rate limits section: add `POST /api/app/:hash/actions/fetch-url: 30 req/min (chatLimiter)`
- [ ] update tests in `server/src/__tests__/buildSystemPrompt.test.ts`:
  - assert both prompts contain `"actions"` and all 5 type names: `writeData`, `navigateTo`, `toggleVisibility`, `runFormula`, `fetchUrl`
  - assert prompts mention `mode` for writeData
  - assert prompts mention `{key}` template syntax for fetchUrl
- [ ] run server tests: `npm test --workspace=server`

### Task 6: Verify acceptance criteria

- [ ] Button `writeData` writes correct value; `mode: 'increment'` increments; `mode: 'append'` appends to array
- [ ] Button chain `writeData` + `navigateTo` — writes then navigates to correct page
- [ ] `toggleVisibility` toggles appData boolean; component with `showIf: "flag == true"` appears/disappears
- [ ] `runFormula` evaluates formula, writes result to appData; invalid formula → logs error, chain continues
- [ ] `fetchUrl` proxies through server (SSRF: private IP rejected); stores result in appData
- [ ] `fetchUrl` with `{apiKey}` URL template — substitutes value from appData before fetch
- [ ] InputText with `actions` — user-typed value flows correctly to `writeData`
- [ ] Form with post-submit `navigateTo` — navigates after successful submit
- [ ] `navigateTo` on single-page app (no `pages`) → no-op (no crash, no navigation)
- [ ] legacy `action` field on existing components still works (client fallback)
- [ ] chain with 5 steps: all execute; server rejects chain with 6+ steps (6th dropped at validation)
- [ ] 401 error mid-chain → remaining steps skipped; appData refreshed
- [ ] run full server tests: `npm test --workspace=server`
- [ ] run full client tests: `npm test --workspace=client`

### Task 7: [Final] Update documentation

- [ ] update `README.md`: add action chains to features list
- [ ] update `README.ru.md`: same in Russian
- [ ] update `docs/roadmap-v2.md`: mark Stage 6 as ✅ Реализован

*Note: ralphex automatically moves completed plans to `docs/plans/completed/`*

## Technical Details

**ActionStep union type:**
```ts
type WriteDataAction   = { type: 'writeData'; key: string; value?: unknown; mode?: 'append' | 'increment' | 'delete-item'; index?: number };
type NavigateToAction  = { type: 'navigateTo'; pageId: string };
type ToggleVisAction   = { type: 'toggleVisibility'; key: string };
type RunFormulaAction  = { type: 'runFormula'; formula: string; outputKey: string };
type FetchUrlAction    = { type: 'fetchUrl'; url: string; outputKey: string; dataPath?: string };
type ActionStep = WriteDataAction | NavigateToAction | ToggleVisAction | RunFormulaAction | FetchUrlAction;
```

**dataPath format:** dot-notation, no `$` prefix — e.g. `"data.price"`, `"rates.USD"`. Same convention as cron `fetch_url`.

**Migration at save time (server):**
```ts
// old: { action: { key: "mood", value: 3 } }
// new: { actions: [{ type: "writeData", key: "mood", value: 3 }] }
// old with mode: { action: { key: "tasks", mode: "append" } }
// new: { actions: [{ type: "writeData", key: "tasks", mode: "append" }] }
```

**Client legacy fallback (AppButton, AppInputText):**
```ts
const effectiveActions = props.actions?.length
  ? props.actions
  : props.action ? [{ type: 'writeData' as const, key: props.action.key, value: props.action.value, mode: props.action.mode }]
  : []
```

**appData key access in executor:**
```ts
// NOT: appStore.appData[key]  — appData is an array
// YES: appStore.appData.find(d => d.key === key)?.value
```

**Formula evaluation in runFormula:**
```ts
const ctx = buildFormulaContext(appStore.appData)
const result = evaluateExpression(action.formula, { row: ctx })
// formula context is passed as { row: ctx }, not flat
```

**toggleVisibility semantics:**
```ts
const current = appStore.appData.find(d => d.key === action.key)?.value ?? false
// POST !current to appData
```

**fetchUrl URL template substitution (client-side, before sending to server):**
```ts
const substitutedUrl = action.url.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
  const val = appStore.appData.find(d => d.key === key)?.value
  return val != null ? String(val) : ''
})
```

**navigateTo no-op check:**
```ts
const pages = appStore.appConfig?.pages
if (!pages?.length) { console.warn('navigateTo: app has no pages'); return }
router.push(`/${ctx.userId}/${ctx.hash}/${action.pageId}`)
```

**Rate limit:** `/api/app/:hash/actions/fetch-url` uses same `chatLimiter` (30 req/min) as `/data`.

**Cycle detection:** Linear action chains cannot form cycles (no branching, no loops). The roadmap's "no cycles" requirement is satisfied structurally. No explicit cycle detection code needed.

**fetchProxy.ts scope:**
- Includes: DNS/IP validation, redirect blocking, size limit, timeout
- Does NOT include: URL template substitution (stays client-side), cron outputKey logic, appData writes

## Post-Completion

**Manual verification:**
- Wizard flow: Button → `writeData` + `navigateTo` across 3 pages
- Toggle pattern: Button → `toggleVisibility` + component with `showIf`
- Live fetch: Button → `fetchUrl` → Card shows updated result
- Formula recalc: Button → `runFormula` → computed value updates
- Legacy app: open existing app with `action` field — verify still works without re-saving
- SSRF check: `fetchUrl` with `http://` URL → rejected; private IP URL → rejected
