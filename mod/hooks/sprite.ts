import type { CharacterId, FxKind } from '../types'
import { characterOf } from './characters'
import {
  BODY,
  BUBBLES,
  ITEM_ART,
  PALETTE,
  TREAT_ART,
  type BodyArt,
  type BrowKind,
  type BubbleKind,
  type EyeKind,
  type ItemArt,
  type ItemLayer,
  type Layer,
  type MouthKind,
} from './characters/art'

// Composes a character frame from its layers (characters/art.ts) and a Look: which
// eyes, mouth, paws and extras to show this tick (hooks/animations.ts decides). One
// terminal cell holds two pixels stacked with a half block, so 32×28 pixels is 32×14 cells.

export type Size = 32 | 16
export type PawPose = 'rest' | 'tapL' | 'tapR' | 'cheer' | 'waveHi' | 'waveLo' | 'chin' | 'hold' | 'up' | 'stretch' | 'cover'
export type Particles = 'hearts' | 'stars' | 'notes' | 'confetti'

export type Look = {
  eyes?: EyeKind
  // Where the eyes look, in pixels (applies to every eye kind).
  gaze?: readonly [number, number]
  brows?: BrowKind
  mouth?: MouthKind
  blush?: boolean
  bubble?: BubbleKind
  sweat?: boolean
  paws?: PawPose
  // The whole pal shifted (hops, sways, bows).
  body?: readonly [number, number]
  // Pixels the hat rises; negative pulls it down over the eyes.
  hat?: number
  hatDx?: number
  ears?: number
  // Put down what the paws hold (instruments, cups, ropes).
  hideHand?: boolean
  // A treat held up to the mouth, and how many bites are gone (0 whole, 3 crumbs).
  treat?: number
  particles?: Particles
}

export type Pose = {
  character: CharacterId
  look: Look
  tick: number
  // Item ids of this character (`aviators`, not `locki/aviators`).
  equipped: readonly string[]
  size: Size
  fx?: FxKind
}

const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const SPACE = 0x20

type Grid = string[][]

function blank(width: number, height: number): Grid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => '.'))
}

function px(grid: Grid, x: number, y: number, color: string, isBehind = false) {
  const row = grid[y]
  if (row === undefined || x < 0 || x >= row.length) return
  if (isBehind && row[x] !== '.') return
  row[x] = color
}

// Bites come off the top right corner, a diagonal at a time.
function bitten(layer: Layer, bites: number): Layer {
  const width = layer[0]?.length ?? 0
  const gone = bites * (width <= 2 ? 1 : 2)
  return layer.map((row, y) => [...row].map((key, x) => (width - 1 - x + y < gone ? '.' : key)).join(''))
}

function stamp(grid: Grid, x0: number, y0: number, art: Layer, recolor: Readonly<Record<string, string>> = {}) {
  art.forEach((line, dy) => {
    for (let dx = 0; dx < line.length; dx += 1) {
      const pixel = line[dx]!
      if (pixel !== '.') px(grid, x0 + dx, y0 + dy, recolor[pixel] ?? pixel)
    }
  })
}

// Items animate at half the frame rate (every 500 ms).
function frameOf(art: ItemArt, tick: number): Layer {
  return art.frames[Math.floor(tick / 2) % art.frames.length] ?? art.frames[0]!
}

// ── Paws ────────────────────────────────────────────────────────────────────

type Offsets = readonly [readonly [number, number], readonly [number, number]]

const PAWS: Readonly<Record<Size, Readonly<Record<Exclude<PawPose, 'cover'>, Offsets>>>> = {
  32: {
    rest: [[0, 0], [0, 0]],
    tapL: [[0, -1], [0, 0]],
    tapR: [[0, 0], [0, -1]],
    cheer: [[-4, -12], [4, -12]],
    waveHi: [[0, 0], [4, -11]],
    waveLo: [[0, 0], [4, -8]],
    chin: [[2, -5], [0, 0]],
    up: [[0, -2], [0, -2]],
    stretch: [[-4, -6], [4, -6]],
    hold: [[1, -2], [-1, -2]],
  },
  16: {
    rest: [[0, 0], [0, 0]],
    tapL: [[0, -1], [0, 0]],
    tapR: [[0, 0], [0, -1]],
    cheer: [[-2, -6], [2, -6]],
    waveHi: [[0, 0], [2, -5]],
    waveLo: [[0, 0], [2, -4]],
    chin: [[1, -2], [0, 0]],
    up: [[0, -1], [0, -1]],
    stretch: [[-2, -3], [2, -3]],
    hold: [[0, -1], [0, -1]],
  },
}

function bounds(layer: Layer): { x: number; y: number; w: number; h: number } {
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1
  layer.forEach((line, y) => {
    for (let x = 0; x < line.length; x += 1) {
      if (line[x] === '.') continue
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
  })
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

// Covering the eyes depends on where each pal's eyes are.
function pawOffsets(body: BodyArt, pose: PawPose, size: Size): Offsets {
  if (pose !== 'cover') return PAWS[size][pose]
  return body.paws.map((paw, side) => {
    const box = bounds(paw)
    const [ex, ey] = body.face.eyeAt[side]!
    return [Math.round(ex - (box.x + box.w / 2) + (size === 32 ? 1 : 0)), ey - box.y - 1] as const
  }) as unknown as Offsets
}

// ── Sparkles and particles: drawn only on empty cells around the pal ──────────

const ringCache = new Map<string, [number, number][]>()

// Sixteen empty spots one to three pixels off the silhouette, spread evenly around it.
function ringSpots(body: BodyArt): [number, number][] {
  const key = `${body.width}x${body.height}:${body.head[Math.floor(body.height / 2)]}`
  const cached = ringCache.get(key)
  if (cached !== undefined) return cached
  const solid = (x: number, y: number) =>
    [body.ears, body.head, body.hat, ...body.paws].some(layer => (layer[y]?.[x] ?? '.') !== '.')
  const near: [number, number, number][] = []
  for (let y = 0; y < body.height; y += 1) {
    for (let x = 0; x < body.width; x += 1) {
      if (solid(x, y)) continue
      let best = 99
      for (let yy = Math.max(0, y - 3); yy <= Math.min(body.height - 1, y + 3); yy += 1) {
        for (let xx = Math.max(0, x - 3); xx <= Math.min(body.width - 1, x + 3); xx += 1) {
          if (solid(xx, yy)) best = Math.min(best, Math.max(Math.abs(xx - x), Math.abs(yy - y)))
        }
      }
      if (best >= 1 && best <= 3) near.push([x, y, Math.atan2(y - body.height / 2, x - body.width / 2)])
    }
  }
  near.sort((a, b) => a[2] - b[2])
  const spots = Array.from({ length: 16 }, (_, i): [number, number] => {
    const [x, y] = near[Math.floor((i * near.length) / 16)] ?? [0, 0]
    return [x, y]
  })
  ringCache.set(key, spots)

  return spots
}

const SPOTS_FOR: Record<FxKind, number> = { reward: 8, comeback: 10, merge: 12, level: 16, stage: 16, buy: 10 }
const NOTE: Layer = ['..XX', '..X.', '..X.', 'XXX.', 'XX..']
const HEART: Layer = ['X.X', 'XXX', '.X.']
const CONFETTI = ['P', 'y', 'D', 'e', 'r', 'l', 'v']

function shape(grid: Grid, art: Layer, x: number, y: number, color: string) {
  art.forEach((line, dy) => {
    for (let dx = 0; dx < line.length; dx += 1) if (line[dx] === 'X') px(grid, x + dx - 1, y + dy - 2, color, true)
  })
}

function sparkles(grid: Grid, body: BodyArt, character: CharacterId, kind: FxKind, size: Size, tick: number) {
  const style = characterOf(character)
  const colors = style.fxColors[kind]
  const spots = ringSpots(body)
  const count = SPOTS_FOR[kind]
  for (let i = 0; i < count; i += 1) {
    const [x, y] = spots[Math.floor((i * spots.length) / count)]!
    const color = colors[(i + Math.floor(tick / 2)) % colors.length]!
    const phase = (tick + i * 2) % 4
    if (phase === 3) continue
    if (style.sparkle === 'note') {
      // Notes rise a pixel per tick and fade on the fourth.
      if (size === 16) px(grid, x, y - phase, color, true)
      else shape(grid, NOTE, x - 1, y - 2 - phase, color)
      continue
    }
    px(grid, x, y, color, true)
    if (phase >= 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) px(grid, x + dx, y + dy, color, true)
    if (phase === 2 && size === 32) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) px(grid, x + dx, y + dy, 'w', true)
    }
  }
}

// Hearts, stars, notes or confetti drifting up around the pal.
function particles(grid: Grid, body: BodyArt, kind: Particles, size: Size, tick: number) {
  const spots = ringSpots(body)
  for (let i = 0; i < 6; i += 1) {
    const [x, y] = spots[(i * 5 + 2) % spots.length]!
    const rise = (tick + i * 3) % 6
    if (rise === 5) continue
    const yy = y - (size === 32 ? rise : Math.floor(rise / 2))
    if (size === 16 || kind === 'confetti') {
      const color = kind === 'hearts' ? 'P' : kind === 'notes' ? 'D' : kind === 'stars' ? 'y' : CONFETTI[(i + tick) % CONFETTI.length]!
      px(grid, x, yy, color, true)
      if (kind === 'confetti' && size === 32) px(grid, x + 2, yy + 3, CONFETTI[(i + tick + 3) % CONFETTI.length]!, true)
      continue
    }
    if (kind === 'hearts') shape(grid, HEART, x, yy + 1, i % 2 === 0 ? 'P' : 'h')
    else if (kind === 'notes') shape(grid, NOTE, x, yy, i % 2 === 0 ? 'D' : 'y')
    else {
      const color = i % 2 === 0 ? 'y' : 'O'
      px(grid, x, yy, color, true)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) px(grid, x + dx, yy + dy, color, true)
    }
  }
}

// ── A frame ─────────────────────────────────────────────────────────────────

export function frame(pose: Pose): string[] {
  const { tick, size, look } = pose
  const character = characterOf(pose.character)
  const body: BodyArt = BODY[character.id][size]
  const face = body.face
  const art = ITEM_ART[character.id] ?? {}
  const worn = pose.equipped.flatMap(id => (art[id]?.[size] === undefined ? [] : [art[id]![size]]))
  const on = (where: ItemLayer) => worn.filter(item => item.layer === where)

  // The pal on its own grid first, so the whole of it can hop and sway.
  const fig = blank(body.width, body.height)
  stamp(fig, 0, 0, body.head)
  if (look.blush === true) for (const [x, y] of face.blush.at) stamp(fig, x, y, face.blush.art)
  const eye = face.eyes[look.eyes ?? 'open']
  const [gx, gy] = look.gaze ?? [0, 0]
  for (const [x, y] of face.eyeAt) stamp(fig, x + eye.dx + gx, y + eye.dy + gy, eye.art)
  if (look.brows !== undefined) {
    face.brows[look.brows].forEach((brow, side) => {
      const [x, y] = face.eyeAt[side]!
      stamp(fig, x + brow.dx, y + brow.dy, brow.art)
    })
  }
  stamp(fig, body.nose.at[0], body.nose.at[1], body.nose.art)
  if (look.mouth !== undefined) {
    const mouth = face.mouths[look.mouth]
    stamp(fig, face.mouthAt[0] + mouth.dx, face.mouthAt[1] + mouth.dy, mouth.art)
  }
  for (const item of on('face')) stamp(fig, 0, 0, frameOf(item, tick))
  if (look.sweat === true) stamp(fig, face.sweat.at[0], face.sweat.at[1], face.sweat.art)

  const hatX = look.hatDx ?? 0
  const hatY = -(look.hat ?? 0)
  const recolor = Object.assign({}, ...on('hat').map(item => item.recolor ?? {})) as Record<string, string>
  stamp(fig, hatX, hatY, body.hat, recolor)
  for (const item of on('hat')) stamp(fig, hatX, hatY, frameOf(item, tick))
  // Ears after hat so cat ears (CARO) poke visibly through the crown.
  stamp(fig, 0, -(look.ears ?? 0), body.ears)

  const paws = look.paws ?? 'rest'
  if (look.hideHand !== true && look.treat === undefined && paws === 'rest') for (const item of on('hand')) stamp(fig, 0, 0, frameOf(item, tick))
  const offsets = pawOffsets(body, paws, size)
  body.paws.forEach((paw, side) => stamp(fig, offsets[side]![0], offsets[side]![1], paw))
  // The treat sits between the paws, in front of them.
  if (look.treat !== undefined) stamp(fig, face.treatAt[0], face.treatAt[1], bitten(TREAT_ART[character.id]![size], look.treat))
  for (const item of on('front')) stamp(fig, 0, 0, frameOf(item, tick))
  if (look.bubble !== undefined) stamp(fig, face.bubbleAt[0], face.bubbleAt[1], BUBBLES[size][look.bubble])

  const grid = blank(body.width, body.height)
  const [bx, by] = look.body ?? [0, 0]
  fig.forEach((line, y) => line.forEach((pixel, x) => pixel !== '.' && px(grid, x + bx, y + by, pixel)))

  if (pose.fx !== undefined) sparkles(grid, body, character.id, pose.fx, size, tick)
  if (look.particles !== undefined) particles(grid, body, look.particles, size, tick)

  // Backgrounds go under whatever is still empty, sparkles included.
  for (const item of on('back')) {
    const back = blank(body.width, body.height)
    stamp(back, 0, 0, frameOf(item, tick))
    back.forEach((line, y) => line.forEach((pixel, x) => pixel !== '.' && px(grid, x, y, pixel, true)))
  }

  return grid.map(line => line.join(''))
}

// Raster `cells`: row-major, three little-endian u32 per cell [code point, fg, bg].
export function encode(rows: readonly string[]): { cells: string; columns: number; rows: number } {
  const columns = rows[0]?.length ?? 0
  const height = Math.ceil(rows.length / 2)
  const words = new Uint32Array(columns * height * 3)

  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < columns; cx += 1) {
      const top = PALETTE[rows[cy * 2]?.[cx] ?? '.']
      const bottom = PALETTE[rows[cy * 2 + 1]?.[cx] ?? '.']
      const at = (cy * columns + cx) * 3

      if (top !== undefined) {
        words[at] = UPPER
        words[at + 1] = top
        words[at + 2] = bottom ?? DEFAULT
      } else if (bottom !== undefined) {
        words[at] = LOWER
        words[at + 1] = bottom
        words[at + 2] = DEFAULT
      } else {
        words[at] = SPACE
        words[at + 1] = DEFAULT
        words[at + 2] = DEFAULT
      }
    }
  }

  return { cells: base64(new Uint8Array(words.buffer)), columns, rows: height }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Uint8Array.toBase64 is not in the TS lib yet.
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '='
  }

  return out
}

// Desktop, VS Code and mobile: the grid as SVG paths, one per colour, each a list
// of horizontal runs (much shorter than a <rect> per pixel).
function pathsOf(rows: readonly string[]): string {
  const runs = new Map<string, string[]>()
  rows.forEach((line, y) => {
    let x = 0
    while (x < line.length) {
      const key = line[x]!
      let end = x + 1
      while (end < line.length && line[end] === key) end += 1
      if (PALETTE[key] !== undefined) {
        const list = runs.get(key) ?? []
        list.push(`M${x} ${y}h${end - x}v1h-${end - x}z`)
        runs.set(key, list)
      }
      x = end
    }
  })

  return [...runs].map(([key, d]) => `<path fill="#${PALETTE[key]!.toString(16).padStart(6, '0')}" d="${d.join('')}"/>`).join('')
}

function svgFrame(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${body}</svg>`
}

export function svgOf(rows: readonly string[]): string {
  return svgFrame(rows[0]?.length ?? 0, rows.length, pathsOf(rows))
}

// The SVG Svg element's 131,072-character limit, with room to spare.
const SVG_LIMIT = 120_000

// A looping animation of frames shown `tickMs` apart, as SMIL inside the SVG: each
// distinct frame is a group whose visibility steps in turn. The desktop draws an
// interactive Svg in a sandboxed frame, where SMIL runs without any redraws.
function loopGroups(frames: readonly (readonly string[])[], tickMs: number): string {
  const distinct: string[] = []
  const order = frames.map(rows => {
    const signature = rows.join('\n')
    let index = distinct.indexOf(signature)
    if (index < 0) index = distinct.push(signature) - 1
    return index
  })
  if (distinct.length < 2) return pathsOf(frames[0] ?? [])
  const duration = `${(frames.length * tickMs) / 1000}s`

  return distinct
    .map((signature, index) => {
      const values = order.map(shown => (shown === index ? 'visible' : 'hidden')).join(';')
      const start = order[0] === index ? 'visible' : 'hidden'
      const animate = `<animate attributeName="visibility" values="${values}" dur="${duration}" calcMode="discrete" repeatCount="indefinite"/>`

      return `<g visibility="${start}">${pathsOf(signature.split('\n'))}${animate}</g>`
    })
    .join('')
}

// With `hover` frames, pointing at the picture plays them instead (CSS :hover inside
// the sandboxed frame), so a desktop pal reacts to the mouse.
export function animatedSvgOf(frames: readonly (readonly string[])[], tickMs: number, hover?: readonly (readonly string[])[]): string {
  const first = frames[0] ?? []
  const width = first[0]?.length ?? 0
  const main = loopGroups(frames, tickMs)
  const body =
    hover === undefined || hover.length === 0
      ? main
      : `<style>.h{display:none}svg:hover .h{display:inline}svg:hover .m{display:none}</style><g class="m">${main}</g><g class="h">${loopGroups(hover, tickMs)}</g>`
  const svg = svgFrame(width, first.length, body)

  // Too long for the element: drop the hover loop, then every other frame, then to a still.
  if (svg.length <= SVG_LIMIT) return svg
  if (hover !== undefined) return animatedSvgOf(frames, tickMs)
  if (frames.length >= 4) return animatedSvgOf(frames.filter((_, i) => i % 2 === 0), tickMs * 2)

  return svgOf(first)
}
