import type { Activity, CharacterId } from '../types'
import type { Look } from './sprite'

export type { Activity }

// What the pal looks like on each 250 ms tick. A session is in one Activity (what
// Claude is doing); an Act is a short one-off on top of it (a reward, a pet, a trick).
// Idle pals fill the quiet with small actions and the tricks they have learned.

type Anim = { ticks: number; at: (t: number, who: CharacterId) => Look }

const pick = <T,>(list: readonly T[], t: number): T => list[((t % list.length) + list.length) % list.length]!
const isLocki = (who: CharacterId) => who === 'locki'

// ── Activities: looped while they last ──────────────────────────────────────

const ACTIVITY: Readonly<Record<Activity, (t: number, who: CharacterId) => Look>> = {
  idle: t => ({ eyes: t % 24 === 23 ? 'blink' : 'open', ears: t % 40 === 20 ? 1 : 0 }),
  // A nap: LOCKI's ears droop, CAPPL tips the hat over the eyes.
  sleeping: (t, who) => ({
    eyes: 'closed',
    bubble: t % 8 < 5 ? 'zzz' : undefined,
    body: [0, t % 16 < 8 ? 0 : 1],
    ...(isLocki(who) ? { ears: -1 } : { hat: -2 }),
  }),
  thinking: t => ({ paws: 'chin', gaze: [Math.floor(t / 4) % 2 === 0 ? -1 : 1, -1], bubble: 'dots' }),
  reading: t => ({ gaze: pick<[number, number]>([[-1, 1], [0, 1], [1, 1], [0, 1]], Math.floor(t / 2)), ears: t % 16 === 0 ? 1 : 0 }),
  editing: t => ({ paws: t % 2 === 0 ? 'tapL' : 'tapR', gaze: [0, 1], mouth: 'tongue', hideHand: true }),
  running: (t, who) => ({
    body: pick<[number, number]>([[0, 0], [1, 0], [0, 0], [-1, 0]], Math.floor(t / (isLocki(who) ? 2 : 4))),
    mouth: 'smile',
  }),
  testing: t => ({ paws: 'hold', eyes: 'wide', mouth: 'o', sweat: t % 4 < 2, body: [t % 4 === 0 ? 1 : 0, 0], hideHand: true }),
  waiting: t => ({ bubble: '?', paws: Math.floor(t / 2) % 2 === 0 ? 'waveHi' : 'waveLo', eyes: 'shiny', mouth: 'open' }),
}

// ── Acts: one-offs ──────────────────────────────────────────────────────────

const wave: Anim = {
  ticks: 10,
  at: t => ({
    paws: t % 4 < 2 ? 'waveHi' : 'waveLo',
    eyes: t < 6 ? 'shiny' : 'happy',
    mouth: 'open',
    blush: true,
    body: [0, t % 4 === 0 ? -1 : 0],
    bubble: t >= 4 ? 'heart' : undefined,
  }),
}
const hop: Anim = {
  ticks: 10,
  at: t => {
    const dy = pick([0, -2, -1, 0, -2, -1, 0, -2, -1, 0], t)
    return { body: [0, dy], paws: dy < 0 ? 'up' : 'rest', eyes: dy < 0 ? 'happy' : 'shiny', mouth: 'open', blush: true, ears: dy < 0 ? 1 : 0 }
  },
}
const twoStep = (slow: boolean, extra: Look = {}): Anim => ({
  ticks: 16,
  at: t => {
    const step = slow ? Math.floor(t / 2) : t
    return {
      body: pick<[number, number]>([[-1, 0], [-1, -1], [0, 0], [1, 0], [1, -1], [0, 0]], step),
      paws: step % 2 === 0 ? 'tapL' : 'tapR',
      eyes: 'happy',
      mouth: 'open',
      blush: true,
      ...extra,
    }
  },
})
const tumble: Anim = {
  ticks: 12,
  at: t => ({
    body: [pick([-3, -2, -1, 0, 1, 2, 3, 2, 1, 0, 0, 0], t), t < 9 ? -1 : 0],
    paws: t % 2 === 0 ? 'cheer' : 'up',
    eyes: t < 7 ? 'x' : 'happy',
    mouth: 'open',
  }),
}
const peekaboo = (withHat: boolean): Anim => ({
  ticks: 12,
  at: t => {
    if (t < 6) return withHat ? { hat: -3, mouth: 'smile' } : { paws: 'cover', eyes: 'closed', mouth: 'smile' }
    if (t < 8) return { eyes: 'wide', bubble: '!', mouth: 'open', ...(withHat ? { hat: 3 } : { paws: 'stretch' }) }
    return { eyes: 'happy', mouth: 'open', blush: true }
  },
})

export const ACTS: Readonly<Record<string, Anim>> = {
  listen: { ticks: 6, at: t => ({ eyes: 'wide', bubble: '!', ears: 1, body: [0, t < 2 ? -1 : 0] }) },
  celebrate: {
    ticks: 8,
    at: (t, who) => ({
      paws: 'cheer',
      eyes: t % 4 < 2 ? 'shiny' : 'happy',
      mouth: 'open',
      blush: true,
      body: [0, t % 2 === 0 ? -1 : 0],
      particles: isLocki(who) ? 'stars' : 'notes',
    }),
  },
  bigCelebrate: {
    ticks: 16,
    at: t => ({
      paws: t % 4 < 2 ? 'cheer' : 'up',
      eyes: 'star',
      mouth: 'open',
      blush: true,
      body: [0, pick([0, -2, -3, -2, 0, 0, -1, 0], t)],
      hat: pick([0, 2, 4, 5, 4, 2, 0, 0], t),
      particles: 'confetti',
    }),
  },
  lucky: { ticks: 8, at: t => ({ eyes: 'star', bubble: 'star', mouth: t < 3 ? 'o' : 'open', particles: 'stars', blush: true }) },
  fail: {
    ticks: 10,
    at: t =>
      t < 4
        ? { eyes: 'x', mouth: 'o', sweat: true, bubble: '!', body: [t % 2 === 0 ? 1 : -1, 0] }
        : { brows: 'determined', paws: t >= 6 ? 'up' : 'rest', mouth: 'smile' },
  },
  dance1: twoStep(false),
  dance2: {
    ticks: 12,
    at: t => ({
      body: [0, pick([0, -2, -3, -1], t)],
      paws: t % 4 === 2 ? 'cheer' : 'up',
      eyes: t % 4 === 2 ? 'star' : 'happy',
      mouth: 'open',
      hat: t % 4 === 2 ? 3 : 0,
      blush: true,
    }),
  },
  dance3: {
    ticks: 12,
    at: (t, who) => ({ paws: t % 4 < 2 ? 'waveHi' : 'waveLo', eyes: 'happy', mouth: 'w', bubble: isLocki(who) ? 'heart' : 'note', blush: true }),
  },
  pet: { ticks: 8, at: t => ({ eyes: t < 5 ? 'heart' : 'happy', blush: true, mouth: 'w', particles: 'hearts', body: [0, t < 2 ? 1 : 0], ears: t % 2 }) },
  petMore: {
    ticks: 12,
    at: t => ({
      eyes: 'happy',
      blush: true,
      mouth: 'open',
      particles: 'hearts',
      bubble: 'heart',
      body: pick<[number, number]>([[-2, 0], [-1, -1], [0, 0], [1, -1], [2, 0], [1, 0], [0, 0], [-1, 0]], t),
      ears: t % 2,
    }),
  },
  treat: {
    ticks: 16,
    at: t =>
      t < 10
        ? { paws: 'hold', treat: Math.floor(t / 3), mouth: t % 3 === 1 ? 'chomp' : 'open', eyes: t < 2 ? 'shiny' : 'happy', hideHand: true, body: [0, t % 3 === 1 ? 1 : 0] }
        : { eyes: 'shiny', blush: true, mouth: 'w', particles: 'hearts', bubble: 'heart' },
  },
  hello: { ticks: 8, at: t => ({ paws: t % 4 < 2 ? 'waveHi' : 'waveLo', eyes: 'shiny', mouth: 'open', blush: true }) },
  buy: { ticks: 8, at: t => ({ eyes: 'shiny', mouth: 'open', particles: 'stars', body: [0, t % 2 === 0 ? -1 : 0], blush: true }) },

  // Small idle actions every pal does.
  lookAround: { ticks: 10, at: t => ({ gaze: pick<[number, number]>([[-1, 0], [-1, 0], [-1, 0], [1, 0], [1, 0], [1, 0], [0, -1], [0, -1], [0, 0], [0, 0]], t) }) },
  stretch: {
    ticks: 10,
    at: t => (t < 6 ? { paws: 'stretch', mouth: t >= 2 ? 'yawn' : undefined, eyes: t >= 2 ? 'closed' : 'open' } : { eyes: 'happy' }),
  },
  yawn: { ticks: 8, at: t => (t < 5 ? { mouth: 'yawn', eyes: 'sleepy' } : { eyes: t === 5 ? 'blink' : 'open' }) },
  earWiggle: { ticks: 8, at: t => ({ ears: pick([1, 0, 1, 0, 1, 0, 0, 0], t), eyes: 'happy' }) },
  hum: {
    ticks: 12,
    at: t => ({ eyes: 'closed', bubble: 'note', particles: t >= 4 ? 'notes' : undefined, body: [Math.floor(t / 3) % 2 === 0 ? 0 : 1, 0], mouth: 'smile' }),
  },

  // Tricks (characters/index.ts says who learns which, at which level).
  wave,
  hop,
  spin: {
    ticks: 12,
    at: t => ({
      gaze: pick<[number, number]>([[-1, 0], [0, -1], [1, 0], [0, 1]], t),
      hatDx: pick([-1, 0, 1, 0], t),
      body: [0, t % 2 === 0 ? -1 : 0],
      eyes: t >= 10 ? 'happy' : 'open',
      mouth: 'o',
    }),
  },
  hatToss: {
    ticks: 14,
    at: t => ({
      hat: pick([0, 3, 6, 9, 11, 11, 9, 6, 3, 0, 0, 0, 0, 0], t),
      gaze: t < 9 ? [0, -1] : [0, 0],
      paws: t < 3 ? 'cheer' : t >= 10 ? 'cheer' : 'up',
      eyes: t >= 10 ? 'star' : 'wide',
      mouth: 'open',
    }),
  },
  salute: { ticks: 10, at: t => ({ paws: 'waveHi', brows: 'determined', mouth: 'smile', bubble: t >= 4 ? 'star' : undefined }) },
  peekaboo: peekaboo(false),
  hatPeekaboo: peekaboo(true),
  heartBurst: { ticks: 12, at: () => ({ eyes: 'heart', blush: true, mouth: 'w', particles: 'hearts', bubble: 'heart' }) },
  starDance: twoStep(false, { particles: 'stars' }),
  cartwheel: tumble,
  fireworks: {
    ticks: 16,
    at: t => ({ paws: t % 4 < 2 ? 'cheer' : 'up', eyes: 'star', mouth: 'open', blush: true, particles: 'confetti', bubble: 'star', body: [0, pick([0, -2, -1, 0], t)] }),
  },
  nod: {
    ticks: 12,
    at: t => ({
      body: [t % 4 < 2 ? -1 : 1, t % 2 === 1 ? 2 : 0],
      hat: t % 2 === 1 ? 1 : 0,
      paws: t % 2 === 0 ? 'tapL' : 'tapR',
      eyes: 'closed',
      mouth: t % 2 === 1 ? 'open' : 'smile',
      bubble: 'note',
      particles: 'notes',
      blush: true,
    }),
  },
  hatTip: {
    ticks: 10,
    at: t => ({ hat: pick([0, 1, 2, 3, 3, 2, 1, 0, 0, 0], t), eyes: t >= 2 && t <= 7 ? 'happy' : 'open', body: [0, t >= 2 && t <= 7 ? 1 : 0], mouth: 'smile' }),
  },
  strum: { ticks: 12, at: t => ({ paws: t % 2 === 0 ? 'tapR' : 'rest', bubble: 'note', eyes: 'closed', particles: 'notes', mouth: 'smile' }) },
  sip: {
    ticks: 12,
    at: t => (t < 7 ? { paws: 'hold', mouth: 'o', eyes: 'closed', hideHand: true } : { eyes: 'happy', mouth: 'w', blush: true, bubble: 'heart' }),
  },
  twoStep: twoStep(true),
  tumble,
  campfireSong: {
    ticks: 16,
    at: t => ({ eyes: t % 8 < 4 ? 'closed' : 'happy', particles: t % 8 < 4 ? 'notes' : 'stars', bubble: 'note', mouth: 'open', body: [0, t % 4 === 0 ? -1 : 0], blush: true }),
  },
  water: {
    ticks: 12,
    at: t => (t < 8 ? { paws: 'hold', mouth: 'smile', eyes: t < 4 ? 'wide' : 'happy', hideHand: true } : { eyes: 'happy', blush: true, bubble: 'heart' }),
  },
  bloom: {
    ticks: 12,
    at: t => ({ eyes: t < 4 ? 'closed' : 'happy', blush: true, mouth: 'w', particles: 'hearts', body: [0, t % 4 === 0 ? -1 : 0] }),
  },
}

export const DANCES = ['dance1', 'dance2', 'dance3'] as const

// ── Idle: base pose plus an action now and then ─────────────────────────────

// Ticks between idle actions: LOCKI fidgets more, CAPPL and NUMO are slower and steadier.
const IDLE_GAP: Readonly<Record<CharacterId, number>> = { locki: 40, cappl: 64, numo: 72 }
// What every pal does from the start; learned tricks join these as levels go up.
const IDLE_ACTIONS: readonly string[] = ['lookAround', 'stretch', 'yawn', 'earWiggle']

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0
  x ^= x >>> 15
  return x
}

// The idle action for one stretch of `gap` ticks, from the basics and learned tricks.
export function idleAction(learned: readonly string[], slot: number): string | undefined {
  const pool = [...IDLE_ACTIONS, ...learned]
  // Every third slot stays plain, so the pal also just sits.
  if (hash(slot) % 3 === 0) return undefined
  return pool[hash(slot + 7) % pool.length]
}

export type Moment = {
  character: CharacterId
  activity: Activity
  // The act playing and how many ticks into it.
  act?: { name: string; t: number }
  tick: number
  learned: readonly string[]
  // After a treat: blushing, and idle actions twice as often.
  isGlowing?: boolean
}

export function lookAt(moment: Moment): Look {
  const { character: who, activity, act, tick } = moment
  const playing = act === undefined ? undefined : ACTS[act.name]
  if (playing !== undefined && act !== undefined && act.t >= 0 && act.t < playing.ticks) return playing.at(act.t, who)
  if (activity !== 'idle') return ACTIVITY[activity](tick, who)
  const gap = idleGap(who, moment.isGlowing === true)
  const offset = tick % gap
  const name = idleAction(moment.learned, Math.floor(tick / gap))
  const action = name === undefined ? undefined : ACTS[name]
  if (action !== undefined && offset >= gap - action.ticks) return action.at(offset - (gap - action.ticks), who)
  const base = ACTIVITY.idle(tick, who)

  return moment.isGlowing === true ? { ...base, blush: true } : base
}

export function actTicks(name: string): number {
  return ACTS[name]?.ticks ?? 0
}

// Ticks between idle actions; a glowing pal (after a treat) shows off twice as often.
export function idleGap(who: CharacterId, isGlowing = false): number {
  return IDLE_GAP[who] / (isGlowing ? 2 : 1)
}

// The first idle stretch at or after `slot` that has an action, so a desktop loop
// (one stretch long) always shows the pal doing something.
export function busySlot(learned: readonly string[], slot: number): number {
  for (let s = slot; s < slot + 6; s += 1) if (idleAction(learned, s) !== undefined) return s
  return slot
}

// How many ticks a desktop loop of this moment needs: an act once, one idle
// stretch, or an activity's cycle.
export function loopTicks(moment: Moment): number {
  if (moment.act !== undefined) return actTicks(moment.act.name)
  if (moment.activity === 'idle') return idleGap(moment.character, moment.isGlowing === true)
  return 16
}
