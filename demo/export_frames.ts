// Export the poses the video uses, as pixel grids drawn by the mod's own composer.
// Usage: bun export_frames.ts > assets/poses.json
import { PALETTE } from '../mod/hooks/characters/art'
import { frame, type Pose } from '../mod/hooks/sprite'
import type { CharacterId } from '../mod/types'

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
    for (const mood of ['idle', 'happy', 'working'] as const) {
      for (let tick = 0; tick < 24; tick += 1) {
        const pose: Pose = { character, mood, tick, equipped, size: 32 }
        out[`${character}:${look}:${mood}:${tick}`] = frame(pose)
      }
    }
    for (const fx of ['reward', 'level', 'stage', 'buy'] as const) {
      for (let tick = 0; tick < 8; tick += 1) {
        out[`${character}:${look}:fx-${fx}:${tick}`] = frame({ character, mood: 'happy', tick, equipped, size: 32, fx })
      }
    }
  }
}
const palette = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]))
process.stdout.write(JSON.stringify({ palette, frames: out }))
