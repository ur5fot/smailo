import { describe, it, expect, beforeEach, vi } from 'vitest'
import { executeActions, type ActionStep, type ActionContext } from './actionExecutor'

vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../router', () => ({
  default: {
    push: vi.fn(),
  },
}))

import api from '../api'
import router from '../router'

const mockPost = api.post as ReturnType<typeof vi.fn>
const mockPush = router.push as ReturnType<typeof vi.fn>

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    hash: 'abc123',
    userId: 'user1',
    currentPageId: 'main',
    appData: [],
    appStore: {
      fetchData: vi.fn().mockResolvedValue({}),
      appConfig: null,
    } as any,
    ...overrides,
  }
}

describe('executeActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPost.mockResolvedValue({ data: { ok: true } })
  })

  // --- writeData ---

  describe('writeData', () => {
    it('posts correct payload with explicit value', async () => {
      const actions: ActionStep[] = [{ type: 'writeData', key: 'mood', value: 3 }]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'mood',
        value: 3,
      })
    })

    it('uses inputValue when value is not explicit', async () => {
      const actions: ActionStep[] = [{ type: 'writeData', key: 'note' }]
      const ctx = makeCtx({ inputValue: 'hello world' })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'note',
        value: 'hello world',
      })
    })

    it('defaults to true when no value and no inputValue', async () => {
      const actions: ActionStep[] = [{ type: 'writeData', key: 'clicked' }]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'clicked',
        value: true,
      })
    })

    it('posts correct payload with delete-item mode and index', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'tasks', mode: 'delete-item', index: 2 },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'tasks',
        value: true,
        mode: 'delete-item',
        index: 2,
      })
    })

    it('posts correct payload with increment mode', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'count', value: 1, mode: 'increment' },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'count',
        value: 1,
        mode: 'increment',
      })
    })

    it('posts correct payload with append mode', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'items', value: 'new item', mode: 'append' },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'items',
        value: 'new item',
        mode: 'append',
      })
    })
  })

  // --- navigateTo ---

  describe('navigateTo', () => {
    it('pushes correct route with userId', async () => {
      const actions: ActionStep[] = [{ type: 'navigateTo', pageId: 'step2' }]
      const ctx = makeCtx({
        appStore: {
          fetchData: vi.fn().mockResolvedValue({}),
          appConfig: { pages: [{ id: 'step1' }, { id: 'step2' }] },
        } as any,
      })
      await executeActions(actions, ctx)

      expect(mockPush).toHaveBeenCalledWith('/user1/abc123/step2')
    })

    it('pushes correct route without userId', async () => {
      const actions: ActionStep[] = [{ type: 'navigateTo', pageId: 'step2' }]
      const ctx = makeCtx({
        userId: null,
        appStore: {
          fetchData: vi.fn().mockResolvedValue({}),
          appConfig: { pages: [{ id: 'step1' }, { id: 'step2' }] },
        } as any,
      })
      await executeActions(actions, ctx)

      expect(mockPush).toHaveBeenCalledWith('/app/abc123/step2')
    })

    it('no-op when app has no pages', async () => {
      const actions: ActionStep[] = [{ type: 'navigateTo', pageId: 'step2' }]
      const ctx = makeCtx({
        appStore: {
          fetchData: vi.fn().mockResolvedValue({}),
          appConfig: { uiComponents: [] },
        } as any,
      })
      await executeActions(actions, ctx)

      expect(mockPush).not.toHaveBeenCalled()
    })

    it('no-op when appConfig is null', async () => {
      const actions: ActionStep[] = [{ type: 'navigateTo', pageId: 'step2' }]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  // --- toggleVisibility ---

  describe('toggleVisibility', () => {
    it('reads current false from appData, posts true', async () => {
      const actions: ActionStep[] = [{ type: 'toggleVisibility', key: 'showDetails' }]
      const ctx = makeCtx({
        appData: [{ key: 'showDetails', value: false }],
      })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'showDetails',
        value: true,
      })
    })

    it('reads current true from appData, posts false', async () => {
      const actions: ActionStep[] = [{ type: 'toggleVisibility', key: 'showDetails' }]
      const ctx = makeCtx({
        appData: [{ key: 'showDetails', value: true }],
      })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'showDetails',
        value: false,
      })
    })

    it('defaults to false (posts true) when key not in appData', async () => {
      const actions: ActionStep[] = [{ type: 'toggleVisibility', key: 'newFlag' }]
      const ctx = makeCtx({ appData: [] })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'newFlag',
        value: true,
      })
    })
  })

  // --- runFormula ---

  describe('runFormula', () => {
    it('evaluates formula and posts result to outputKey', async () => {
      const actions: ActionStep[] = [
        { type: 'runFormula', formula: 'price * quantity', outputKey: 'total' },
      ]
      const ctx = makeCtx({
        appData: [
          { key: 'price', value: 10 },
          { key: 'quantity', value: 5 },
        ],
      })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'total',
        value: 50,
      })
    })

    it('formula with missing variable returns null', async () => {
      const actions: ActionStep[] = [
        { type: 'runFormula', formula: 'missing + 1', outputKey: 'result' },
      ]
      const ctx = makeCtx({ appData: [] })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'result',
        value: null,
      })
    })

    it('invalid formula logs error and chain continues', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const actions: ActionStep[] = [
        { type: 'runFormula', formula: '!!!invalid syntax', outputKey: 'bad' },
        { type: 'writeData', key: 'after', value: 'ok' },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      // Invalid formula threw, logged error, but chain continued
      expect(consoleSpy).toHaveBeenCalled()
      // Second step still executed
      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'after',
        value: 'ok',
      })
      consoleSpy.mockRestore()
    })
  })

  // --- fetchUrl ---

  describe('fetchUrl', () => {
    it('substitutes {key} templates and posts to fetch-url endpoint', async () => {
      const actions: ActionStep[] = [
        {
          type: 'fetchUrl',
          url: 'https://api.example.com/rates?key={apiKey}',
          outputKey: 'rates',
          dataPath: 'USD',
        },
      ]
      const ctx = makeCtx({
        appData: [{ key: 'apiKey', value: 'secret123' }],
      })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/actions/fetch-url', {
        url: 'https://api.example.com/rates?key=secret123',
        outputKey: 'rates',
        dataPath: 'USD',
      })
    })

    it('skips fetch when template key not found in appData', async () => {
      const actions: ActionStep[] = [
        {
          type: 'fetchUrl',
          url: 'https://api.example.com/?key={missing}',
          outputKey: 'result',
        },
      ]
      const ctx = makeCtx({ appData: [] })
      await executeActions(actions, ctx)

      expect(mockPost).not.toHaveBeenCalledWith(
        '/app/abc123/actions/fetch-url',
        expect.anything()
      )
    })

    it('omits dataPath when not provided', async () => {
      const actions: ActionStep[] = [
        {
          type: 'fetchUrl',
          url: 'https://api.example.com/data',
          outputKey: 'result',
        },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledWith('/app/abc123/actions/fetch-url', {
        url: 'https://api.example.com/data',
        outputKey: 'result',
      })
    })
  })

  // --- chain execution order ---

  describe('chain execution', () => {
    it('all steps execute in order', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'step', value: 1 },
        { type: 'writeData', key: 'step', value: 2 },
        { type: 'toggleVisibility', key: 'flag' },
      ]
      const ctx = makeCtx({ appData: [{ key: 'flag', value: false }] })
      await executeActions(actions, ctx)

      expect(mockPost).toHaveBeenCalledTimes(3)
      // Verify order by checking sequential call arguments
      const calls = mockPost.mock.calls
      expect(calls[0][1]).toEqual({ key: 'step', value: 1 })
      expect(calls[1][1]).toEqual({ key: 'step', value: 2 })
      expect(calls[2][1]).toEqual({ key: 'flag', value: true })
    })

    it('writeData + navigateTo: writes data then navigates', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'step', value: 2 },
        { type: 'navigateTo', pageId: 'step2' },
      ]
      const ctx = makeCtx({
        appStore: {
          fetchData: vi.fn().mockResolvedValue({}),
          appConfig: { pages: [{ id: 'step1' }, { id: 'step2' }] },
        } as any,
      })
      await executeActions(actions, ctx)

      // writeData fires first
      expect(mockPost).toHaveBeenCalledWith('/app/abc123/data', {
        key: 'step',
        value: 2,
      })
      // then navigateTo fires
      expect(mockPush).toHaveBeenCalledWith('/user1/abc123/step2')
      // order: post called before push
      const postOrder = mockPost.mock.invocationCallOrder[0]
      const pushOrder = mockPush.mock.invocationCallOrder[0]
      expect(postOrder).toBeLessThan(pushOrder)
    })
  })

  // --- local appData propagation within chain ---

  describe('intra-chain data propagation', () => {
    it('writeData updates local snapshot for subsequent toggleVisibility', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'flag', value: true },
        { type: 'toggleVisibility', key: 'flag' },
      ]
      const ctx = makeCtx({ appData: [] })
      await executeActions(actions, ctx)

      const calls = mockPost.mock.calls
      // Step 1: writes true
      expect(calls[0][1]).toEqual({ key: 'flag', value: true })
      // Step 2: reads true from local snapshot, toggles to false
      expect(calls[1][1]).toEqual({ key: 'flag', value: false })
    })

    it('writeData updates local snapshot for subsequent runFormula', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'price', value: 10 },
        { type: 'runFormula', formula: 'price * 2', outputKey: 'total' },
      ]
      const ctx = makeCtx({ appData: [] })
      await executeActions(actions, ctx)

      const calls = mockPost.mock.calls
      expect(calls[1][1]).toEqual({ key: 'total', value: 20 })
    })

    it('double toggle produces correct results', async () => {
      const actions: ActionStep[] = [
        { type: 'toggleVisibility', key: 'show' },
        { type: 'toggleVisibility', key: 'show' },
      ]
      const ctx = makeCtx({ appData: [{ key: 'show', value: false }] })
      await executeActions(actions, ctx)

      const calls = mockPost.mock.calls
      // First toggle: false -> true
      expect(calls[0][1]).toEqual({ key: 'show', value: true })
      // Second toggle: true -> false (reads updated local value)
      expect(calls[1][1]).toEqual({ key: 'show', value: false })
    })

    it('increment mode updates local snapshot for subsequent runFormula', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'counter', value: 1, mode: 'increment' },
        { type: 'runFormula', formula: 'counter * 10', outputKey: 'display' },
      ]
      const ctx = makeCtx({ appData: [{ key: 'counter', value: 5 }] })
      await executeActions(actions, ctx)

      const calls = mockPost.mock.calls
      // Step 1: increment counter by 1
      expect(calls[0][1]).toEqual({ key: 'counter', value: 1, mode: 'increment' })
      // Step 2: formula reads local counter=6 (5+1), not stale 5
      expect(calls[1][1]).toEqual({ key: 'display', value: 60 })
    })

    it('append mode updates local snapshot for subsequent steps', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'items', value: 'hello', mode: 'append' },
        { type: 'toggleVisibility', key: 'items' },
      ]
      const ctx = makeCtx({ appData: [{ key: 'items', value: [] }] })
      await executeActions(actions, ctx)

      // After append, local items is now a non-empty array (truthy)
      // toggleVisibility reads truthy → toggles to false
      const calls = mockPost.mock.calls
      expect(calls[1][1]).toEqual({ key: 'items', value: false })
    })

    it('delete-item mode updates local snapshot', async () => {
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'list', mode: 'delete-item', index: 1 },
      ]
      const ctx = makeCtx({ appData: [{ key: 'list', value: ['a', 'b', 'c'] }] })
      await executeActions(actions, ctx)

      // After delete-item at index 1, local list = ['a', 'c']
      expect(ctx.appData.find(d => d.key === 'list')?.value).toEqual(['a', 'c'])
    })

    it('fetchUrl skips when template references key with empty string value', async () => {
      const actions: ActionStep[] = [
        {
          type: 'fetchUrl',
          url: 'https://api.example.com/?key={apiKey}',
          outputKey: 'result',
        },
      ]
      const ctx = makeCtx({ appData: [{ key: 'apiKey', value: '' }] })
      await executeActions(actions, ctx)

      expect(mockPost).not.toHaveBeenCalledWith(
        '/app/abc123/actions/fetch-url',
        expect.anything()
      )
    })
  })

  // --- error handling ---

  describe('error handling', () => {
    it('401 error on step 2 aborts remaining steps and re-throws', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { ok: true } }) // step 1 succeeds
        .mockRejectedValueOnce({ response: { status: 401 } }) // step 2 fails auth
        .mockResolvedValueOnce({ data: { ok: true } }) // step 3 would succeed

      const actions: ActionStep[] = [
        { type: 'writeData', key: 'a', value: 1 },
        { type: 'writeData', key: 'b', value: 2 },
        { type: 'writeData', key: 'c', value: 3 },
      ]
      const ctx = makeCtx()
      await expect(executeActions(actions, ctx)).rejects.toEqual({ response: { status: 401 } })

      // Only steps 1 and 2 attempted, step 3 skipped
      expect(mockPost).toHaveBeenCalledTimes(2)
      // fetchData NOT called — auth is broken
      expect(ctx.appStore.fetchData).not.toHaveBeenCalled()
    })

    it('403 error also aborts chain and re-throws', async () => {
      mockPost.mockReset()
      mockPost
        .mockRejectedValueOnce({ response: { status: 403 } })
        .mockResolvedValue({ data: { ok: true } })

      const actions: ActionStep[] = [
        { type: 'writeData', key: 'a', value: 1 },
        { type: 'writeData', key: 'b', value: 2 },
      ]
      const ctx = makeCtx()
      await expect(executeActions(actions, ctx)).rejects.toEqual({ response: { status: 403 } })

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(ctx.appStore.fetchData).not.toHaveBeenCalled()
    })

    it('non-auth error on step 2 continues chain', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { ok: true } }) // step 1
        .mockRejectedValueOnce(new Error('network error')) // step 2 fails
        .mockResolvedValueOnce({ data: { ok: true } }) // step 3

      const actions: ActionStep[] = [
        { type: 'writeData', key: 'a', value: 1 },
        { type: 'writeData', key: 'b', value: 2 },
        { type: 'writeData', key: 'c', value: 3 },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      // All 3 steps attempted
      expect(mockPost).toHaveBeenCalledTimes(3)
      expect(ctx.appStore.fetchData).toHaveBeenCalledWith('abc123')
    })
  })

  // --- fetchData always called ---

  describe('fetchData refresh', () => {
    it('calls fetchData after successful chain', async () => {
      const actions: ActionStep[] = [{ type: 'writeData', key: 'x', value: 1 }]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(ctx.appStore.fetchData).toHaveBeenCalledWith('abc123')
    })

    it('calls fetchData even when all steps fail', async () => {
      mockPost.mockRejectedValue(new Error('fail'))
      const actions: ActionStep[] = [
        { type: 'writeData', key: 'a', value: 1 },
      ]
      const ctx = makeCtx()
      await executeActions(actions, ctx)

      expect(ctx.appStore.fetchData).toHaveBeenCalledWith('abc123')
    })

    it('calls fetchData after empty actions array', async () => {
      const ctx = makeCtx()
      await executeActions([], ctx)

      expect(ctx.appStore.fetchData).toHaveBeenCalledWith('abc123')
    })
  })
})
