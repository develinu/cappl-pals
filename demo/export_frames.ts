// Export the poses the video uses, as pixel grids drawn by the mod's own composer.
// Usage: bun export_frames.ts > assets/poses.json
import { ACTS, lookAt } from '../mod/hooks/animations'
import { PALETTE } from '../mod/hooks/characters/art'
import { frame, type Look } from '../mod/hooks/sprite'
import type { CharacterId } from '../mod/types'

// The video's three moods, as the mod draws them: idle, celebrating, editing.
const MOODS = {
  idle: (character: CharacterId, tick: number): Look => lookAt({ character, activity: 'idle', tick, learned: [] }),
  happy: (character: CharacterId, tick: number): Look => ACTS.celebrate!.at(tick % ACTS.celebrate!.ticks, character),
  working: (character: CharacterId, tick: number): Look => lookAt({ character, activity: 'editing', tick, learned: [] }),
}

// What each pal wears at each rank in the journey scene. Backdrops are left out:
// the video paints its own.
const LOOKS: Record<CharacterId, Record<string, string[]>> = {
  locki: {
    lv1: [],
    lv5: ['aviators', 'feather'],
    lv10: ['aviators', 'feather', 'harmonica'],
    lv15: ['heart-shades', 'feather', 'lasso'],
    lv20: ['heart-shades', 'gold-star', 'lasso'],
    lv30: ['heart-shades', 'gold-star', 'lasso', 'white-hat'],
    lv40: ['aviators', 'gold-star', 'lasso', 'white-hat'],
    lv50: ['heart-shades', 'gold-star', 'lasso', 'galaxy-hat'],
    demo: ['aviators', 'feather', 'harmonica'],
  },
  cappl: {
    lv1: [],
    lv5: ['round-specs', 'straw'],
    lv10: ['round-specs', 'straw', 'coffee'],
    lv15: ['round-specs', 'bandana', 'banjo'],
    lv20: ['round-specs', 'bandana', 'banjo', 'sparrow'],
    lv30: ['round-specs', 'bandana', 'banjo', 'sparrow', 'black-hat'],
    lv40: ['round-specs', 'bandana', 'banjo', 'sparrow', 'black-hat'],
    lv50: ['round-specs', 'straw', 'golden-banjo', 'sparrow', 'black-hat'],
    demo: ['round-specs', 'straw', 'banjo'],
  },
}

const out: Record<string, string[]> = {}
for (const [character, looks] of Object.entries(LOOKS) as [CharacterId, Record<string, string[]>][]) {
  for (const [look, equipped] of Object.entries(looks)) {
    for (const [mood, lookOf] of Object.entries(MOODS)) {
      for (let tick = 0; tick < 24; tick += 1) {
        out[`${character}:${look}:${mood}:${tick}`] = frame({ character, look: lookOf(character, tick), tick, equipped, size: 32 })
      }
    }
    for (const fx of ['reward', 'level', 'stage', 'buy'] as const) {
      for (let tick = 0; tick < 8; tick += 1) {
        out[`${character}:${look}:fx-${fx}:${tick}`] = frame({ character, look: MOODS.happy(character, tick), tick, equipped, size: 32, fx })
      }
    }
  }
}
const palette = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]))
process.stdout.write(JSON.stringify({ palette, frames: out }))
