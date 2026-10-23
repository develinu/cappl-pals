// Replays real Claude Code history (the output of extract_events.py) through the
// mod's own reward rules and measures rep and gold per active hour and the hours to
// each rank. Usage: bun tools/sim.ts .data/events.jsonl [--json out.json] [--offset 540]
import { readFileSync, writeFileSync } from 'node:fs'

import type { Ledger, RewardKind } from '../mod/types'
import { CHARACTERS } from '../mod/hooks/characters'
import { WORDS } from '../mod/hooks/i18n'
import {
  FRESH_WORK,
  MAX_LEVEL,
  RANK_LEVELS,
  RULES,
  commitOutcome,
  countToday,
  credit,
  dayOf as dayAt,
  emptyLedger,
  fameFor,
  isBreakOver,
  mergeOutcome,
  observe,
  testOutcome,
  touch,
  valueOf,
  type Signal,
  type Work,
} from '../mod/hooks/rules'

type Event = {
  t: number
  k: string
  s: string
  sub: boolean
  cmd?: string
  out?: string
  err?: boolean
}

const offsetArg = process.argv.indexOf('--offset')
const OFFSET = offsetArg > 0 ? Number(process.argv[offsetArg + 1]) : -new Date().getTimezoneOffset()
const dayOf = (at: number) => dayAt(at, OFFSET)

const events: Event[] = readFileSync(process.argv[2]!, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line))

// Active time: stretches of events with no gap over 10 minutes (one event counts a minute).
const ACTIVE_GAP = 10 * 60_000
const activeByDay = new Map<string, number>()
let spanStart = events[0]!.t
let spanEnd = events[0]!.t
const closeSpan = () => {
  const day = dayOf(spanStart)
  activeByDay.set(day, (activeByDay.get(day) ?? 0) + Math.max(60_000, spanEnd - spanStart))
}
for (const event of events) {
  if (event.t - spanEnd > ACTIVE_GAP) {
    closeSpan()
    spanStart = event.t
  }
  spanEnd = event.t
}
closeSpan()

// Replay: a work loop per session, daily counts across sessions, breaks from global activity.
const works = new Map<string, Work>()
let ledger: Ledger = emptyLedger()
let presence: Ledger = emptyLedger()
const seenDays = new Set<string>()
const byDay = new Map<string, { fame: number; dust: number }>()
const counts: Record<string, { n: number; fame: number; dust: number; diminished: number }> = {}
const detection = { testPass: 0, testFail: 0, testUnknown: 0, exitZeroButFailed: 0, commits: 0, merges: 0 }

function grant(kind: RewardKind, at: number, extra: { isSmall?: boolean; isVerified?: boolean } = {}) {
  const day = dayOf(at)
  const n = countToday([ledger], kind, day)
  const value = valueOf({ kind, ...extra }, n)
  if (value.rate === 0) return
  ledger = credit(ledger, kind, day, value.fame, value.dust)
  const row = (counts[kind] ??= { n: 0, fame: 0, dust: 0, diminished: 0 })
  row.n += 1
  row.fame += value.fame
  row.dust += value.dust
  if (value.rate < 1) row.diminished += 1
  const today = byDay.get(day) ?? { fame: 0, dust: 0 }
  byDay.set(day, { fame: today.fame + value.fame, dust: today.dust + value.dust })
}

for (const event of events) {
  const day = dayOf(event.t)
  if (event.k === 'prompt') {
    if (!seenDays.has(day)) {
      seenDays.add(day)
      grant('daily', event.t)
    }
    if (isBreakOver(presence.lastAt, presence.activeSince, event.t)) grant('break', event.t)
    presence = touch(presence, event.t)
    continue
  }
  // Agents end turns without a person; only a person's prompts count as presence.
  if (event.k === 'turn') continue
  let signal: Signal | undefined
  if (event.k === 'edit_ok') signal = { type: 'edit' }
  if (event.k === 'plan_ok') signal = { type: 'plan' }
  if (event.k === 'bash') {
    const command = event.cmd ?? ''
    const output = event.out ?? ''
    const isError = event.err === true
    if (commitOutcome(command, output, isError)) {
      detection.commits += 1
      signal = { type: 'commit' }
    } else if (mergeOutcome(command, output, isError)) {
      detection.merges += 1
      signal = { type: 'merge' }
    } else {
      const isPass = testOutcome(command, output, isError)
      if (isPass === true) detection.testPass += 1
      if (isPass === false) {
        detection.testFail += 1
        if (!isError) detection.exitZeroButFailed += 1
      }
      if (isPass === undefined && /test/.test(command)) detection.testUnknown += 1
      if (isPass !== undefined) signal = { type: 'test', isPass }
    }
  }
  if (signal === undefined) continue
  const result = observe(works.get(event.s) ?? FRESH_WORK, signal)
  works.set(event.s, result.work)
  for (const earn of result.earned) grant(earn.kind, event.t, earn)
}

const days = [...activeByDay.keys()].sort()
const activeHours = [...activeByDay.values()].reduce((a, b) => a + b, 0) / 3_600_000
const perDay = days
  .map(day => ({ day, hours: (activeByDay.get(day) ?? 0) / 3_600_000, ...(byDay.get(day) ?? { fame: 0, dust: 0 }) }))
  .filter(row => row.hours >= 0.25)
const rates = perDay.map(row => row.fame / row.hours).sort((a, b) => a - b)
const pct = (p: number) => rates[Math.min(rates.length - 1, Math.floor(p * rates.length))]!
const fameRate = ledger.fame / activeHours
const dustRate = ledger.dust / activeHours
const shopTotal = CHARACTERS.flatMap(one => one.items).reduce((total, item) => total + item.price, 0)

const milestones = RANK_LEVELS.map((level, index) => ({
  level,
  name: WORDS.en.ranks[index]!,
  fame: fameFor(level),
  hoursAtMean: fameFor(level) / fameRate,
  hoursAtMedianDay: fameFor(level) / pct(0.5),
}))

const report = {
  span: { from: days[0], to: days.at(-1), days: days.length, activeHours: Math.round(activeHours * 10) / 10 },
  detection,
  rewards: counts,
  perActiveHour: {
    fameMean: Math.round(fameRate * 10) / 10,
    dustMean: Math.round(dustRate * 10) / 10,
    fameDayP25: Math.round(pct(0.25) * 10) / 10,
    fameDayP50: Math.round(pct(0.5) * 10) / 10,
    fameDayP75: Math.round(pct(0.75) * 10) / 10,
  },
  activeHoursPerDay: {
    p50: Math.round(perDay.map(r => r.hours).sort((a, b) => a - b)[Math.floor(perDay.length / 2)]! * 10) / 10,
    mean: Math.round((activeHours / perDay.length) * 10) / 10,
  },
  maxLevelFame: fameFor(MAX_LEVEL),
  hoursToMaxAtMean: Math.round(fameFor(MAX_LEVEL) / fameRate),
  hoursToMaxAtMedianDay: Math.round(fameFor(MAX_LEVEL) / pct(0.5)),
  shopTotal,
  hoursToBuyAllAtMean: Math.round(shopTotal / dustRate),
  milestones: milestones.map(m => ({ ...m, hoursAtMean: Math.round(m.hoursAtMean), hoursAtMedianDay: Math.round(m.hoursAtMedianDay) })),
  rules: RULES,
}

const asJson = process.argv.indexOf('--json')
if (asJson > 0) writeFileSync(process.argv[asJson + 1]!, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
