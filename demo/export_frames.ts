// Export the poses the video uses, as pixel grids drawn by the mod's own composer.
// Usage: bun export_frames.ts > assets/poses.json
// Keys are `<character>:<look>:<moment>:<tick>`, a tick being the mod's 250 ms frame.
// A moment is a session activity (a loop) or an act (played once; the video loops it).
import { ACTS, lookAt, loopTicks, type Moment } from '../mod/hooks/animations'
import { PALETTE } from '../mod/hooks/characters/art'
import { CHARACTERS, learnedTricks } from '../mod/hooks/characters'
import { KID_COLORS, kidFrame, kidLook } from '../mod/hooks/kids'
import { frame } from '../mod/hooks/sprite'
import type { Activity, CharacterId, Kid, KidStatus } from '../mod/types'

// What each pal wears at each rank in the journey scene, and in the other scenes.
// Few glasses or bandanas, so the faces show. Backdrops are left out: the video
// paints its own.
const LOOKS: Record<CharacterId, Record<string, string[]>> = {
  locki: {
    lv1: [],
    lv5: ['feather'],
    lv10: ['feather', 'harmonica'],
    lv15: ['feather', 'lasso'],
    lv20: ['gold-star', 'lasso'],
    lv30: ['gold-star', 'lasso', 'white-hat'],
    lv40: ['heart-shades', 'gold-star', 'lasso', 'white-hat'],
    lv50: ['gold-star', 'lasso', 'galaxy-hat'],
    demo: ['gold-star', 'lasso', 'white-hat'],
  },
  cappl: {
    lv1: [],
    lv5: ['straw'],
    lv10: ['coffee'],
    lv15: ['banjo'],
    lv20: ['banjo', 'sparrow'],
    lv30: ['banjo', 'sparrow', 'black-hat'],
    lv40: ['round-specs', 'banjo', 'sparrow', 'black-hat'],
    lv50: ['golden-banjo', 'sparrow', 'black-hat'],
    demo: ['sparrow', 'banjo', 'black-hat'],
  },
  numo: {
    lv1: [],
    lv5: ['cactus-bloom'],
    lv10: ['watering-can'],
    lv15: ['logbook'],
    lv20: ['moon-badge', 'logbook'],
    lv30: ['logbook', 'camel-hat'],
    lv40: ['reading-specs', 'logbook', 'camel-hat'],
    lv50: ['golden-can', 'camel-hat'],
    demo: ['watering-can', 'camel-hat'],
  },
}
const LEVEL_OF: Record<string, number> = { lv1: 1, lv5: 5, lv10: 10, lv15: 15, lv20: 20, lv30: 30, lv40: 40, lv50: 50, demo: 35 }
const ACTIVITIES: Activity[] = ['idle', 'sleeping', 'thinking', 'reading', 'editing', 'running', 'testing', 'waiting']

const out: Record<string, string[]> = {}
const ticksOf: Record<string, number> = {}
for (const [character, looks] of Object.entries(LOOKS) as [CharacterId, Record<string, string[]>][]) {
  const pal = CHARACTERS.find(one => one.id === character)!
  for (const [look, equipped] of Object.entries(looks)) {
    const learned = learnedTricks(pal, LEVEL_OF[look]!).map(trick => trick.act)
    const draw = (name: string, moment: (tick: number) => Moment, ticks: number) => {
      ticksOf[`${character}:${name}`] = ticks
      for (let tick = 0; tick < ticks; tick += 1) {
        out[`${character}:${look}:${name}:${tick}`] = frame({ character, look: lookAt(moment(tick)), tick, equipped, size: 32 })
      }
    }
    for (const activity of ACTIVITIES) {
      const base = (tick: number): Moment => ({ character, activity, tick, learned })
      draw(activity, base, activity === 'idle' ? loopTicks(base(0)) * 2 : 16)
    }
    // A plain idle: blinks, nothing else.
    draw('still', tick => ({ character, activity: 'idle', tick, learned: [] }), 48)
    for (const [name, act] of Object.entries(ACTS)) {
      draw(name, tick => ({ character, activity: 'idle', tick, learned, act: { name, t: tick } }), act.ticks)
    }
  }
}
// The deputies (the pal's kids in the mod's code), for the deputies scene: each state over
// 16 ticks, keyed `kid:<character>:<state>:<tick>`. The bandana stays in roles '1' '2' '3';
// `kidColors` has each slot's colours for them.
const NOW = 1_000_000
const kid = (status: KidStatus, activity: Activity, extra: Partial<Kid> = {}): Kid => ({
  id: 'k', slot: 0, label: '', type: '', status, activity, startedAt: NOW - 60_000, tokens: 0, seenAt: NOW,
  ...(status === 'working' ? {} : { endedAt: NOW - 30_000 }), ...extra,
})
const KID_STATES: Record<string, Kid> = {
  born: kid('working', 'thinking', { startedAt: NOW - 200 }),
  thinking: kid('working', 'thinking'),
  reading: kid('working', 'reading'),
  editing: kid('working', 'editing'),
  running: kid('working', 'running'),
  testing: kid('working', 'testing'),
  cheer: kid('done', 'thinking', { endedAt: NOW - 200 }),
  done: kid('done', 'thinking'),
}
for (const pal of CHARACTERS) {
  for (const [state, one] of Object.entries(KID_STATES)) {
    ticksOf[`kid:${pal.id}:${state}`] = 16
    for (let tick = 0; tick < 16; tick += 1) out[`kid:${pal.id}:${state}:${tick}`] = kidFrame(pal.id, kidLook(one, NOW, tick, 0), tick)
  }
}
const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`
const kidColors = KID_COLORS.map(color => ({ 1: hex(color.main), 2: hex(color.shade), 3: hex(color.light), text: color.text }))

const palette = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, hex(v)]))
process.stdout.write(JSON.stringify({ palette, ticks: ticksOf, frames: out, kidColors }))
