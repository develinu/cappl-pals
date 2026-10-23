import { expect, test } from 'claude-code/testing'

import { CHARACTERS } from '../hooks/characters'
import { ITEM_ART } from '../hooks/characters/art'
import { WORDS, languageOf } from '../hooks/i18n'
import {
  FRESH_WORK,
  MAX_LEVEL,
  RANK_LEVELS,
  buy,
  commitOutcome,
  credit,
  dayOf,
  emptyLedger,
  emptyWallet,
  fameFor,
  isBreakOver,
  levelOf,
  mergeOutcome,
  needFor,
  observe,
  rankOf,
  readWallet,
  testOutcome,
  valueOf,
  wear,
  wornBy,
  type Signal,
  type Work,
} from '../hooks/rules'
import { encode, frame } from '../hooks/sprite'

test('a test run is judged by its summary line, not its exit code', async () => {
  expect(testOutcome('pytest -q', '12 passed in 0.31s', false)).toBe(true)
  // A pipe turns the exit code into 0; the failure summary still counts.
  expect(testOutcome('pytest -q 2>&1 | tail -3', '3 failed, 9 passed in 1.2s', false)).toBe(false)
  expect(testOutcome('npx vitest run', ' Tests  1 failed | 8 passed (9)', false)).toBe(false)
  expect(testOutcome('npm test', 'Tests:       10 passed, 10 total', false)).toBe(true)
  expect(testOutcome('go test ./...', 'ok  \texample.com/api\t0.12s', false)).toBe(true)
  expect(testOutcome('go test ./...', '--- FAIL: TestSum (0.00s)\nFAIL', true)).toBe(false)
  expect(testOutcome('bun test', ' 7 pass\n 0 fail\nRan 7 tests', false)).toBe(true)
  expect(testOutcome('flutter test', '00:04 +3 -1: Some tests failed.', false)).toBe(false)
  expect(testOutcome('npm test', 'ℹ tests 3\nℹ pass 3\nℹ fail 0', false)).toBe(true)
  expect(testOutcome('npm test', '# tests 3\n# pass 2\n# fail 1', false)).toBe(false)
  // No summary is no pass; an error exit is a failure.
  expect(testOutcome('npm test', 'done', false)).toBe(undefined)
  expect(testOutcome('npm test', 'error TS2304: Cannot find name', true)).toBe(false)
  expect(testOutcome('ls tests/', '12 passed', false)).toBe(undefined)
})

test('commits and merges', async () => {
  expect(commitOutcome('git add . && git commit -q -m "fix"', '', false)).toBe(true)
  expect(commitOutcome('git commit -m x', 'nothing to commit, working tree clean', false)).toBe(false)
  expect(commitOutcome('git commit -m x', '', true)).toBe(false)
  expect(commitOutcome('git commit --dry-run', '', false)).toBe(false)
  expect(commitOutcome('git commit --allow-empty -m ping', '', false)).toBe(false)
  expect(commitOutcome('git commit --amend --no-edit', '', false)).toBe(false)
  expect(mergeOutcome('gh pr merge 12 --squash', '✓ Squashed and merged pull request #12', false)).toBe(true)
  expect(mergeOutcome('gh pr merge 12 --auto', 'will be automatically merged when checks pass', false)).toBe(false)
})

function run(signals: Signal[]) {
  let work: Work = FRESH_WORK
  const kinds: string[] = []
  for (const signal of signals) {
    const result = observe(work, signal)
    work = result.work
    for (const earn of result.earned) kinds.push(`${earn.kind}${earn.isVerified ? '+tested' : ''}${earn.isSmall ? '+small' : ''}`)
  }

  return kinds
}

test('only the first pass after edits pays; fail → fix → pass is a comeback; reruns pay nothing', async () => {
  const edit = { type: 'edit' } as const
  const pass = { type: 'test', isPass: true } as const
  const fail = { type: 'test', isPass: false } as const
  expect(run([pass])).toEqual([])
  expect(run([edit, pass, pass, pass])).toEqual(['verify'])
  expect(run([edit, fail, edit, pass])).toEqual(['verify', 'comeback'])
  // A flaky test that passes on a rerun without a fix is no comeback.
  expect(run([fail, pass])).toEqual([])
  expect(run([edit, pass, { type: 'commit' }, { type: 'commit' }])).toEqual(['verify', 'commit+tested+small', 'commit'])
  expect(run([...Array(9).fill(edit), { type: 'commit' }])).toEqual(['commit'])
  expect(run([{ type: 'plan' }, edit, { type: 'plan' }])).toEqual(['plan'])
})

test('many of one kind in a day taper off, capped kinds stop', async () => {
  expect(valueOf({ kind: 'verify' }, 0)).toEqual({ fame: 5, dust: 3, rate: 1 })
  expect(valueOf({ kind: 'verify' }, 12)).toEqual({ fame: 3, dust: 2, rate: 0.5 })
  expect(valueOf({ kind: 'verify' }, 24)).toEqual({ fame: 1, dust: 1, rate: 0.2 })
  expect(valueOf({ kind: 'commit', isVerified: true, isSmall: true }, 0)).toEqual({ fame: 10, dust: 5, rate: 1 })
  expect(valueOf({ kind: 'daily' }, 1).rate).toBe(0)
  expect(valueOf({ kind: 'break' }, 4).rate).toBe(0)
})

test('a day starts at 05:00 on the local clock', async () => {
  // Seoul (UTC+9): 04:59 on the 24th is still the 23rd.
  expect(dayOf(Date.UTC(2026, 9, 23, 19, 59), 540)).toBe('2026-10-23')
  expect(dayOf(Date.UTC(2026, 9, 23, 20, 0), 540)).toBe('2026-10-24')
  // New York in October (UTC-4).
  expect(dayOf(Date.UTC(2026, 9, 24, 8, 59), -240)).toBe('2026-10-23')
  expect(dayOf(Date.UTC(2026, 9, 24, 9, 0), -240)).toBe('2026-10-24')
})

test('a break pays after an hour of work and 20 minutes to 4 hours away', async () => {
  const hour = 60 * 60_000
  expect(isBreakOver(2 * hour, 0, 2 * hour + 30 * 60_000)).toBe(true)
  expect(isBreakOver(2 * hour, 0, 2 * hour + 10 * 60_000)).toBe(false)
  expect(isBreakOver(2 * hour, 1.5 * hour, 2 * hour + 30 * 60_000)).toBe(false)
  expect(isBreakOver(2 * hour, 0, 7 * hour)).toBe(false)
})

test('a ledger keeps only today and yesterday', async () => {
  let ledger = credit(emptyLedger(), 'verify', '2026-10-21', 5, 3)
  ledger = credit(ledger, 'verify', '2026-10-22', 5, 3)
  ledger = credit(ledger, 'commit', '2026-10-23', 3, 2)
  expect(Object.keys(ledger.days).sort()).toEqual(['2026-10-22', '2026-10-23'])
  expect(ledger.fame).toBe(13)
})

test('level curve: Lv2 at 30 rep, Lv50 at about 26 thousand; a rank every five levels', async () => {
  expect(needFor(1)).toBe(30)
  expect(levelOf(29).level).toBe(1)
  expect(levelOf(30)).toEqual({ level: 2, into: 0, need: needFor(2) })
  expect(fameFor(MAX_LEVEL)).toBeGreaterThan(25_000)
  expect(fameFor(MAX_LEVEL)).toBeLessThan(27_000)
  expect(levelOf(10_000_000)).toEqual({ level: MAX_LEVEL, into: 0, need: 0 })
  expect(rankOf(1)).toBe(0)
  expect(rankOf(4)).toBe(0)
  expect(rankOf(5)).toBe(1)
  expect(rankOf(50)).toBe(RANK_LEVELS.length - 1)
})

test('shop: level and gold gate a purchase; one item per slot per character', async () => {
  const rich = { fame: 0, dust: 100_000 }
  expect(buy(emptyWallet(), { fame: 0, dust: 10 }, 1, 'locki/aviators')).toBe(undefined)
  expect(buy(emptyWallet(), rich, 2, 'locki/feather')).toBe(undefined)
  expect(buy(emptyWallet(), rich, 50, 'locki/no-such-thing')).toBe(undefined)
  const one = buy(emptyWallet(), rich, 10, 'locki/aviators')!
  expect(one.spent).toBe(50)
  expect(one.equipped).toEqual(['locki/aviators'])
  const two = buy(one, rich, 10, 'locki/heart-shades')!
  expect(two.equipped).toEqual(['locki/heart-shades'])
  expect(wear(two, 'locki/aviators').equipped).toEqual(['locki/aviators'])
  // CAPPL's eyes slot is CAPPL's own: LOCKI keeps the heart shades on.
  const three = buy(two, rich, 10, 'cappl/round-specs')!
  expect(three.equipped).toEqual(['locki/heart-shades', 'cappl/round-specs'])
  expect(wornBy(three, 'locki')).toEqual(['heart-shades'])
  expect(wornBy(three, 'cappl')).toEqual(['round-specs'])
  // Unknown ids from an old or edited store are dropped.
  expect(readWallet({ spent: 5, owned: ['shades', 'locki/lasso'], equipped: ['x/y'] })).toEqual({
    spent: 5,
    owned: ['locki/lasso'],
    equipped: [],
  })
})

test('wardrobes: ten items each, rising in level and price, both together near the 1,000-hour economy', async () => {
  let total = 0
  for (const character of CHARACTERS) {
    expect(character.items.length).toBe(10)
    for (let i = 1; i < character.items.length; i += 1) {
      expect(character.items[i]!.level).toBeGreaterThan(character.items[i - 1]!.level)
      expect(character.items[i]!.price).toBeGreaterThan(character.items[i - 1]!.price)
    }
    total += character.items.reduce((sum, item) => sum + item.price, 0)
    // Every item has art at both sizes.
    for (const item of character.items) {
      expect(ITEM_ART[character.id]?.[item.id]?.[32]).toBeDefined()
      expect(ITEM_ART[character.id]?.[item.id]?.[16]).toBeDefined()
    }
  }
  expect(total).toBeGreaterThan(17_000)
  expect(total).toBeLessThan(21_000)
})

test('sprites: 32 px is 32 × 14 cells, 16 px is 16 × 7; working taps the paws; every item shows', async () => {
  for (const character of CHARACTERS) {
    const big = encode(frame({ character: character.id, mood: 'idle', tick: 0, equipped: [], size: 32 }))
    expect([big.columns, big.rows]).toEqual([32, 14])
    const small = encode(frame({ character: character.id, mood: 'idle', tick: 0, equipped: [], size: 16 }))
    expect([small.columns, small.rows]).toEqual([16, 7])
    const work = [0, 1, 2].map(tick => frame({ character: character.id, mood: 'working', tick, equipped: [], size: 32 }).join(''))
    expect(new Set(work).size).toBeGreaterThan(1)
    const happy = frame({ character: character.id, mood: 'happy', tick: 1, equipped: [], size: 32 }).join('')
    expect(happy).not.toBe(frame({ character: character.id, mood: 'idle', tick: 1, equipped: [], size: 32 }).join(''))
    for (const size of [32, 16] as const) {
      const plain = frame({ character: character.id, mood: 'idle', tick: 0, equipped: [], size }).join('')
      for (const item of character.items) {
        const worn = frame({ character: character.id, mood: 'idle', tick: 0, equipped: [item.id], size }).join('')
        expect([item.id, size, worn === plain]).toEqual([item.id, size, false])
      }
    }
  }
})

test('sparkles stay visible over a full background', async () => {
  const plain = frame({ character: 'cappl', mood: 'idle', tick: 0, equipped: ['starry-night'], size: 32 }).join('')
  const sparkling = frame({ character: 'cappl', mood: 'idle', tick: 0, equipped: ['starry-night'], size: 32, fx: 'level' }).join('')
  expect(sparkling).not.toBe(plain)
})

test('both languages have every word, and auto follows the Claude Code language setting', async () => {
  expect(WORDS.en.ranks.length).toBe(RANK_LEVELS.length)
  expect(WORDS.ko.ranks.length).toBe(RANK_LEVELS.length)
  expect(Object.keys(WORDS.ko).sort()).toEqual(Object.keys(WORDS.en).sort())
  expect(languageOf('auto', 'Korean')).toBe('ko')
  expect(languageOf('auto', '한국어')).toBe('ko')
  expect(languageOf('auto', 'English')).toBe('en')
  expect(languageOf('auto', undefined)).toBe('en')
  expect(languageOf('en', 'Korean')).toBe('en')
  expect(languageOf('ko', undefined)).toBe('ko')
})
