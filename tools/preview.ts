// Renders a sprite sheet to a PNG through the mod's own composer: activities, acts,
// tricks, items and both sizes. Usage: bun tools/preview.ts docs/cappl-pals-sheet.png [--looks | --hero | --acts=wave,nod]
// (--hero draws the README's strip; --acts draws every tick of the named acts, one row per act and character).
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

import type { CharacterId } from '../mod/types'
import { ACTS, lookAt, type Activity } from '../mod/hooks/animations'
import { CHARACTERS } from '../mod/hooks/characters'
import { PALETTE } from '../mod/hooks/characters/art'
import { frame, type Pose } from '../mod/hooks/sprite'

const SCALE = 6
const BG = 0x1f2430
const CELL_W = 36 * SCALE
const CELL_H = 32 * SCALE
const isLooks = process.argv.includes('--looks')
const isHero = process.argv.includes('--hero')
const actNames = process.argv.find(arg => arg.startsWith('--acts='))?.slice('--acts='.length).split(',')

type Labeled = Pose & { label: string }
const at = (id: CharacterId, label: string, look: Pose['look'], extra: Partial<Pose> = {}): Labeled => ({
  character: id, label, look, tick: 0, equipped: [], size: 32, ...extra,
})
const moment = (id: CharacterId, activity: Activity, tick: number, act?: string, t = 0) =>
  lookAt({ character: id, activity, tick, learned: [], ...(act === undefined ? {} : { act: { name: act, t } }) })

const rowsOf = (id: CharacterId): Labeled[][] => {
  const character = CHARACTERS.find(one => one.id === id)!
  const activities: Labeled[] = (['idle', 'sleeping', 'thinking', 'reading', 'editing', 'running', 'testing', 'waiting'] as const).flatMap(a => [
    at(id, a, moment(id, a, 1), { tick: 1 }),
    at(id, `${a}+`, moment(id, a, 6), { tick: 6 }),
  ])
  const acts: Labeled[] = ['listen', 'celebrate', 'bigCelebrate', 'lucky', 'fail', 'dance1', 'dance2', 'dance3', 'pet', 'petMore', 'treat', 'hello', 'buy']
    .flatMap(name => [2, Math.max(3, (ACTS[name]?.ticks ?? 8) - 3)].map(t => at(id, `${name}@${t}`, moment(id, 'idle', 0, name, t), { tick: t })))
  const tricks: Labeled[] = character.tricks.flatMap(trick =>
    [3, Math.floor((ACTS[trick.act]?.ticks ?? 8) / 2) + 2].map(t => at(id, `${trick.act}@${t}`, moment(id, 'idle', 0, trick.act, t), { tick: t })))
  if (isHero) {
    const dressed = id === 'locki' ? ['heart-shades', 'white-hat'] : ['banjo', 'starry-night']
    return [[
      at(id, 'idle', moment(id, 'idle', 1), { tick: 1 }),
      at(id, 'pet', moment(id, 'idle', 0, 'pet', 3), { tick: 3 }),
      at(id, 'thinking', moment(id, 'thinking', 1), { tick: 1 }),
      at(id, 'treat', moment(id, 'idle', 0, 'treat', 3), { tick: 3 }),
      at(id, 'celebrate', moment(id, 'idle', 0, 'bigCelebrate', 5), { tick: 5 }),
      at(id, 'sleeping', moment(id, 'sleeping', 2), { tick: 2 }),
      at(id, 'dressed', { mouth: 'w', blush: true, eyes: 'happy' }, { tick: 1, equipped: dressed }),
    ]]
  }
  if (actNames !== undefined) {
    return actNames.map(name => Array.from({ length: ACTS[name]?.ticks ?? 0 }, (_, t) => at(id, `${name}@${t}`, moment(id, 'idle', 0, name, t), { tick: t })))
  }
  if (isLooks) return [activities.slice(0, 8), activities.slice(8), acts.slice(0, 13), acts.slice(13), tricks.slice(0, 10), tricks.slice(10)]
  const items: Labeled[] = character.items.map(item => at(id, item.id, {}, { equipped: [item.id] }))
  const mini: Labeled[] = [at(id, 'mini', {}, { size: 16 }), ...character.items.map(item => at(id, `mini-${item.id}`, {}, { size: 16, equipped: [item.id] }))]
  return [activities.slice(0, 11), [...items, at(id, 'full', {}, { equipped: character.items.slice(-5).map(item => item.id) })], mini]
}

const grid = CHARACTERS.flatMap(one => rowsOf(one.id))
const perRow = Math.max(...grid.map(row => row.length))
const width = perRow * CELL_W
const height = grid.length * CELL_H
const pixels = new Uint8Array(width * height * 3)
const put = (x: number, y: number, color: number) => {
  const p = (y * width + x) * 3
  pixels[p] = (color >> 16) & 255
  pixels[p + 1] = (color >> 8) & 255
  pixels[p + 2] = color & 255
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
writeFileSync(process.argv[2]!, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', new Uint8Array()),
]))
console.log(grid.map(row => row.map(p => p.label).join(' ')).join('\n'))
