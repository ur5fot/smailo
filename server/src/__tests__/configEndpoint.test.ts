import { describe, it, expect } from 'vitest'
import { validateUiComponents, validatePages } from '../services/aiService.js'

/**
 * Tests for PUT /api/app/:hash/config endpoint logic.
 * These test the validation and config-building logic that the endpoint uses.
 */

describe('PUT /api/app/:hash/config - validation logic', () => {
  describe('uiComponents mode', () => {
    it('accepts valid uiComponents array', () => {
      const input = [
        { component: 'Card', props: { title: 'Test' } },
        { component: 'DataTable', props: {} },
      ]
      const result = validateUiComponents(input)
      expect(result).toHaveLength(2)
      expect(result[0].component).toBe('Card')
      expect(result[1].component).toBe('DataTable')
    })

    it('filters out invalid components and keeps valid ones', () => {
      const input = [
        { component: 'Card', props: { title: 'Valid' } },
        { component: 'InvalidComponent', props: {} },
        { component: 'DataTable', props: {} },
      ]
      const result = validateUiComponents(input)
      expect(result).toHaveLength(2)
      expect(result[0].component).toBe('Card')
      expect(result[1].component).toBe('DataTable')
    })

    it('returns empty array when all components are invalid', () => {
      const input = [
        { component: 'FakeWidget', props: {} },
        { component: 'NotReal', props: {} },
      ]
      const result = validateUiComponents(input)
      expect(result).toHaveLength(0)
    })

    it('preserves layout metadata in validated components', () => {
      const input = [
        { component: 'Card', props: { title: 'Test' }, layout: { col: 1, colSpan: 6 } },
        { component: 'Chart', props: {}, layout: { col: 7, colSpan: 6, row: 1, rowSpan: 2 } },
      ]
      const result = validateUiComponents(input)
      expect(result).toHaveLength(2)
      expect(result[0].layout).toEqual({ col: 1, colSpan: 6 })
      expect(result[1].layout).toEqual({ col: 7, colSpan: 6, row: 1, rowSpan: 2 })
    })

    it('strips invalid layout but keeps the component', () => {
      const input = [
        { component: 'Card', props: { title: 'Test' }, layout: { col: 0, colSpan: 6 } },
      ]
      const result = validateUiComponents(input)
      expect(result).toHaveLength(1)
      expect(result[0].layout).toBeUndefined()
    })

    it('accepts empty uiComponents array', () => {
      const result = validateUiComponents([])
      expect(result).toEqual([])
    })

    it('truncates to max 20 components', () => {
      const input = Array.from({ length: 25 }, (_, i) => ({
        component: 'Card',
        props: { title: `Card ${i}` },
      }))
      const result = validateUiComponents(input)
      expect(result).toHaveLength(20)
    })
  })

  describe('pages mode', () => {
    it('accepts valid pages array', () => {
      const input = [
        {
          id: 'home',
          title: 'Home',
          uiComponents: [{ component: 'Card', props: { title: 'Welcome' } }],
        },
        {
          id: 'settings',
          title: 'Settings',
          uiComponents: [{ component: 'Button', props: { label: 'Save' } }],
        },
      ]
      const result = validatePages(input)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('home')
      expect(result[1].id).toBe('settings')
    })

    it('validates uiComponents within each page', () => {
      const input = [
        {
          id: 'page1',
          title: 'Page 1',
          uiComponents: [
            { component: 'Card', props: { title: 'Valid' } },
            { component: 'FakeWidget', props: {} },
          ],
        },
      ]
      const result = validatePages(input)
      expect(result).toHaveLength(1)
      expect(result[0].uiComponents).toHaveLength(1)
      expect(result[0].uiComponents[0].component).toBe('Card')
    })

    it('rejects pages with invalid id', () => {
      const input = [
        { id: 'valid-page', title: 'Valid', uiComponents: [] },
        { id: 'invalid page!', title: 'Invalid', uiComponents: [] },
      ]
      const result = validatePages(input)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('valid-page')
    })

    it('rejects pages with duplicate ids', () => {
      const input = [
        { id: 'home', title: 'Home 1', uiComponents: [] },
        { id: 'home', title: 'Home 2', uiComponents: [] },
      ]
      const result = validatePages(input)
      expect(result).toHaveLength(1)
    })

    it('returns empty array for invalid input', () => {
      const result = validatePages([])
      expect(result).toEqual([])
    })

    it('truncates to max 10 pages', () => {
      const input = Array.from({ length: 15 }, (_, i) => ({
        id: `page${i}`,
        title: `Page ${i}`,
        uiComponents: [],
      }))
      const result = validatePages(input)
      expect(result).toHaveLength(10)
    })

    it('preserves layout metadata in page components', () => {
      const input = [
        {
          id: 'page1',
          title: 'Page 1',
          uiComponents: [
            { component: 'Card', props: { title: 'Test' }, layout: { col: 1, colSpan: 4 } },
          ],
        },
      ]
      const result = validatePages(input)
      expect(result[0].uiComponents[0].layout).toEqual({ col: 1, colSpan: 4 })
    })
  })

  describe('config building logic', () => {
    it('uiComponents update removes pages from config', () => {
      const currentConfig: Record<string, unknown> = {
        appName: 'Test',
        pages: [{ id: 'old', title: 'Old', uiComponents: [] }],
      }
      const validated = validateUiComponents([
        { component: 'Card', props: { title: 'New' } },
      ])
      // Simulates the endpoint logic: remove pages when setting uiComponents
      const { pages: _removed, ...configWithoutPages } = currentConfig
      const updatedConfig = { ...configWithoutPages, uiComponents: validated }
      expect(updatedConfig.pages).toBeUndefined()
      expect(updatedConfig.uiComponents).toHaveLength(1)
      expect(updatedConfig.appName).toBe('Test')
    })

    it('pages update preserves existing config fields', () => {
      const currentConfig: Record<string, unknown> = {
        appName: 'Test',
        description: 'A test app',
        uiComponents: [{ component: 'Card', props: {} }],
      }
      const validated = validatePages([
        { id: 'home', title: 'Home', uiComponents: [{ component: 'Card', props: { title: 'Welcome' } }] },
      ])
      const updatedConfig = { ...currentConfig, pages: validated }
      expect(updatedConfig.appName).toBe('Test')
      expect(updatedConfig.description).toBe('A test app')
      expect(updatedConfig.pages).toHaveLength(1)
    })
  })
})
