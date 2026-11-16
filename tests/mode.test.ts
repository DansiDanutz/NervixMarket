import { describe, expect, it } from 'vitest'
import { MODE_COOKIE, homeCopy, modeHref, resolveMode, resolveOffer } from '@/lib/mode'

describe('home mode: "I\'m looking" vs "I\'m building"', () => {
  it('takes the URL first, then the remembered cookie, then defaults to looking', () => {
    expect(resolveMode('build', 'look')).toBe('build')
    expect(resolveMode(undefined, 'build')).toBe('build')
    expect(resolveMode(undefined, undefined)).toBe('look')
    expect(resolveMode('nonsense', 'nonsense')).toBe('look')
    expect(resolveMode('nonsense', 'build')).toBe('build')
  })

  it('builders see listings for sale by default; lookers see everything', () => {
    expect(resolveOffer('build', undefined)).toBe('sell')
    expect(resolveOffer('look', undefined)).toBeUndefined()
  })

  it('an explicit filter always wins, and "any" clears the default', () => {
    expect(resolveOffer('build', 'use')).toBe('use')
    expect(resolveOffer('look', 'sell')).toBe('sell')
    expect(resolveOffer('build', 'any')).toBeUndefined()
    expect(resolveOffer('build', 'bogus')).toBe('sell')
  })

  it('sets the hero copy and the primary action', () => {
    expect(homeCopy('build').cta.href).toBe('/list')
    expect(homeCopy('look').cta.href).toBe('#directory')
    expect(homeCopy('build').h1).not.toBe(homeCopy('look').h1)
  })

  it('switch links keep the search but drop paging', () => {
    expect(modeHref('build', { q: 'agents', category: 'tools', page: '3' })).toBe('/?for=build&q=agents&category=tools')
    expect(modeHref('look', {})).toBe('/?for=look')
  })

  it('remembers the choice under a stable cookie name', () => {
    expect(MODE_COOKIE).toBe('ns_for')
  })
})
