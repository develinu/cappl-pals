import type { CharacterId, FxKind, Mood } from '../types'
import { characterOf } from './characters'
import { BODY, ITEM_ART, PALETTE, type BodyArt, type ItemArt, type ItemLayer, type Layer } from './characters/art'

// Composes a character frame from its layers (characters/art.ts). One terminal cell
// holds two pixels stacked with a half block (▀▄), so 32×28 pixels is 32×14 cells.

export type Size = 32 | 16

export type Pose = {
  character: CharacterId
  mood: Mood
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

function cycle(list: readonly number[], tick: number): number {
  return list.length === 0 ? 0 : (list[tick % list.length] ?? 0)
}

// ── Sparkles: drawn only on empty cells around the character ─────────────────

const ringCache = new Map<string, [number, number][]>()

// Sixteen empty spots two or three pixels off the silhouette, spread evenly around it.
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

function sparkles(grid: Grid, body: BodyArt, character: CharacterId, kind: FxKind, size: Size, tick: number) {
  const style = characterOf(character)
  const colors = style.fxColors[kind]
  const spots = ringSpots(body)
  const count = SPOTS_FOR[kind]
  for (let i = 0; i < count; i += 1) {
    const [x, y] = spots[Math.floor((i * spots.length) / count)]!
    const color = colors[(i + Math.floor(tick / 2)) % colors.length]!
    const phase = (tick + i * 2) % 4
    if (style.sparkle === 'note') {
      // Notes rise a pixel per tick and fade on the fourth.
      if (phase === 3) continue
      if (size === 16) {
        px(grid, x, y - phase, color, true)
        continue
      }
      NOTE.forEach((line, dy) => {
        for (let dx = 0; dx < line.length; dx += 1) {
          if (line[dx] === 'X') px(grid, x + dx - 2, y + dy - 4 - phase, color, true)
        }
      })
      continue
    }
    if (phase === 3) continue
    px(grid, x, y, color, true)
    if (phase >= 1) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) px(grid, x + dx, y + dy, color, true)
    if (phase === 2 && size === 32) {
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) px(grid, x + dx, y + dy, 'w', true)
    }
  }
}

// ── A frame ─────────────────────────────────────────────────────────────────

const LOOK = [0, 0, -1, -1, 0, 0, 1, 1]

export function frame(pose: Pose): string[] {
  const { mood, tick, size } = pose
  const character = characterOf(pose.character)
  const body: BodyArt = BODY[character.id][size]
  const art = ITEM_ART[character.id] ?? {}
  const worn = pose.equipped.flatMap(id => (art[id]?.[size] === undefined ? [] : [art[id]![size]]))
  const on = (where: ItemLayer) => worn.filter(item => item.layer === where)
  const isWorking = mood === 'working'
  const isHappy = mood === 'happy'

  const grid = blank(body.width, body.height)
  const ears = isHappy ? cycle(character.happy.ears, tick) : !isWorking && tick % 40 === 20 ? 1 : 0
  stamp(grid, 0, -ears, body.ears)
  stamp(grid, 0, 0, body.head)

  // Eyes: blink now and then, read left and right while working, smile when happy.
  if (isHappy) {
    for (const [x, y] of body.eyes.happyAt) stamp(grid, x, y, body.eyes.happy)
  } else {
    const isBlink = !isWorking && tick % 24 === 23
    const look = isWorking ? (LOOK[Math.floor(tick / 2) % LOOK.length] ?? 0) : 0
    for (const [x, y] of body.eyes.at) stamp(grid, x + look, y, isBlink ? body.eyes.blink : body.eyes.open)
  }
  stamp(grid, body.nose.at[0], body.nose.at[1], body.nose.art)
  for (const item of on('face')) stamp(grid, 0, 0, frameOf(item, tick))

  const lift = isHappy ? cycle(character.happy.hat, tick) : 0
  const recolor = Object.assign({}, ...on('hat').map(item => item.recolor ?? {})) as Record<string, string>
  stamp(grid, 0, -lift, body.hat, recolor)
  for (const item of on('hat')) stamp(grid, 0, -lift, frameOf(item, tick))

  // While working the paws tap on the ledge and put down what they hold.
  if (!isWorking) for (const item of on('hand')) stamp(grid, 0, 0, frameOf(item, tick))
  body.paws.forEach((paw, side) => stamp(grid, 0, isWorking && tick % 2 === side ? -1 : 0, paw))
  for (const item of on('front')) stamp(grid, 0, 0, frameOf(item, tick))

  if (pose.fx !== undefined) sparkles(grid, body, character.id, pose.fx, size, tick)

  // Backgrounds go under whatever is still empty, sparkles included.
  for (const item of on('back')) {
    const back = blank(body.width, body.height)
    stamp(back, 0, 0, frameOf(item, tick))
    back.forEach((line, y) => line.forEach((pixel, x) => pixel !== '.' && px(grid, x, y, pixel, true)))
  }

  const rows = grid.map(line => line.join(''))
  // Happy: a little hop every other tick.
  if (isHappy && tick % 2 === 1 && on('back').length === 0) return [...rows.slice(1), '.'.repeat(body.width)]

  return rows
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
export function animatedSvgOf(frames: readonly (readonly string[])[], tickMs: number): string {
  const first = frames[0] ?? []
  const distinct: string[] = []
  const order = frames.map(rows => {
    const signature = rows.join('\n')
    let index = distinct.indexOf(signature)
    if (index < 0) index = distinct.push(signature) - 1
    return index
  })
  if (distinct.length < 2) return svgOf(first)
  const duration = `${(frames.length * tickMs) / 1000}s`
  const groups = distinct.map((signature, index) => {
    const values = order.map(shown => (shown === index ? 'visible' : 'hidden')).join(';')
    const start = order[0] === index ? 'visible' : 'hidden'
    const animate = `<animate attributeName="visibility" values="${values}" dur="${duration}" calcMode="discrete" repeatCount="indefinite"/>`

    return `<g visibility="${start}">${pathsOf(signature.split('\n'))}${animate}</g>`
  })
  const svg = svgFrame(first[0]?.length ?? 0, first.length, groups.join(''))

  // Too long for the element: fall back to every other frame, then to a still.
  if (svg.length <= SVG_LIMIT) return svg
  if (frames.length >= 4) return animatedSvgOf(frames.filter((_, i) => i % 2 === 0), tickMs * 2)

  return svgOf(first)
}

// How many 250 ms ticks one loop of each mood takes: idle covers two blinks and an
// ear twitch, working the eyes' left-right sweep, happy the hop and the hat tip.
export const LOOP_TICKS: Readonly<Record<Mood, number>> = { idle: 48, working: 16, happy: 8 }
