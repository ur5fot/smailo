import { describe, it, expect } from 'vitest'
import { validatePages } from '../services/aiService.js'

const baseComponent = { component: 'Card', props: { title: 'Test' }, dataKey: 'test' }
const basePage = { id: 'home', title: 'Home', uiComponents: [baseComponent] }

describe('validatePages', () => {
  describe('valid pages', () => {
    it('returns valid page with all fields', () => {
      const result = validatePages([{ ...basePage, icon: 'pi pi-home' }])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'home',
        title: 'Home',
        icon: 'pi pi-home',
        uiComponents: [expect.objectContaining({ component: 'Card' })],
      })
    })

    it('returns valid page without optional icon', () => {
      const result = validatePages([basePage])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('home')
      expect(result[0].icon).toBeUndefined()
    })

    it('trims whitespace from title', () => {
      const result = validatePages([{ ...basePage, title: '  My Page  ' }])
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('My Page')
    })

    it('accepts id with hyphens and underscores', () => {
      const result = validatePages([{ ...basePage, id: 'my-page_1' }])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('my-page_1')
    })

    it('accepts multiple valid pages', () => {
      const result = validatePages([
        { id: 'home', title: 'Home', uiComponents: [baseComponent] },
        { id: 'reports', title: 'Reports', uiComponents: [baseComponent] },
      ])
      expect(result).toHaveLength(2)
    })

    it('backward compat: returns empty array when input is empty', () => {
      const result = validatePages([])
      expect(result).toEqual([])
    })
  })

  describe('too many pages', () => {
    it('truncates to 10 pages maximum', () => {
      const pages = Array.from({ length: 15 }, (_, i) => ({
        id: `page${i}`,
        title: `Page ${i}`,
        uiComponents: [baseComponent],
      }))
      const result = validatePages(pages)
      expect(result).toHaveLength(10)
    })
  })

  describe('invalid id', () => {
    it('drops page with empty id', () => {
      const result = validatePages([{ ...basePage, id: '' }])
      expect(result).toHaveLength(0)
    })

    it('drops page with id containing spaces', () => {
      const result = validatePages([{ ...basePage, id: 'my page' }])
      expect(result).toHaveLength(0)
    })

    it('drops page with id containing special characters', () => {
      const result = validatePages([{ ...basePage, id: 'page@1' }])
      expect(result).toHaveLength(0)
    })

    it('drops page with id longer than 50 characters', () => {
      const result = validatePages([{ ...basePage, id: 'a'.repeat(51) }])
      expect(result).toHaveLength(0)
    })

    it('accepts id of exactly 50 characters', () => {
      const result = validatePages([{ ...basePage, id: 'a'.repeat(50) }])
      expect(result).toHaveLength(1)
    })

    it('drops page with non-string id', () => {
      const result = validatePages([{ ...basePage, id: 123 }])
      expect(result).toHaveLength(0)
    })
  })

  describe('duplicate id', () => {
    it('drops second page with duplicate id', () => {
      const result = validatePages([
        { id: 'home', title: 'Home', uiComponents: [baseComponent] },
        { id: 'home', title: 'Duplicate', uiComponents: [baseComponent] },
      ])
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Home')
    })

    it('keeps pages with unique ids', () => {
      const result = validatePages([
        { id: 'home', title: 'Home', uiComponents: [baseComponent] },
        { id: 'settings', title: 'Settings', uiComponents: [baseComponent] },
      ])
      expect(result).toHaveLength(2)
    })
  })

  describe('empty title', () => {
    it('drops page with empty title', () => {
      const result = validatePages([{ ...basePage, title: '' }])
      expect(result).toHaveLength(0)
    })

    it('drops page with whitespace-only title', () => {
      const result = validatePages([{ ...basePage, title: '   ' }])
      expect(result).toHaveLength(0)
    })

    it('drops page with title longer than 100 characters', () => {
      const result = validatePages([{ ...basePage, title: 'a'.repeat(101) }])
      expect(result).toHaveLength(0)
    })

    it('accepts title of exactly 100 characters', () => {
      const result = validatePages([{ ...basePage, title: 'a'.repeat(100) }])
      expect(result).toHaveLength(1)
    })

    it('drops page with non-string title', () => {
      const result = validatePages([{ ...basePage, title: 42 }])
      expect(result).toHaveLength(0)
    })
  })

  describe('icon validation', () => {
    it('accepts valid icon string', () => {
      const result = validatePages([{ ...basePage, icon: 'pi pi-home' }])
      expect(result).toHaveLength(1)
      expect(result[0].icon).toBe('pi pi-home')
    })

    it('drops page when icon is longer than 50 characters', () => {
      const result = validatePages([{ ...basePage, icon: 'a'.repeat(51) }])
      expect(result).toHaveLength(0)
    })

    it('accepts icon of exactly 50 characters', () => {
      const result = validatePages([{ ...basePage, icon: 'a'.repeat(50) }])
      expect(result).toHaveLength(1)
    })

    it('drops page when icon is non-string', () => {
      const result = validatePages([{ ...basePage, icon: 123 }])
      expect(result).toHaveLength(0)
    })

    it('omits icon field when icon is empty string', () => {
      const result = validatePages([{ ...basePage, icon: '' }])
      expect(result).toHaveLength(1)
      expect(result[0].icon).toBeUndefined()
    })
  })

  describe('uiComponents validation', () => {
    it('validates uiComponents through validateUiComponents', () => {
      const result = validatePages([{
        ...basePage,
        uiComponents: [
          baseComponent,
          { component: 'InvalidComponent', props: {} },
        ],
      }])
      expect(result).toHaveLength(1)
      // Invalid component is filtered out by validateUiComponents
      expect(result[0].uiComponents).toHaveLength(1)
    })

    it('drops page when uiComponents is not an array', () => {
      const result = validatePages([{ ...basePage, uiComponents: 'not-array' }])
      expect(result).toHaveLength(0)
    })

    it('allows page with empty uiComponents array', () => {
      const result = validatePages([{ ...basePage, uiComponents: [] }])
      expect(result).toHaveLength(1)
      expect(result[0].uiComponents).toEqual([])
    })
  })

  describe('non-object inputs', () => {
    it('returns empty array when input is not an array', () => {
      const result = validatePages('not-array' as unknown as unknown[])
      expect(result).toEqual([])
    })

    it('drops null entries', () => {
      const result = validatePages([null])
      expect(result).toHaveLength(0)
    })

    it('drops primitive entries', () => {
      const result = validatePages([42, 'string', true])
      expect(result).toHaveLength(0)
    })
  })
})
