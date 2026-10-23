// Replays real Claude Code history (the output of extract_events.py) through the
// mod's own reward rules and measures rep and gold per active hour and the hours to
// each rank, and gold from results, level chests, lucky nuggets and bounties (the
// pal's own bounty, petting or a treat, is counted as done each day).
// Usage: bun tools/sim.ts .data/events.jsonl [--json out.json] [--offset 540]
import { readFileSync, writeFileSync } from 'node:fs'

import type { Ledger, RewardKind } from '../mod/types'
import { CHARACTERS } from '../mod/hooks/characters'
import { WORDS } from '../mod/hooks/i18n'
import {
  BOUNTY_BONUS,
  FRESH_WORK,
  MAX_LEVEL,
  RANK_LEVELS,
  RULES,
  checkOutcome,
  chestsBetween,
  commitOutcome,
  countToday,
  credit,
  dayOf as dayAt,
  emptyLedger,
  fameFor,
  isBreakOver,
  levelOf,
  luckyNugget,
  mergeOutcome,
  observe,
  prOutcome,
  questsOf,
  readBounty,
  seedOf,
  settleBounty,
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
const detection = { testPass: 0, testFail: 0, testUnknown: 0, exitZeroButFailed: 0, checkPass: 0, checkFail: 0, commits: 0, prs: 0, merges: 0 }
const bounties = new Map<string, ReturnType<typeof readBounty>>()

function pay(kind: RewardKind, day: string, fame: number, dust: number, rate = 1) {
  ledger = credit(ledger, kind, day, fame, dust)
  const row = (counts[kind] ??= { n: 0, fame: 0, dust: 0, diminished: 0 })
  row.n += 1
  row.fame += fame
  row.dust += dust
  if (rate < 1) row.diminished += 1
  const today = byDay.get(day) ?? { fame: 0, dust: 0 }
  byDay.set(day, { fame: today.fame + fame, dust: today.dust + dust })
}

function grant(kind: RewardKind, at: number, session: string, extra: { isSmall?: boolean; isVerified?: boolean } = {}) {
  const day = dayOf(at)
  const n = countToday([ledger], kind, day)
  const value = valueOf({ kind, ...extra }, n)
  if (value.rate === 0) return
  const before = levelOf(ledger.fame).level
  pay(kind, day, value.fame, value.dust, value.rate)
  const nugget = kind === 'daily' ? 0 : luckyNugget(seedOf(`${session}:${at}:${n}`))
  if (nugget > 0) pay('lucky', day, 0, nugget)
  const after = levelOf(ledger.fame).level
  if (after > before) pay('chest', day, 0, chestsBetween(before, after))
  // The day's bounties; the pal's own is taken as done.
  const quests = questsOf(day)
  const settled = settleBounty(quests, count => (count === quests[0]!.count ? quests[0]!.target : countToday([ledger], count as RewardKind, day)), bounties.get(day) ?? readBounty(undefined))
  bounties.set(day, settled.bounty)
  for (const quest of settled.finished) pay('quest', day, 0, quest.gold)
  if (settled.isBonus) pay('quest', day, 0, BOUNTY_BONUS)
}

for (const event of events) {
  const day = dayOf(event.t)
  if (event.k === 'prompt') {
    if (!seenDays.has(day)) {
      seenDays.add(day)
      grant('daily', event.t, event.s)
    }
    if (isBreakOver(presence.lastAt, presence.activeSince, event.t)) grant('break', event.t, event.s)
    presence = touch(presence, event.t)
    continue
  }
  // Agents end turns without a person; only a person's prompts count as presence.
  if (event.k === 'turn') continue
  // The same order as the mod: a test or check, then a commit, a new PR, a merge.
  const signals: Signal[] = []
  if (event.k === 'edit_ok') signals.push({ type: 'edit' })
  if (event.k === 'plan_ok') signals.push({ type: 'plan' })
  if (event.k === 'bash') {
    const command = event.cmd ?? ''
    const output = event.out ?? ''
    const isError = event.err === true
    const isPass = testOutcome(command, output, isError)
    if (isPass === true) detection.testPass += 1
    if (isPass === false) {
      detection.testFail += 1
      if (!isError) detection.exitZeroButFailed += 1
    }
    if (isPass === undefined && /test/.test(command)) detection.testUnknown += 1
    if (isPass !== undefined) signals.push({ type: 'test', isPass })
    const isClean = isPass === undefined ? checkOutcome(command, output, isError) : undefined
    if (isClean === true) detection.checkPass += 1
    if (isClean === false) detection.checkFail += 1
    if (isClean !== undefined) signals.push({ type: 'check', isPass: isClean })
    if (commitOutcome(command, output, isError)) {
      detection.commits += 1
      signals.push({ type: 'commit' })
    }
    if (prOutcome(command, output, isError)) {
      detection.prs += 1
      signals.push({ type: 'pr' })
    }
    if (mergeOutcome(command, output, isError)) {
      detection.merges += 1
      signals.push({ type: 'merge' })
    }
  }
  for (const signal of signals) {
    const result = observe(works.get(event.s) ?? FRESH_WORK, signal)
    works.set(event.s, result.work)
    for (const earn of result.earned) grant(earn.kind, event.t, event.s, earn)
  }
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
