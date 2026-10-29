import type { CharacterId, Kid } from '../types'
import { KID_ART, type Layer } from './characters/art'

// The pal's kids, one per subagent, which the pane calls deputies: a 12 × 14 pixel copy
// of the parent (its hat, its ears) in a bandana of its own colour. Two rows on top stay
// empty for a hop, sparkles and the like, so a kid is 12 × 7 terminal cells.

export const KID_WIDTH = 12
export const KID_HEIGHT = 14
const TOP = 2

// The categorical order of the data-viz reference palette, its steps for a dark
// surface: adjacent kids stay apart for colour-blind eyes too (validated with
// validate_palette.js). `text` is the number drawn on the colour.
export const KID_COLORS = [
  { main: 0x3987e5, shade: 0x235ea8, light: 0x9cc3f2, text: '#FFFFFF' },
  { main: 0xd95926, shade: 0x9c3b14, light: 0xf2a07d, text: '#FFFFFF' },
  { main: 0x199e70, shade: 0x0f6b4b, light: 0x7fd9b6, text: '#FFFFFF' },
  { main: 0xc98500, shade: 0x8f5e00, light: 0xf2c766, text: '#1F1D24' },
  { main: 0xd55181, shade: 0x9b3158, light: 0xf0a6c1, text: '#FFFFFF' },
  { main: 0x008300, shade: 0x005400, light: 0x6cc46c, text: '#FFFFFF' },
] as const

// A kid past the colours wears a plain grey bandana.
const NO_COLOR = { main: 0x9ca3af, shade: 0x6b7280, light: 0xd1d5db, text: '#1F1D24' }

export function kidColor(slot: number) {
  return KID_COLORS[slot] ?? NO_COLOR
}

export function kidColors(slot: number): Readonly<Record<string, number>> {
  const color = kidColor(slot)
  return { 1: color.main, 2: color.shade, 3: color.light }
}

export const hex = (color: number) => `#${color.toString(16).padStart(6, '0').toUpperCase()}`

// ── Looks ───────────────────────────────────────────────────────────────────

export type KidEyes = 'open' | 'blink' | 'closed' | 'happy' | 'x' | 'focused'
export type KidLook = {
  eyes: KidEyes
  gaze: readonly [number, number]
  hop: number
  sweat: boolean
  blush: boolean
  sparkle: boolean
  zz: boolean
  dots: boolean
}

const BORN_MS = 1500
const CHEER_MS = 3000

// What a kid looks like this tick (250 ms): the activity of its loop while it works, how
// it went once it is done. `seed` (its colour slot) keeps kids side by side out of step.
export function kidLook(kid: Pick<Kid, 'status' | 'activity' | 'startedAt' | 'endedAt'>, now: number, tick: number, seed: number): KidLook {
  const t = tick + seed * 5
  const look: KidLook = { eyes: 'open', gaze: [0, 0], hop: 0, sweat: false, blush: true, sparkle: false, zz: false, dots: false }
  const isBlink = t % 17 === 0

  if (kid.status === 'done') {
    const isCheering = kid.endedAt !== undefined && now - kid.endedAt < CHEER_MS
    return { ...look, eyes: 'happy', sparkle: isCheering, hop: isCheering && t % 4 < 2 ? 1 : 0 }
  }
  if (kid.status === 'failed') return { ...look, eyes: 'x', sweat: true, blush: false }
  if (kid.status === 'stopped') return { ...look, eyes: 'closed', zz: true }

  if (now - kid.startedAt < BORN_MS) return { ...look, sparkle: true, hop: t % 2 }

  switch (kid.activity) {
    case 'reading':
      return { ...look, eyes: isBlink ? 'blink' : 'open', gaze: [t % 8 < 4 ? -1 : 1, 0] }
    case 'editing':
      return { ...look, eyes: 'focused', hop: t % 2 }
    case 'running':
      return { ...look, eyes: isBlink ? 'blink' : 'open', hop: t % 4 < 2 ? 1 : 0, sweat: t % 8 < 5 }
    case 'testing':
      return { ...look, eyes: isBlink ? 'blink' : 'focused', gaze: [t % 6 < 3 ? 0 : 1, 1], hop: t % 6 === 0 ? 1 : 0 }
    case 'waiting':
      return { ...look, eyes: t % 6 === 0 ? 'blink' : 'open', gaze: [-1, 0] }
    default:
      return { ...look, eyes: isBlink ? 'blink' : 'open', gaze: [0, -1], dots: true }
  }
}

// ── A frame ─────────────────────────────────────────────────────────────────

function put(grid: string[][], x: number, y: number, key: string, isBehind = false) {
  const row = grid[y]
  if (row === undefined || x < 0 || x >= row.length) return
  if (isBehind && row[x] !== '.') return
  row[x] = key
}

function stamp(grid: string[][], x0: number, y0: number, art: Layer) {
  art.forEach((line, dy) => [...line].forEach((key, dx) => key !== '.' && put(grid, x0 + dx, y0 + dy, key)))
}

// Each eye's stamp; `focused` adds a brow slanting in over each eye (mirrored on the right).
const EYES = (ink: string): Record<KidEyes, { art: Layer; dx: number; dy: number }> => ({
  open: { art: [ink, ink], dx: 0, dy: 0 },
  blink: { art: [ink], dx: 0, dy: 1 },
  closed: { art: [ink], dx: 0, dy: 1 },
  happy: { art: [`.${ink}.`, `${ink}.${ink}`], dx: -1, dy: 0 },
  x: { art: [`${ink}.${ink}`, `.${ink}.`, `${ink}.${ink}`], dx: -1, dy: -1 },
  focused: { art: [ink, ink], dx: 0, dy: 0 },
})

// Twinkles over the kid's head, in the two empty rows and beside the ears.
const SPARKS: readonly (readonly [number, number])[] = [[1, 1], [10, 0], [6, 0], [0, 4], [11, 3], [3, 0]]

export function kidFrame(character: CharacterId, look: KidLook, tick: number): string[] {
  const art = KID_ART[character] ?? KID_ART.locki!
  const grid = Array.from({ length: KID_HEIGHT }, () => Array.from({ length: KID_WIDTH }, () => '.'))
  const y0 = TOP - look.hop
  stamp(grid, 0, y0, art.body)

  const eyes = EYES(art.ink)[look.eyes]
  const [gx, gy] = look.gaze
  art.eyeAt.forEach(([x, y], side) => {
    stamp(grid, x + eyes.dx + gx, y0 + y + eyes.dy + gy, eyes.art)
    if (look.eyes === 'focused') put(grid, x + gx + (side === 0 ? -1 : 1), y0 + y + gy - 1, art.ink)
  })
  stamp(grid, art.noseAt[0], y0 + art.noseAt[1], [art.ink + art.ink])
  if (look.blush) for (const [x, y] of art.blushAt) put(grid, x, y0 + y, 'h')
  if (look.sweat) stamp(grid, art.sweatAt[0], y0 + art.sweatAt[1], ['D', 'D'])

  if (look.sparkle) {
    SPARKS.forEach(([x, y], i) => {
      if ((tick + i) % 3 === 2) return
      put(grid, x, y, (tick + i) % 2 === 0 ? 'y' : 'l', true)
    })
  }
  if (look.zz) {
    // A little z drifting up from the kid's ear.
    const rise = tick % 4
    put(grid, 10, Math.max(0, 1 - Math.floor(rise / 2)), rise < 3 ? 'w' : 'g', true)
    if (rise >= 2) put(grid, 11, 0, 'g', true)
  }
  if (look.dots) {
    ;[8, 10].forEach((x, i) => put(grid, x, 0, Math.floor(tick / 2) % 3 === i ? 'w' : 'G', true))
    put(grid, 11, 1, Math.floor(tick / 2) % 3 === 2 ? 'w' : 'G', true)
  }

  return grid.map(row => row.join(''))
}
