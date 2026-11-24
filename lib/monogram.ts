/** A generated logo for listings without one: initials on a gradient whose hue comes from the slug,
 *  so two listings with the same name still look different. Pure and deterministic. */

export interface Monogram { initials: string; hue: number; from: string; to: string; text: string }

const TEXT = '#ffffff'
const MIN_CONTRAST = 4.5
const HUE_SHIFT = 38
const START_LIGHTNESS = 30
/** Oranges and yellows (25°–95°) have to be darkened so far for white text that they turn brown. */
const MUDDY_FROM = 25
const MUDDY_TO = 95
const USABLE_HUES = 360 - (MUDDY_TO - MUDDY_FROM)
const isMuddy = (hue: number) => hue >= MUDDY_FROM && hue < MUDDY_TO

/** FNV-1a, 32-bit: small, fast and stable across runtimes. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // Finalizer: FNV's low bits barely change between similar slugs ("grokbot" / "grokbot-opkya").
  return Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
}

function initialsOf(name: string): string {
  const [first, second] = name.match(/[\p{L}\p{N}]+/gu) ?? []
  if (!first) return '?'
  const letters = second ? [...first][0] + [...second][0] : [...first].slice(0, 2).join('')
  return letters.toLocaleUpperCase()
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2 contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Start at a pleasant lightness and darken only as far as white text needs for 4.5:1. */
function readableStop(hue: number, saturation: number): string {
  for (let l = START_LIGHTNESS; l > 0; l -= 2) {
    const hex = hslToHex(hue, saturation, l)
    if (contrastRatio(TEXT, hex) >= MIN_CONTRAST) return hex
  }
  return '#000000'
}

export function monogram(slug: string, name: string): Monogram {
  const hue = (MUDDY_TO + (hash(slug) % USABLE_HUES)) % 360
  const second = (hue + HUE_SHIFT) % 360
  return {
    initials: initialsOf(name),
    hue,
    from: readableStop(hue, 68),
    to: readableStop(isMuddy(second) ? (hue - HUE_SHIFT + 360) % 360 : second, 72),
    text: TEXT,
  }
}
