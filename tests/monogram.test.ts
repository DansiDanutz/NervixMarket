import { describe, expect, it } from 'vitest'
import { contrastRatio, monogram } from '@/lib/monogram'

describe('generated monogram (listing logo fallback)', () => {
  it('is the same for the same listing every time', () => {
    expect(monogram('grokbot', 'GrokBot')).toEqual(monogram('grokbot', 'GrokBot'))
  })

  it('looks different for two listings with the same name', () => {
    const a = monogram('grokbot', 'GrokBot')
    const b = monogram('grokbot-opkya', 'GrokBot')
    expect(a.hue).not.toBe(b.hue)
    expect(Math.abs(a.hue - b.hue)).toBeGreaterThanOrEqual(20)
  })

  it('uses up to two initials from the name', () => {
    expect(monogram('x', 'Stream Studio').initials).toBe('SS')
    expect(monogram('x', 'zmarty').initials).toBe('ZM')
    expect(monogram('x', 'Fake / Real').initials).toBe('FR')
    expect(monogram('x', 'Ångström labs').initials).toBe('ÅL')
    expect(monogram('x', '!!').initials).toBe('?')
  })

  it('keeps the letters readable: at least 4.5:1 against both gradient stops', () => {
    for (const slug of ['a', 'grokbot', 'grokbot-opkya', 'nervixpay', 'zmarty', 'x'.repeat(48)]) {
      const m = monogram(slug, 'Name')
      expect(contrastRatio(m.text, m.from)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(m.text, m.to)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('measures contrast like WCAG', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
  })
})
