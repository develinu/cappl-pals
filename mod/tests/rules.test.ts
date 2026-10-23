import { expect, test } from 'claude-code/testing'

import { ACTS, DANCES, busySlot, idleGap, lookAt, loopTicks, type Moment } from '../hooks/animations'
import { CHARACTERS, learnedTricks } from '../hooks/characters'
import { ITEM_ART } from '../hooks/characters/art'
import { WORDS, languageOf } from '../hooks/i18n'
import {
  FRESH_WORK,
  MAX_LEVEL,
  RANK_LEVELS,
  BOUNTY_BONUS,
  LUCKY_ODDS,
  buy,
  checkOutcome,
  chestFor,
  chestsBetween,
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
  luckyNugget,
  observe,
  prOutcome,
  questsOf,
  rankOf,
  readWallet,
  settleBounty,
  testOutcome,
  valueOf,
  wear,
  wornBy,
  type Signal,
  type Work,
} from '../hooks/rules'
import { animatedSvgOf, encode, frame } from '../hooks/sprite'

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

test('wardrobes: ten items and ten tricks each, rising in level, the shop sized to the economy', async () => {
  let total = 0
  for (const character of CHARACTERS) {
    expect(character.items.length).toBe(10)
    expect(character.tricks.length).toBe(10)
    for (let i = 1; i < character.items.length; i += 1) {
      expect(character.items[i]!.level).toBeGreaterThan(character.items[i - 1]!.level)
      expect(character.items[i]!.price).toBeGreaterThan(character.items[i - 1]!.price)
      expect(character.tricks[i]!.level).toBeGreaterThan(character.tricks[i - 1]!.level)
    }
    total += character.items.reduce((sum, item) => sum + item.price, 0)
    for (const item of character.items) {
      expect(ITEM_ART[character.id]?.[item.id]?.[32]).toBeDefined()
      expect(ITEM_ART[character.id]?.[item.id]?.[16]).toBeDefined()
    }
    for (const trick of character.tricks) expect([trick.act, ACTS[trick.act] !== undefined]).toEqual([trick.act, true])
    expect(learnedTricks(character, 1)).toEqual([])
    expect(learnedTricks(character, 50).length).toBe(10)
  }
  // Both wardrobes: about what level 50 pays in results, chests, bounties and nuggets.
  expect(total).toBeGreaterThan(22_000)
  expect(total).toBeLessThan(25_000)
})

const still = (character: 'locki' | 'cappl', size: 32 | 16, extra: Partial<Parameters<typeof frame>[0]> = {}) =>
  frame({ character, look: {}, tick: 0, equipped: [], size, ...extra }).join('')

test('sprites: 32 px is 32 × 14 cells, 16 px is 16 × 7; every item shows at both sizes', async () => {
  for (const character of CHARACTERS) {
    const big = encode(frame({ character: character.id, look: {}, tick: 0, equipped: [], size: 32 }))
    expect([big.columns, big.rows]).toEqual([32, 14])
    const small = encode(frame({ character: character.id, look: {}, tick: 0, equipped: [], size: 16 }))
    expect([small.columns, small.rows]).toEqual([16, 7])
    for (const size of [32, 16] as const) {
      const plain = still(character.id, size)
      for (const item of character.items) {
        expect([item.id, size, still(character.id, size, { equipped: [item.id] }) === plain]).toEqual([item.id, size, false])
      }
    }
  }
})

test('every expression part, bubble, paw pose and particle changes the picture', async () => {
  for (const character of CHARACTERS) {
    for (const size of [32, 16] as const) {
      const plain = still(character.id, size)
      const looks = [
        { eyes: 'heart' }, { eyes: 'happy' }, { eyes: 'x' }, { eyes: 'wide' }, { eyes: 'star' }, { eyes: 'closed' }, { gaze: [1, 0] },
        { brows: 'worried' }, { mouth: 'open' }, { mouth: 'w' }, { mouth: 'yawn' }, { blush: true }, { sweat: true },
        { bubble: '!' }, { bubble: '?' }, { bubble: 'heart' }, { bubble: 'zzz' }, { paws: 'cheer' }, { paws: 'waveHi' },
        { paws: 'cover' }, { paws: 'hold', treat: 0 }, { paws: 'hold', treat: 2 }, { body: [0, -1] }, { hat: 3 }, { hat: -2 }, { particles: 'hearts' },
        { particles: 'confetti' },
      ] as const
      for (const look of looks) {
        const drawn = frame({ character: character.id, look, tick: 1, equipped: [], size }).join('')
        expect([character.id, size, JSON.stringify(look), drawn === plain]).toEqual([character.id, size, JSON.stringify(look), false])
      }
    }
  }
})

test('activities move: editing taps, testing sweats, sleeping snoozes, waiting waves', async () => {
  for (const character of CHARACTERS) {
    const at = (activity: Moment['activity'], tick: number) =>
      frame({ character: character.id, look: lookAt({ character: character.id, activity, tick, learned: [] }), tick, equipped: [], size: 32 }).join('')
    for (const activity of ['sleeping', 'thinking', 'reading', 'editing', 'running', 'testing', 'waiting'] as const) {
      const frames = new Set(Array.from({ length: 16 }, (_, t) => at(activity, t)))
      expect([activity, frames.size > 1]).toEqual([activity, true])
      expect([activity, at(activity, 1) !== at('idle', 1)]).toEqual([activity, true])
    }
  }
})

test('acts play for their length, then the activity takes over; idle pals act on their own', async () => {
  const base: Moment = { character: 'locki', activity: 'idle', tick: 0, learned: [] }
  expect(lookAt({ ...base, act: { name: 'pet', t: 2 } }).eyes).toBe('heart')
  expect(lookAt({ ...base, act: { name: 'pet', t: 99 } }).eyes).not.toBe('heart')
  expect(DANCES.every(name => ACTS[name] !== undefined)).toBe(true)
  // Somewhere in a few idle stretches, the pal does something other than sit.
  const plain = JSON.stringify(lookAt(base))
  const moves = Array.from({ length: idleGap('locki') * 4 }, (_, tick) => JSON.stringify(lookAt({ ...base, tick })))
  expect(moves.filter(look => look !== plain && !look.includes('blink')).length).toBeGreaterThan(5)
  // A learned trick turns up among the idle actions.
  const withTrick = Array.from({ length: 200 }, (_, slot) => slot).some(slot => {
    const tick = slot * idleGap('cappl') + idleGap('cappl') - 3
    return JSON.stringify(lookAt({ ...base, character: 'cappl', tick, learned: ['strum'] })).includes('note')
  })
  expect(withTrick).toBe(true)
  expect(busySlot([], 0)).toBeGreaterThanOrEqual(0)
  expect(loopTicks({ ...base, act: { name: 'treat', t: 0 } })).toBe(ACTS.treat!.ticks)
})

test('every act draws at both sizes for both pals', async () => {
  for (const character of CHARACTERS) {
    for (const [name, anim] of Object.entries(ACTS)) {
      for (const size of [32, 16] as const) {
        for (let t = 0; t < anim.ticks; t += 1) {
          const rows = frame({ character: character.id, look: anim.at(t, character.id), tick: t, equipped: [], size })
          expect([name, rows.length]).toEqual([name, size === 32 ? 28 : 14])
        }
      }
    }
  }
})

test('sparkles stay visible over a full background', async () => {
  expect(still('cappl', 32, { equipped: ['starry-night'], fx: 'level' })).not.toBe(still('cappl', 32, { equipped: ['starry-night'] }))
})

test('both languages have every word, and auto follows the Claude Code language setting', async () => {
  expect(WORDS.en.ranks.length).toBe(RANK_LEVELS.length)
  expect(WORDS.ko.ranks.length).toBe(RANK_LEVELS.length)
  expect(Object.keys(WORDS.ko).sort()).toEqual(Object.keys(WORDS.en).sort())
  expect(Object.keys(WORDS.ko.quests).sort()).toEqual(Object.keys(WORDS.en.quests).sort())
  expect(languageOf('auto', 'Korean')).toBe('ko')
  expect(languageOf('auto', '한국어')).toBe('ko')
  expect(languageOf('auto', 'English')).toBe('en')
  expect(languageOf('auto', undefined)).toBe('en')
  expect(languageOf('en', 'Korean')).toBe('en')
  expect(languageOf('ko', undefined)).toBe('ko')
})

test('animated SVGs stay under the element limit with the busiest wardrobe', async () => {
  for (const [character, equipped] of [
    ['locki', ['heart-shades', 'gold-star', 'lasso', 'sunset', 'galaxy-hat']],
    ['cappl', ['round-specs', 'bandana', 'golden-banjo', 'sparrow', 'starry-night', 'black-hat']],
  ] as const) {
    const learned = CHARACTERS.find(one => one.id === character)!.tricks.map(trick => trick.act)
    const moments: Moment[] = [
      ...(['idle', 'sleeping', 'editing', 'testing', 'waiting'] as const).map(activity => ({ character, activity, tick: 0, learned })),
      ...['bigCelebrate', 'treat', 'fireworks', 'campfireSong', 'petMore'].map(name => ({ character, activity: 'idle' as const, tick: 0, learned, act: { name, t: 0 } })),
    ]
    for (const moment of moments) {
      const frames = Array.from({ length: loopTicks(moment) }, (_, tick) =>
        frame({ character, look: lookAt({ ...moment, tick, ...(moment.act ? { act: { name: moment.act.name, t: tick } } : {}) }), tick, equipped, size: 32, fx: 'stage' }))
      const hover = Array.from({ length: 8 }, (_, t) => frame({ character, look: ACTS.hello!.at(t, character), tick: t, equipped, size: 32 }))
      const svg = animatedSvgOf(frames, 250, hover)
      expect([character, moment.activity, moment.act?.name, svg.length < 131_072]).toEqual([character, moment.activity, moment.act?.name, true])
    }
  }
})

test('type checks, lints and builds after edits are clean shots; gh pr create puts up a poster', async () => {
  expect(checkOutcome('npx tsc -p .', '', false)).toBe(true)
  expect(checkOutcome('npx tsc -p .', "src/a.ts(3,1): error TS2304: Cannot find name 'x'.", true)).toBe(false)
  expect(checkOutcome('ruff check .', 'All checks passed!', false)).toBe(true)
  expect(checkOutcome('npm run lint', '✖ 3 problems (3 errors, 0 warnings)', false)).toBe(false)
  expect(checkOutcome('cargo build', 'Finished dev [unoptimized] target(s)', false)).toBe(true)
  expect(checkOutcome('npm test', '3 passed', false)).toBe(undefined)
  expect(checkOutcome('ls', '', false)).toBe(undefined)
  expect(prOutcome('gh pr create --fill', 'https://github.com/o/r/pull/12', false)).toBe(true)
  expect(prOutcome('gh pr create --fill', 'a pull request for branch already exists', true)).toBe(false)
  // Only when the tool is what runs: installing, finding or asking its version is not a check.
  for (const command of ['npm install -D eslint', 'pip install mypy', 'which tsc', 'tsc --version', 'grep -rn "eslint-disable" src', 'git log --grep tsc']) {
    expect([command, checkOutcome(command, '', false)]).toEqual([command, undefined])
  }
  expect(checkOutcome('cd web && npm run build 2>&1 | tail -3', 'dist/error-boundary-4f2.js  1.2 kB', false)).toBe(true)
  expect(checkOutcome('./node_modules/.bin/tsc -p .', 'Found 2 errors in 1 file.', false)).toBe(false)
  // `|| gh pr view` after a failed create names the old PR: no new poster.
  expect(prOutcome('gh pr create --fill || gh pr view --json url', 'already exists:\nhttps://github.com/o/r/pull/12', false)).toBe(false)
  const edit = { type: 'edit' } as const
  const clean = { type: 'check', isPass: true } as const
  expect(run([edit, clean, clean])).toEqual(['check'])
  expect(run([clean])).toEqual([])
  expect(run([{ type: 'pr' }])).toEqual(['pr'])
})

test('chests grow with the level; nuggets turn up about one result in sixteen', async () => {
  expect(chestFor(2)).toBe(7)
  expect(chestsBetween(1, 3)).toBe(chestFor(2) + chestFor(3))
  expect(chestsBetween(1, 50)).toBeGreaterThan(1_400)
  const rolls = Array.from({ length: 16_000 }, (_, i) => luckyNugget(i * 7919))
  const hits = rolls.filter(n => n > 0)
  expect(hits.length).toBeGreaterThan(16_000 / LUCKY_ODDS / 1.5)
  expect(hits.length).toBeLessThan((16_000 / LUCKY_ODDS) * 1.5)
  expect(Math.min(...hits)).toBeGreaterThanOrEqual(5)
  expect(Math.max(...hits)).toBeLessThanOrEqual(15)
})

test('bounties: three a day, one with the pal; each pays once, all three pay a bonus', async () => {
  const quests = questsOf('2026-10-23')
  expect(quests.length).toBe(3)
  expect(['pet', 'treat', 'trick']).toContain(quests[0]!.count)
  expect(new Set(quests.map(quest => quest.id)).size).toBe(3)
  expect(questsOf('2026-10-23')).toEqual(quests)
  const days = new Set(Array.from({ length: 30 }, (_, i) => questsOf(`2026-11-${String(i + 1).padStart(2, '0')}`).map(q => q.id).join()))
  expect(days.size).toBeGreaterThan(10)
  const none = settleBounty(quests, () => 0, { done: [], bonus: false })
  expect(none.finished).toEqual([])
  const first = settleBounty(quests, kind => (kind === quests[0]!.count ? 99 : 0), { done: [], bonus: false })
  expect(first.finished.map(quest => quest.id)).toEqual([quests[0]!.id])
  expect(first.isBonus).toBe(false)
  const again = settleBounty(quests, kind => (kind === quests[0]!.count ? 99 : 0), first.bounty)
  expect(again.finished).toEqual([])
  const all = settleBounty(quests, () => 99, first.bounty)
  expect(all.finished.length).toBe(2)
  expect(all.isBonus).toBe(true)
  expect(settleBounty(quests, () => 99, all.bounty).isBonus).toBe(false)
  expect(BOUNTY_BONUS).toBe(15)
})
