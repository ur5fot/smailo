import api from '../api'
import router from '../router'
import { buildFormulaContext } from './formulaContext'
import { evaluateFormula } from './formula'
import type { useAppStore } from '../stores/app'

// Action step types (mirrored from server for client-side use)
export type WriteDataAction = {
  type: 'writeData'
  key: string
  value?: unknown
  mode?: 'append' | 'increment' | 'delete-item'
  index?: number
}

export type NavigateToAction = {
  type: 'navigateTo'
  pageId: string
}

export type ToggleVisAction = {
  type: 'toggleVisibility'
  key: string
}

export type RunFormulaAction = {
  type: 'runFormula'
  formula: string
  outputKey: string
}

export type FetchUrlAction = {
  type: 'fetchUrl'
  url: string
  outputKey: string
  dataPath?: string
}

export type ActionStep =
  | WriteDataAction
  | NavigateToAction
  | ToggleVisAction
  | RunFormulaAction
  | FetchUrlAction

export interface ActionContext {
  hash: string
  userId: string | null | undefined
  currentPageId: string | undefined
  appData: Record<string, any>[]
  appStore: ReturnType<typeof useAppStore>
  inputValue?: unknown
}

export async function executeActions(
  actions: ActionStep[],
  ctx: ActionContext
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'writeData':
          await execWriteData(action, ctx)
          break
        case 'navigateTo':
          execNavigateTo(action, ctx)
          break
        case 'toggleVisibility':
          await execToggleVisibility(action, ctx)
          break
        case 'runFormula':
          await execRunFormula(action, ctx)
          break
        case 'fetchUrl':
          await execFetchUrl(action, ctx)
          break
      }
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        console.error(`Action chain aborted: auth error on ${action.type}`, err)
        break
      }
      console.error(`Action ${action.type} failed, continuing chain`, err)
    }
  }

  try {
    await ctx.appStore.fetchData(ctx.hash)
  } catch (err) {
    console.error('Failed to refresh appData after action chain', err)
  }
}

/** Update the local appData snapshot so subsequent steps in the same chain see fresh values. */
function updateLocalAppData(ctx: ActionContext, key: string, value: unknown): void {
  const existing = ctx.appData.find(d => d.key === key)
  if (existing) {
    existing.value = value
  } else {
    ctx.appData.push({ key, value })
  }
}

async function execWriteData(action: WriteDataAction, ctx: ActionContext): Promise<void> {
  const value = action.value ?? ctx.inputValue ?? true
  const payload: Record<string, unknown> = {
    key: action.key,
    value,
  }
  if (action.mode) {
    payload.mode = action.mode
  }
  if (action.index !== undefined) {
    payload.index = action.index
  }
  await api.post(`/app/${ctx.hash}/data`, payload)
  // For simple writes (no mode), update local snapshot for subsequent steps
  if (!action.mode) {
    updateLocalAppData(ctx, action.key, value)
  }
}

function execNavigateTo(action: NavigateToAction, ctx: ActionContext): void {
  const pages = ctx.appStore.appConfig?.pages
  if (!pages?.length) {
    console.warn('navigateTo: app has no pages')
    return
  }
  if (!pages.some(p => p.id === action.pageId)) {
    console.warn(`navigateTo: page "${action.pageId}" does not exist`)
    return
  }
  if (ctx.userId) {
    router.push(`/${ctx.userId}/${ctx.hash}/${action.pageId}`)
  } else {
    router.push(`/app/${ctx.hash}/${action.pageId}`)
  }
}

async function execToggleVisibility(action: ToggleVisAction, ctx: ActionContext): Promise<void> {
  const current = ctx.appData.find(d => d.key === action.key)?.value ?? false
  const newValue = !current
  await api.post(`/app/${ctx.hash}/data`, {
    key: action.key,
    value: newValue,
  })
  updateLocalAppData(ctx, action.key, newValue)
}

async function execRunFormula(action: RunFormulaAction, ctx: ActionContext): Promise<void> {
  const appDataRecord: Record<string, unknown> = {}
  for (const item of ctx.appData) {
    appDataRecord[item.key] = item.value
  }
  const formulaCtx = buildFormulaContext(appDataRecord)
  const result = evaluateFormula(action.formula, { row: formulaCtx })
  await api.post(`/app/${ctx.hash}/data`, {
    key: action.outputKey,
    value: result,
  })
  updateLocalAppData(ctx, action.outputKey, result)
}

async function execFetchUrl(action: FetchUrlAction, ctx: ActionContext): Promise<void> {
  let hasUnresolved = false
  const substitutedUrl = action.url.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const val = ctx.appData.find(d => d.key === key)?.value
    if (val == null || val === '') {
      hasUnresolved = true
      return ''
    }
    return encodeURIComponent(String(val))
  })
  if (hasUnresolved) {
    console.warn('fetchUrl: skipping fetch — unresolved placeholder in URL')
    return
  }
  await api.post(`/app/${ctx.hash}/actions/fetch-url`, {
    url: substitutedUrl,
    outputKey: action.outputKey,
    ...(action.dataPath ? { dataPath: action.dataPath } : {}),
  })
}
