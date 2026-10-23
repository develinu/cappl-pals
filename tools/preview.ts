// Renders a sprite sheet (moods, every item, every effect, both sizes) to a PNG
// through the mod's own composer. Usage: bun tools/preview.ts docs/howdy-sheet.png
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

import type { CharacterId } from '../mod/types'
import { CHARACTERS } from '../mod/hooks/characters'
import { PALETTE } from '../mod/hooks/characters/art'
import { frame, type Pose } from '../mod/hooks/sprite'

const SCALE = 6
const BG = 0x1f2430
const CELL_W = 36 * SCALE
const CELL_H = 32 * SCALE

type Labeled = Pose & { label: string }
const rowsOf = (id: CharacterId): Labeled[][] => {
  const character = CHARACTERS.find(one => one.id === id)!
  const base = { character: id, equipped: [] as string[], size: 32 as const }
  const moods: Labeled[] = [
    { ...base, label: 'idle', mood: 'idle', tick: 0 },
    { ...base, label: 'blink', mood: 'idle', tick: 23 },
    { ...base, label: 'happy', mood: 'happy', tick: 1 },
    { ...base, label: 'happy2', mood: 'happy', tick: 2 },
    { ...base, label: 'work1', mood: 'working', tick: 0 },
    { ...base, label: 'work2', mood: 'working', tick: 5 },
  ]
  const items: Labeled[] = character.items.map(item => ({ ...base, label: item.id, mood: 'idle', tick: 0, equipped: [item.id] }))
  const fx: Labeled[] = (['reward', 'merge', 'level', 'stage', 'buy'] as const).map(kind => ({
    ...base, label: `fx-${kind}`, mood: 'happy', tick: 2, fx: kind,
  }))
  const full: Labeled = { ...base, label: 'full', mood: 'idle', tick: 0, equipped: character.items.slice(-5).map(item => item.id) }
  const mini: Labeled[] = [
    { ...base, label: 'mini', mood: 'idle', tick: 0, size: 16 },
    ...character.items.map(item => ({ ...base, label: `mini-${item.id}`, mood: 'idle' as const, tick: 0, size: 16 as const, equipped: [item.id] })),
  ]
  return [[...moods, ...fx], [...items, full], mini]
}

const grid = CHARACTERS.flatMap(one => rowsOf(one.id))
const perRow = Math.max(...grid.map(row => row.length))
const width = perRow * CELL_W
const height = grid.length * CELL_H
const pixels = new Uint8Array(width * height * 3)
const put = (x: number, y: number, color: number) => {
  const at = (y * width + x) * 3
  pixels[at] = (color >> 16) & 255
  pixels[at + 1] = (color >> 8) & 255
  pixels[at + 2] = color & 255
}
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, BG)

grid.forEach((row, r) =>
  row.forEach((pose, c) => {
    const rows = frame(pose)
    const scale = pose.size === 16 ? SCALE * 2 : SCALE
    const ox = c * CELL_W + SCALE * 2
    const oy = r * CELL_H + SCALE * 2
    rows.forEach((line, y) =>
      [...line].forEach((key, x) => {
        const color = PALETTE[key]
        if (color === undefined) return
        for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) put(ox + x * scale + dx, oy + y * scale + dy, color)
      }),
    )
  }),
)

const raw = new Uint8Array((width * 3 + 1) * height)
for (let y = 0; y < height; y += 1) {
  raw[y * (width * 3 + 1)] = 0
  raw.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1)
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
  return out
}
const ihdr = new Uint8Array(13)
new DataView(ihdr.buffer).setUint32(0, width)
new DataView(ihdr.buffer).setUint32(4, height)
ihdr.set([8, 2, 0, 0, 0], 8)
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', new Uint8Array()),
])
writeFileSync(process.argv[2]!, png)
console.log(grid.map(row => row.map(p => p.label).join(' ')).join('\n'))
