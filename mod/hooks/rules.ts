import type { CharacterId, DayCounts, Ledger, RewardKind, Totals, Wallet } from '../types'
import { CHARACTERS, itemOf } from './characters'

// ── Reward table ───────────────────────────────────────────────────────────
// Principle (docs/reward-design.md): pay for results a person can check, not for
// how much Claude did. Prompts, turns, tool calls, tokens and lines earn nothing.
// After `full` of one kind in a day a reward is worth half, after twice that a
// fifth; a kind with `cap` stops there.

type Rule = { fame: number; dust: number; full: number; cap?: number }

export const RULES: Record<RewardKind, Rule> = {
  verify: { fame: 5, dust: 3, full: 12 },
  comeback: { fame: 8, dust: 5, full: 5 },
  commit: { fame: 3, dust: 2, full: 10 },
  merge: { fame: 15, dust: 10, full: 4 },
  plan: { fame: 3, dust: 2, full: 5 },
  break: { fame: 2, dust: 4, full: 4, cap: 4 },
  daily: { fame: 0, dust: 10, full: 1, cap: 1 },
}

// Commit bonus: more for a change tested since the last commit, and for a small one.
// Agents mostly commit with `git commit -q`, which prints no line counts, so the
// size is guessed from the number of file edits since the last commit.
export const COMMIT_VERIFIED = { fame: 5, dust: 3 }
export const COMMIT_SMALL = { fame: 2, dust: 0 }
export const SMALL_COMMIT_EDITS = 8

// A day starts at 05:00 on this computer's clock, so a late night counts as the day before.
export const DAY_STARTS_AT_HOUR = 5

// A break: back after 20 minutes to 4 hours away, having worked over an hour straight.
export const BREAK_AFTER_WORK_MS = 60 * 60_000
export const BREAK_MIN_GAP_MS = 20 * 60_000
export const BREAK_MAX_GAP_MS = 4 * 60 * 60_000
export const CONTINUOUS_GAP_MS = 15 * 60_000

// `offsetMinutes` is the local clock's distance from UTC (+540 in Seoul).
export function dayOf(now: number, offsetMinutes: number): string {
  const shifted = now + (offsetMinutes - DAY_STARTS_AT_HOUR * 60) * 60_000

  return new Date(shifted).toISOString().slice(0, 10)
}

export function rateOf(kind: RewardKind, countToday: number): number {
  const rule = RULES[kind]
  if (rule.cap !== undefined && countToday >= rule.cap) return 0
  if (countToday < rule.full) return 1
  if (countToday < rule.full * 2) return 0.5

  return 0.2
}

export type Earn = { kind: RewardKind; isSmall?: boolean; isVerified?: boolean }

export function valueOf(earn: Earn, countToday: number): { fame: number; dust: number; rate: number } {
  const rule = RULES[earn.kind]
  let fame = rule.fame
  let dust = rule.dust
  if (earn.kind === 'commit') {
    if (earn.isVerified === true) {
      fame += COMMIT_VERIFIED.fame
      dust += COMMIT_VERIFIED.dust
    }
    if (earn.isSmall === true) {
      fame += COMMIT_SMALL.fame
      dust += COMMIT_SMALL.dust
    }
  }
  const rate = rateOf(earn.kind, countToday)
  const scaled = (n: number) => (n === 0 || rate === 0 ? 0 : Math.max(1, Math.round(n * rate)))

  return { fame: scaled(fame), dust: scaled(dust), rate }
}

// ── Reading Bash results ──────────────────────────────────────────────────
// The exit code is not trusted: agents pipe test runs (`pytest | tail -5`), which
// turns a failure into 0 (about a third of test commands in a month of logs).
// The runner's summary line decides instead.

const TEST_COMMAND =
  /\b(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test(?::\S+)?|bun\s+(?:run\s+)?test|npx\s+(?:vitest|jest)|vitest|jest|pytest|py\.test|go\s+test|cargo\s+(?:test|nextest)|make\s+test|mvn\s+(?:\S+\s+)*test|gradlew?\s+(?:\S+\s+)*test|dotnet\s+test|rspec|phpunit|flutter\s+test|dart\s+test|php\s+artisan\s+test|deno\s+test|claude\s+plugin\s+test)\b/
// node --test prints the count after the word: `ℹ pass 3`, `# fail 1`.
const FAIL_COUNT = /(\d+)\s+(?:failed|failing|failures?|errors?|fail)\b|^[#ℹ]\s*fail\s+(\d+)/gim
const PASS_COUNT = /(\d+)\s+(?:passed|passing|pass)\b|(\d+)\s+examples?,\s+0\s+failures|OK\s+\((\d+)\s+tests?|^[#ℹ]\s*pass\s+(\d+)/gim
const FAIL_MARK = /Some tests failed|FAILURES!|^FAIL\b|^--- FAIL|test result: FAILED|^FAILED\b|Tests? failed/m
const PASS_MARK = /All tests passed!|^ok\s+\S+|test result: ok\./m

export function testOutcome(command: string, output: string, isError: boolean): boolean | undefined {
  if (!TEST_COMMAND.test(command)) return undefined
  const failed = sum(output, FAIL_COUNT)
  const passed = sum(output, PASS_COUNT)
  if (failed > 0 || FAIL_MARK.test(output)) return false
  if (passed > 0 || PASS_MARK.test(output)) return true

  // No summary: an error exit still counts as a failure (a compile error); a pass needs a summary.
  return isError ? false : undefined
}

function sum(text: string, pattern: RegExp): number {
  let total = 0
  for (const match of text.matchAll(pattern)) {
    total += Number(match[1] ?? match[2] ?? match[3] ?? match[4] ?? 0)
  }

  return total
}

// Empty commits, --amend and dry runs are not new results.
const COMMIT_COMMAND = /\bgit\s+(?:-C\s+\S+\s+)?commit\b(?!.*(?:--dry-run|--allow-empty|--amend))/
const COMMIT_EMPTY = /nothing to commit|nothing added to commit|no changes added to commit/i

export function commitOutcome(command: string, output: string, isError: boolean): boolean {
  return !isError && COMMIT_COMMAND.test(command) && !COMMIT_EMPTY.test(output)
}

const MERGE_COMMAND = /\bgh\s+pr\s+merge\b/
export function mergeOutcome(command: string, output: string, isError: boolean): boolean {
  return (
    !isError &&
    MERGE_COMMAND.test(command) &&
    /merged/i.test(output) &&
    !/automatically|auto-merge|will be merged/i.test(output)
  )
}

// ── The work loop: edit → test → commit ────────────────────────────────────

export type Work = {
  isDirty: boolean
  isFailing: boolean
  isFixing: boolean
  isVerified: boolean
  edits: number
}
export const FRESH_WORK: Work = { isDirty: false, isFailing: false, isFixing: false, isVerified: false, edits: 0 }

export type Signal =
  | { type: 'edit' }
  | { type: 'test'; isPass: boolean }
  | { type: 'commit' }
  | { type: 'merge' }
  | { type: 'plan' }

export function observe(work: Work, signal: Signal): { work: Work; earned: Earn[] } {
  switch (signal.type) {
    case 'edit':
      return { work: { ...work, isDirty: true, isFixing: work.isFailing, edits: work.edits + 1 }, earned: [] }
    case 'test': {
      if (!signal.isPass) {
        return { work: { ...work, isFailing: true, isFixing: false }, earned: [] }
      }
      const earned: Earn[] = []
      if (work.isDirty) earned.push({ kind: 'verify' })
      if (work.isFailing && work.isFixing) earned.push({ kind: 'comeback' })

      return {
        work: {
          ...work,
          isDirty: false,
          isFailing: false,
          isFixing: false,
          isVerified: work.isVerified || work.isDirty,
        },
        earned,
      }
    }
    case 'commit':
      // Agents also write files through Bash, so a commit with no edits still earns the base;
      // only the small-commit bonus needs counted edits.
      return {
        work: { ...work, isVerified: false, edits: 0 },
        earned: [
          { kind: 'commit', isSmall: work.edits > 0 && work.edits <= SMALL_COMMIT_EDITS, isVerified: work.isVerified },
        ],
      }
    case 'merge':
      return { work, earned: [{ kind: 'merge' }] }
    case 'plan':
      return { work, earned: work.isDirty ? [] : [{ kind: 'plan' }] }
  }
}

// ── Breaks and the first prompt of the day ─────────────────────────────────

export function isBreakOver(lastAt: number, activeSince: number, now: number): boolean {
  const gap = now - lastAt

  return (
    lastAt > 0 &&
    gap >= BREAK_MIN_GAP_MS &&
    gap <= BREAK_MAX_GAP_MS &&
    lastAt - activeSince >= BREAK_AFTER_WORK_MS
  )
}

// Records activity; a gap over 15 minutes starts a new stretch of work.
export function touch(ledger: Ledger, now: number): Ledger {
  const isContinuous = now - ledger.lastAt <= CONTINUOUS_GAP_MS

  return { ...ledger, lastAt: now, activeSince: isContinuous ? ledger.activeSince : now }
}

// ── Ledgers ───────────────────────────────────────────────────────────────

export function emptyLedger(): Ledger {
  return { fame: 0, dust: 0, days: {}, lastAt: 0, activeSince: 0, recent: [] }
}

export function readLedger(raw: unknown): Ledger {
  if (typeof raw !== 'object' || raw === null) return emptyLedger()
  const value = raw as Partial<Ledger>

  return {
    fame: typeof value.fame === 'number' ? value.fame : 0,
    dust: typeof value.dust === 'number' ? value.dust : 0,
    days: typeof value.days === 'object' && value.days !== null ? value.days : {},
    lastAt: typeof value.lastAt === 'number' ? value.lastAt : 0,
    activeSince: typeof value.activeSince === 'number' ? value.activeSince : 0,
    recent: Array.isArray(value.recent) ? value.recent : [],
  }
}

// Keeps today's and yesterday's counts only (the daily taper reads today's).
export function credit(ledger: Ledger, kind: RewardKind, day: string, fame: number, dust: number): Ledger {
  const counts: DayCounts = ledger.days[day] ?? {}
  const kept = Object.fromEntries(Object.entries(ledger.days).filter(([key]) => key >= previousDay(day)))

  return {
    ...ledger,
    fame: ledger.fame + fame,
    dust: ledger.dust + dust,
    days: { ...kept, [day]: { ...counts, [kind]: (counts[kind] ?? 0) + 1 } },
  }
}

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

export function countToday(ledgers: readonly Ledger[], kind: RewardKind, day: string): number {
  return ledgers.reduce((total, ledger) => total + (ledger.days[day]?.[kind] ?? 0), 0)
}

export function totalsOf(ledgers: readonly Ledger[], wallet: Wallet): Totals {
  const fame = ledgers.reduce((total, ledger) => total + ledger.fame, 0)
  const dust = ledgers.reduce((total, ledger) => total + ledger.dust, 0)

  return { fame, dust: dust - wallet.spent }
}

// ── Growth: levels and ranks ───────────────────────────────────────────────
// Rep needed for the next level = round(LEVEL_BASE × level^LEVEL_POWER), up to 50.
// Tuned so a steady user reaches 50 in about 1,000 active hours (docs/reward-design.md).

export const MAX_LEVEL = 50
export const LEVEL_BASE = 30
export const LEVEL_POWER = 0.9

export function needFor(level: number): number {
  return Math.round(LEVEL_BASE * level ** LEVEL_POWER)
}

export function fameFor(level: number): number {
  let total = 0
  for (let l = 1; l < level; l += 1) total += needFor(l)

  return total
}

export function levelOf(fame: number): { level: number; into: number; need: number } {
  let level = 1
  let rest = fame
  while (level < MAX_LEVEL && rest >= needFor(level)) {
    rest -= needFor(level)
    level += 1
  }

  return level === MAX_LEVEL ? { level, into: 0, need: 0 } : { level, into: rest, need: needFor(level) }
}

// A new rank every five levels; the names are in i18n.ts (`ranks`).
export const RANK_LEVELS: readonly number[] = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

export function rankOf(level: number): number {
  let rank = 0
  RANK_LEVELS.forEach((from, index) => {
    if (level >= from) rank = index
  })

  return rank
}

// Fans are a decorative number that grows with rep (a taste of an idle game).
export function fansOf(fame: number): number {
  return Math.floor(fame * 3 + (fame / 40) ** 2)
}

// ── The shop ───────────────────────────────────────────────────────────────
// Each character has its own wardrobe (characters/index.ts); one item per slot.

export function emptyWallet(): Wallet {
  return { spent: 0, owned: [], equipped: [] }
}

export function readWallet(raw: unknown): Wallet {
  if (typeof raw !== 'object' || raw === null) return emptyWallet()
  const value = raw as Partial<Wallet>
  const ids = (list: unknown) => (Array.isArray(list) ? list.filter(id => typeof id === 'string' && itemOf(id) !== undefined) : [])

  return {
    spent: typeof value.spent === 'number' ? value.spent : 0,
    owned: ids(value.owned),
    equipped: ids(value.equipped),
  }
}

export function buy(wallet: Wallet, totals: Totals, level: number, id: string): Wallet | undefined {
  const found = itemOf(id)
  if (found === undefined || wallet.owned.includes(id) || level < found.item.level || totals.dust < found.item.price) {
    return undefined
  }

  return wear({ ...wallet, spent: wallet.spent + found.item.price, owned: [...wallet.owned, id] }, id)
}

// Puts an owned item on, or takes it off when it is on. Another item in the same
// slot of the same character comes off; the other character's items stay.
export function wear(wallet: Wallet, id: string): Wallet {
  const found = itemOf(id)
  if (found === undefined || !wallet.owned.includes(id)) return wallet
  if (wallet.equipped.includes(id)) {
    return { ...wallet, equipped: wallet.equipped.filter(one => one !== id) }
  }
  const kept = wallet.equipped.filter(one => {
    const other = itemOf(one)
    return other === undefined || other.character.id !== found.character.id || other.item.slot !== found.item.slot
  })

  return { ...wallet, equipped: [...kept, id] }
}

export function wornBy(wallet: Wallet, character: CharacterId): string[] {
  return wallet.equipped.filter(id => itemOf(id)?.character.id === character).map(id => id.split('/')[1]!)
}

export const SHOP_SIZE = CHARACTERS.reduce((total, one) => total + one.items.length, 0)
