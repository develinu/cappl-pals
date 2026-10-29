import { expect, test } from 'claude-code/testing'

import type { Activity, Kid, KidStatus } from '../types'
import { KID_COLORS, kidColors, kidFrame, kidLook } from '../hooks/kids'
import { encode } from '../hooks/sprite'
import { KID_SLOTS } from '../hooks/work'

const T0 = Date.UTC(2026, 9, 29, 3)
const kid = (status: KidStatus, activity: Activity = 'thinking', extra: Partial<Kid> = {}): Kid => ({
  id: 'a', slot: 0, label: 'a', type: 'Explore', status, activity, startedAt: T0 - 60_000, tokens: 0, seenAt: T0,
  ...(status === 'working' ? {} : { endedAt: T0 - 30_000 }), ...extra,
})
const frames = (k: Kid, character: 'locki' | 'cappl' = 'locki', now = T0) =>
  Array.from({ length: 16 }, (_, tick) => kidFrame(character, kidLook(k, now, tick, 0), tick).join('\n'))

test('a kid is 12 × 14 pixels, 12 × 7 cells, for both pals', () => {
  for (const character of ['locki', 'cappl'] as const) {
    const rows = kidFrame(character, kidLook(kid('working'), T0, 0, 0), 0)
    expect(rows).toHaveLength(14)
    expect(rows.every(row => row.length === 12)).toBe(true)
    const cells = encode(rows, kidColors(0))
    expect([cells.columns, cells.rows]).toEqual([12, 7])
  }
})

test(`every one of the ${KID_SLOTS} colours paints the bib its own colour`, () => {
  expect(KID_COLORS).toHaveLength(KID_SLOTS)
  const mains = KID_COLORS.map(color => color.main)
  expect(new Set(mains).size).toBe(KID_SLOTS)
  const rows = kidFrame('cappl', kidLook(kid('working'), T0, 0, 0), 0)
  expect(rows.join('')).toMatch(/1/)
  // The bib keys are coloured only by the kid's own colours, so two kids differ in the cells.
  expect(encode(rows, kidColors(0)).cells).not.toBe(encode(rows, kidColors(3)).cells)
})

test('a working kid moves with what it does', () => {
  for (const activity of ['thinking', 'reading', 'editing', 'running', 'testing', 'waiting'] as const) {
    expect(new Set(frames(kid('working', activity))).size).toBeGreaterThan(1)
  }
  // Reading looks one way and then the other; editing hops.
  const reading = Array.from({ length: 8 }, (_, tick) => kidLook(kid('working', 'reading'), T0, tick, 0).gaze[0])
  expect(new Set(reading)).toEqual(new Set([-1, 1]))
  expect(Array.from({ length: 4 }, (_, tick) => kidLook(kid('working', 'editing'), T0, tick, 0).hop)).toContain(1)
  expect(kidLook(kid('working', 'running'), T0, 1, 0).sweat).toBe(true)
})

test('finished kids show how it went: happy, crossed out, or asleep', () => {
  expect(kidLook(kid('done'), T0, 3, 0).eyes).toBe('happy')
  expect(kidLook(kid('failed'), T0, 3, 0)).toMatchObject({ eyes: 'x', sweat: true })
  expect(kidLook(kid('stopped'), T0, 3, 0)).toMatchObject({ eyes: 'closed', zz: true })
  // Just done: a little cheer with sparkles, then it calms down.
  const fresh = kid('done', 'thinking', { endedAt: T0 - 500 })
  expect(kidLook(fresh, T0, 1, 0).sparkle).toBe(true)
  expect(kidLook(kid('done'), T0, 1, 0).sparkle).toBe(false)
  // The x and closed eyes are drawn, not just named.
  expect(frames(kid('failed'))[0]).not.toBe(frames(kid('done'))[0])
  expect(frames(kid('stopped'))[0]).not.toBe(frames(kid('done'))[0])
})

test('a kid just sent off pops in with sparkles', () => {
  const born = kid('working', 'thinking', { startedAt: T0 - 400 })
  expect(kidLook(born, T0, 0, 0).sparkle).toBe(true)
  expect(kidLook(kid('working'), T0, 0, 0).sparkle).toBe(false)
})

test('kids side by side do not move in step', () => {
  const a = Array.from({ length: 16 }, (_, tick) => kidLook(kid('working', 'reading'), T0, tick, 0).gaze[0])
  const b = Array.from({ length: 16 }, (_, tick) => kidLook(kid('working', 'reading'), T0, tick, 3).gaze[0])
  expect(a).not.toEqual(b)
})
