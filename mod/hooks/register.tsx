import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CharacterId, Fx, FxKind, Language, Ledger, Mood, Reward, Totals, Wallet } from '../types'
import { CHARACTERS, characterOf, fullId, isCharacterId, type Character } from './characters'
import { WORDS, languageOf } from './i18n'
import {
  CONTINUOUS_GAP_MS,
  FRESH_WORK,
  RULES,
  SHOP_SIZE,
  buy,
  commitOutcome,
  countToday,
  credit,
  dayOf,
  emptyLedger,
  emptyWallet,
  fansOf,
  isBreakOver,
  levelOf,
  mergeOutcome,
  observe,
  rankOf,
  rateOf,
  readLedger,
  readWallet,
  testOutcome,
  totalsOf,
  touch,
  valueOf,
  wear,
  wornBy,
  type Earn,
  type Signal,
} from './rules'
import { SOUND_LEVELS, play, soundLevel, type Sfx, type SoundLevel } from './sound'
import { encode, frame, svgOf, type Size } from './sprite'

const PANE = 'howdy'
const SPRITE = 'sprite'
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const STALE_MS = 2 * 24 * 60 * 60_000
// The header (fx line, level, rep, gold) and the narrowest column it fits beside the
// small sprite (seven rows tall) even when its lines wrap.
const HEADER_ROWS = 4
const HEADER_COLUMNS = 16
// The big sprite (14 rows) only when the header and a few rows below it fit too.
const BIG_ROWS = 14 + HEADER_ROWS + 6
// The height asked for when /howdy opens the pane above the prompt (the terminal may give less).
const INLINE_ROWS = 24
// How often other sessions' rewards and purchases are read back; the store sends no change events.
const SYNC_MS = 1500
// Latest rewards kept per session ledger (the pane shows four, all sessions merged).
const RECENT = 8
const FX_MS: Record<FxKind, number> = { reward: 1200, comeback: 1600, merge: 2000, level: 2600, stage: 3200, buy: 1500 }
const FX_COLOR: Record<FxKind, string> = {
  reward: '#FCD34D', comeback: '#F472B6', merge: '#60A5FA', level: '#F59E0B', stage: '#F59E0B', buy: '#86EFAC',
}

const totalsAtom = atom({ plugin: 'howdy', key: 'totals' } as const, { fame: 0, dust: 0 })
const walletAtom = atom({ plugin: 'howdy', key: 'wallet' } as const, emptyWallet())
const logAtom = atom({ plugin: 'howdy', key: 'log' } as const, [])
const moodAtom = atom({ plugin: 'howdy', key: 'mood' } as const, 'idle')
const turnFameAtom = atom({ plugin: 'howdy', key: 'turnFame' } as const, 0)
const fxAtom = atom({ plugin: 'howdy', key: 'fx' } as const, null as Fx | null)
const characterAtom = atom({ plugin: 'howdy', key: 'character' } as const, null as CharacterId | null)
const pickingAtom = atom({ plugin: 'howdy', key: 'picking' } as const, false)

// Module variables start over on a hot reload: what the pane reads lives in $.state,
// what must last lives in $.store.
const runtime = {
  key: 'ledger:unknown',
  work: FRESH_WORK,
  size: 32 as Size,
  isDrawn: false,
  tick: 0,
  drawn: '',
  language: 'en' as Language,
  // Minutes east of UTC on this computer's clock.
  offset: 0,
  // The totals, wallet, log and character last published; unchanged ones are not redrawn.
  synced: '',
  isSyncing: false,
  // Serializes this session's writes. Sessions never share a key, so they need no lock.
  queue: Promise.resolve() as Promise<unknown>,
}

const words = () => WORDS[runtime.language]

type World = { own: Ledger; ledgers: Ledger[]; archive: Totals; wallet: Wallet; character: CharacterId | null }

async function loadWorld($: EngineInterface): Promise<World> {
  const keys = await $.store.keys()
  const ledgers: Ledger[] = []
  let own = emptyLedger()
  for (const key of keys) {
    if (!key.startsWith('ledger:')) continue
    const ledger = readLedger(await $.store.get(key))
    ledgers.push(ledger)
    if (key === runtime.key) own = ledger
  }
  const archive = readLedger(await $.store.get('archive'))
  const wallet = readWallet(await $.store.get('wallet'))
  const stored = await $.store.get('character')

  return {
    own,
    ledgers,
    archive: { fame: archive.fame, dust: archive.dust },
    wallet,
    character: isCharacterId(stored) ? stored : null,
  }
}

async function publish($: EngineInterface, world: World) {
  const totals = totalsOf([...world.ledgers, { ...emptyLedger(), ...world.archive }], world.wallet)
  const log = world.ledgers
    .flatMap(ledger => ledger.recent)
    .sort((a, b) => a.at - b.at)
    .slice(-20)
  const signature = JSON.stringify([totals, world.wallet, log, world.character])
  if (signature !== runtime.synced) {
    runtime.synced = signature
    await update($, totalsAtom, () => totals)
    await update($, walletAtom, () => world.wallet)
    await update($, logAtom, () => log)
    await update($, characterAtom, () => world.character)
  }

  return totals
}

// Each session writes only its own ledger, so another session's rewards and
// purchases show up here only by reading the store again.
function sync($: EngineInterface): Promise<unknown> {
  if (runtime.isSyncing) return runtime.queue
  runtime.isSyncing = true
  runtime.queue = runtime.queue
    .then(async () => publish($, await loadWorld($)))
    .catch(() => undefined)
    .finally(() => {
      runtime.isSyncing = false
    })

  return runtime.queue
}

async function saveOwn($: EngineInterface, world: World, own: Ledger): Promise<World> {
  await $.store.set(runtime.key, own)
  const ledgers = world.ledgers.filter(ledger => ledger !== world.own)

  return { ...world, own, ledgers: [...ledgers, own] }
}

function award($: EngineInterface, earn: Earn): Promise<unknown> {
  runtime.queue = runtime.queue.then(() => grant($, earn)).catch(() => undefined)

  return runtime.queue
}

async function grant($: EngineInterface, earn: Earn) {
  const now = await $.clock.now()
  const day = dayOf(now, runtime.offset)
  const world = await loadWorld($)
  const value = valueOf(earn, countToday(world.ledgers, earn.kind, day))
  if (value.rate === 0) return
  const before = await read($, totalsAtom)
  const reward: Reward = { at: now, kind: earn.kind, ...value }
  const own = credit(world.own, earn.kind, day, value.fame, value.dust)
  const next = await saveOwn($, world, { ...own, recent: [...own.recent, reward].slice(-RECENT) })
  const after = await publish($, next)
  await update($, turnFameAtom, n => n + value.fame)
  await celebrate($, before, after, reward, characterOf(world.character))
}

// A reward: one sound, a sparkle around the character, a line in the pane, and a toast for big ones.
async function celebrate($: EngineInterface, before: Totals, after: Totals, reward: Reward, character: Character) {
  const w = words()
  const label = w.rewards[reward.kind]
  const was = levelOf(before.fame).level
  const now = levelOf(after.fame).level
  if (now > was) {
    const rank = w.ranks[rankOf(now)]!
    const isNewRank = rankOf(now) !== rankOf(was)
    $.ui.toast(isNewRank ? w.rankToast(now, rank) : w.levelToast(now, label))
    const unlocked = character.items.filter(item => item.level > was && item.level <= now)
    if (unlocked.length > 0) $.ui.toast(w.unlocked(unlocked.map(item => item.name[runtime.language]).join(', ')))
    await flash($, isNewRank ? 'stage' : 'level', isNewRank ? w.newRank(rank) : w.levelUp(now))
    await play($, isNewRank ? 'stage' : 'levelup', character.id)
    return
  }
  if (reward.kind === 'merge' || reward.kind === 'comeback') $.ui.toast(w.bigToast(label, reward.fame, reward.dust))
  const kind: FxKind = reward.kind === 'merge' ? 'merge' : reward.kind === 'comeback' ? 'comeback' : 'reward'
  const sound: Sfx = reward.kind === 'merge' ? 'fanfare' : reward.kind === 'comeback' ? 'comeback' : 'coin'
  const gain = reward.fame > 0 ? w.repGain(reward.fame) : `+$${reward.dust}`
  await flash($, kind, w.rewardLine(label, gain) + (kind === 'reward' ? '' : '!'))
  await play($, sound, character.id)
}

async function flash($: EngineInterface, kind: FxKind, label: string) {
  const at = await $.clock.now()
  await update($, fxAtom, () => ({ kind, label, at }))
  $.clock.after(FX_MS[kind], () => void update($, fxAtom, fx => (fx?.at === at ? null : fx)))
}

// A person's prompt counts as presence: the day's first earns "Saddled up", coming
// back from a break after a long stretch earns "Campfire rest".
function arrive($: EngineInterface): Promise<unknown> {
  runtime.queue = runtime.queue
    .then(async () => {
      const now = await $.clock.now()
      const day = dayOf(now, runtime.offset)
      const world = await loadWorld($)
      const lastAt = Math.max(0, ...world.ledgers.map(ledger => ledger.lastAt))
      const since = Math.min(
        lastAt,
        ...world.ledgers.filter(ledger => ledger.lastAt >= lastAt - CONTINUOUS_GAP_MS).map(l => l.activeSince),
      )
      const earned: Earn[] = []
      if (countToday(world.ledgers, 'daily', day) === 0) earned.push({ kind: 'daily' })
      if (isBreakOver(lastAt, since, now)) earned.push({ kind: 'break' })
      const presence = touch({ ...world.own, lastAt, activeSince: since }, now)
      await saveOwn($, world, { ...world.own, lastAt: presence.lastAt, activeSince: presence.activeSince })
      for (const earn of earned) await grant($, earn)
    })
    .catch(() => undefined)

  return runtime.queue
}

async function changeWallet($: EngineInterface, change: (wallet: Wallet, totals: Totals) => Wallet | undefined) {
  const world = await loadWorld($)
  const totals = await publish($, world)
  const wallet = change(world.wallet, totals)
  if (wallet === undefined) return false
  await $.store.set('wallet', wallet)
  await publish($, { ...world, wallet })

  return true
}

// /clear and /resume carry on under a new session id without a new session.start, and
// the new session's $.state starts from the defaults. Move to that session's ledger
// (after writes already queued for the old one) and publish everything again.
function rejoin($: EngineInterface): Promise<unknown> {
  runtime.queue = runtime.queue
    .then(async () => {
      const key = `ledger:${await $.session.id()}`
      if (key === runtime.key) return
      runtime.key = key
      // The new session's values are empty, so publish even what looks unchanged.
      runtime.synced = ''
      await publish($, await loadWorld($))
    })
    .catch(() => undefined)

  return runtime.queue
}

// Ledgers quiet for two days fold into `archive` to keep the key count down. A short
// lease keeps two sessions from folding at once.
async function compact($: EngineInterface) {
  const now = await $.clock.now()
  const lease = (await $.store.get('lease')) as { key?: string; until?: number } | undefined
  if (lease?.until !== undefined && lease.until > now && lease.key !== runtime.key) return
  await $.store.set('lease', { key: runtime.key, until: now + 30_000 })
  await $.clock.sleep(300)
  const held = (await $.store.get('lease')) as { key?: string } | undefined
  if (held?.key !== runtime.key) return
  const archive = readLedger(await $.store.get('archive'))
  const stale: string[] = []
  for (const key of await $.store.keys()) {
    if (!key.startsWith('ledger:') || key === runtime.key) continue
    const ledger = readLedger(await $.store.get(key))
    if (now - ledger.lastAt < STALE_MS) continue
    archive.fame += ledger.fame
    archive.dust += ledger.dust
    stale.push(key)
  }
  if (stale.length > 0) {
    await $.store.set('archive', { ...archive, days: {}, recent: [] })
    for (const key of stale) await $.store.delete(key)
  }
  await $.store.delete('lease')
}

async function currentCharacter($: EngineInterface): Promise<Character> {
  return characterOf(await read($, characterAtom))
}

// A person who closes the pane keeps it closed in later sessions; /howdy opens it again.
async function showPane($: EngineInterface) {
  await $.store.set('hidden', false)
  void play($, 'open', (await currentCharacter($)).id)
  void sync($)

  return $.ui.open({ id: PANE, title: 'howdy', rows: INLINE_ROWS })
}

async function hidePane($: EngineInterface) {
  await $.store.set('hidden', true)
  void play($, 'close', (await currentCharacter($)).id)
  await $.ui.close({ id: PANE })
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced && pane.isShown)
}

async function pick($: EngineInterface, id: CharacterId) {
  const character = characterOf(id)
  await $.store.set('character', id)
  await update($, characterAtom, () => id)
  await update($, pickingAtom, () => false)
  runtime.drawn = ''
  $.ui.toast(character.hello[runtime.language])
  await flash($, 'buy', `✦ ${character.hello[runtime.language]}`)
  await play($, 'hello', id)
}

// /howdy-sound: normal → quiet → off → normal.
async function cycleSound($: EngineInterface): Promise<string> {
  const w = words()
  const now = await soundLevel($)
  const next = SOUND_LEVELS[(SOUND_LEVELS.indexOf(now) + 1) % SOUND_LEVELS.length]!
  await $.store.set('sound', next)
  if (next !== 'off') await play($, 'coin', (await currentCharacter($)).id)
  const after: SoundLevel = SOUND_LEVELS[(SOUND_LEVELS.indexOf(next) + 1) % SOUND_LEVELS.length]!

  return w.soundSet(w.sound[next], w.sound[after])
}

async function shop($: EngineInterface, id: string, level: number) {
  const character = await currentCharacter($)
  const item = character.items.find(one => fullId(character.id, one.id) === id)
  if (item === undefined) return
  const wallet = readWallet(await $.store.get('wallet'))
  if (wallet.owned.includes(id)) {
    await changeWallet($, current => wear(current, id))
    await play($, 'equip', character.id)
    return
  }
  const isDone = await changeWallet($, (current, now) => buy(current, now, level, id))
  if (isDone) {
    await flash($, 'buy', words().bought(item.name[runtime.language]))
    await play($, 'buy', character.id)
  } else {
    $.ui.toast(words().broke)
    await play($, 'error', character.id)
  }
}

async function animate($: EngineInterface) {
  if (!runtime.isDrawn) return
  runtime.tick += 1
  const character = await read($, characterAtom)
  if (character === null || (await read($, pickingAtom))) return
  const mood = await read($, moodAtom)
  const wallet = await read($, walletAtom)
  const fx = await read($, fxAtom)
  const rows = frame({ character, mood, tick: runtime.tick, equipped: wornBy(wallet, character), size: runtime.size, fx: fx?.kind })
  const signature = rows.join('')
  if (signature === runtime.drawn) return
  runtime.drawn = signature
  const done = await $.ui.blit({ requestId: PANE, key: SPRITE, cells: encode(rows).cells })
  if (done.deny !== undefined) runtime.isDrawn = false
}

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function utcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)

  return `${sign}${Math.floor(abs / 60)}${abs % 60 === 0 ? '' : `:${String(abs % 60).padStart(2, '0')}`}`
}

async function rulesText($: EngineInterface): Promise<string> {
  const w = words()
  const world = await loadWorld($)
  const day = dayOf(await $.clock.now(), runtime.offset)
  const lines = Object.entries(RULES).map(([kind, rule]) => {
    const key = kind as keyof typeof RULES
    const n = countToday(world.ledgers, key, day)
    const limit = rule.cap !== undefined ? w.rules.cap(rule.cap) : w.rules.taper(rule.full)

    return w.rules.line(w.rewards[key], rule.fame, rule.dust, limit, n, rateOf(key, n))
  })

  return [w.rules.intro, ...lines, w.rules.commitBonus, w.rules.verifyNote, w.rules.dayNote(5, utcOffset(runtime.offset))].join('\n')
}

async function statusText($: EngineInterface): Promise<string> {
  const w = words()
  const world = await loadWorld($)
  const totals = await publish($, world)
  const { level, into, need } = levelOf(totals.fame)

  return w.status({
    name: characterOf(world.character).name,
    level,
    rank: w.ranks[rankOf(level)]!,
    fame: totals.fame,
    progress: need === 0 ? w.maxLevel : `${into}/${need}`,
    dust: totals.dust,
    fans: w.fans(commas(fansOf(totals.fame))),
    owned: world.wallet.owned.length,
    total: SHOP_SIZE,
  })
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    runtime.key = `ledger:${await $.session.id()}`
    runtime.offset = -new Date().getTimezoneOffset()
    runtime.language = languageOf(options.language, await $.settings.read({ key: 'language' }).catch(() => undefined))
    const w = words()
    await $.command.register({ name: 'howdy', description: w.commands.howdy, immediate: true })
    await $.command.register({ name: 'howdy-pick', description: w.commands.pick, argumentHint: 'locki | cappl', immediate: true })
    await $.command.register({ name: 'howdy-status', description: w.commands.status })
    await $.command.register({ name: 'howdy-rules', description: w.commands.rules })
    await $.command.register({ name: 'howdy-sound', description: w.commands.sound, immediate: true })
    await publish($, await loadWorld($))
    $.clock.every(250, () => void animate($))
    $.clock.every(SYNC_MS, () => void sync($))
    if ((await $.store.get('hidden')) !== true) void $.ui.open({ id: PANE, title: 'howdy' })
    void compact($).catch(() => undefined)

    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const started = await next(e)
    if (e.source !== 'startup') await rejoin($)

    return started
  })

  on('command.run', { command: 'howdy' }, async $ => {
    const w = words()
    if (await isPaneOpen($)) {
      await hidePane($)

      return { text: w.closed }
    }
    const opened = await showPane($)

    return { text: opened.isPlaced ? w.opened : w.waiting }
  })

  // /howdy-pick cappl picks at once; /howdy-pick alone opens the picker in the pane.
  on('command.run', { command: 'howdy-pick' }, async ($, e) => {
    const w = words()
    const wanted = e.args.trim().toLowerCase()
    if (wanted !== '') {
      const found = CHARACTERS.find(one => one.id === wanted || one.name.toLowerCase() === wanted)
      if (found === undefined) return { text: w.unknownCharacter(CHARACTERS.map(one => one.id).join(', ')) }
      await pick($, found.id)

      return { text: w.picked(found.name) }
    }
    await update($, pickingAtom, () => true)
    if (!(await isPaneOpen($))) await showPane($)

    return { text: w.pickTitle }
  })

  // Closing with ✕ or ctrl+x x is remembered the same way.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') await $.store.set('hidden', true)

    return closed
  })

  on('command.run', { command: 'howdy-status' }, async $ => ({ text: await statusText($) }))

  on('command.run', { command: 'howdy-rules' }, async $ => ({ text: await rulesText($) }))

  on('command.run', { command: 'howdy-sound' }, async $ => ({ text: await cycleSound($) }))

  on('prompt.submit', async ($, e, next) => {
    await arrive($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, moodAtom, () => 'working' as Mood)
      await update($, turnFameAtom, () => 0)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await update($, moodAtom, () => 'happy' as Mood)
      $.clock.after(3000, () => void update($, moodAtom, () => 'idle' as Mood))
    }

    return done
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const isError = ran.isError === true
    let signal: Signal | undefined
    if (EDIT_TOOLS.has(String(e.tool))) {
      if (!isError) signal = { type: 'edit' }
    } else if (e.tool === 'ExitPlanMode') {
      if (!isError) signal = { type: 'plan' }
    } else if (e.tool === 'Bash') {
      const output = ran.text ?? ''
      if (commitOutcome(e.command, output, isError)) {
        signal = { type: 'commit' }
      } else if (mergeOutcome(e.command, output, isError)) {
        signal = { type: 'merge' }
      } else {
        const isPass = testOutcome(e.command, output, isError)
        if (isPass !== undefined) signal = { type: 'test', isPass }
      }
    }
    if (signal !== undefined) {
      const result = observe(runtime.work, signal)
      runtime.work = result.work
      // The result goes back once the reward is written (a few ms of store writes).
      for (const earn of result.earned) await award($, earn)
    }

    return ran
  })

  // While a turn runs, the spinner shows the rep earned in it.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const fame = await read($, turnFameAtom)
    if (fame === 0) return next(e)

    return next({ ...e, props: { ...e.props, suffix: `… ✦+${fame}` } })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const w = words()
    const lang = runtime.language
    const chosen = await read($, characterAtom)
    const isPicking = chosen === null || (await read($, pickingAtom))
    const columns = e.surface === 'terminal' ? e.props.bodyColumns : 80
    const bodyRows = e.surface === 'terminal' ? e.props.scroll.bodyRows : 60

    if (isPicking) {
      runtime.isDrawn = false
      const size: Size = columns >= 68 && bodyRows >= 14 + 6 ? 32 : 16
      const cards = CHARACTERS.map((character, index) => {
        const rows = frame({ character: character.id, mood: 'happy', tick: 0, equipped: [], size })
        let art
        if (e.surface === 'terminal') {
          const { Raster } = $.ui.resolve(e)
          const cells = encode(rows)
          art = <Raster key={`art-${character.id}`} columns={cells.columns} rows={cells.rows} cells={cells.cells} />
        } else {
          const { Svg } = $.ui.resolve(e)
          art = <Svg source={svgOf(rows)} alt={character.name} width={128} height={112} />
        }

        return (
          <Box key={`card-${character.id}`} flexDirection="column" width={Math.max(size, 22)} marginRight={2}>
            {art}
            <Text bold color={character.color}>
              {character.name}
              {chosen === character.id ? w.current : ''}
            </Text>
            <Text dimColor>{character.blurb[lang]}</Text>
            <Button key={`pick-${character.id}`} label={w.pick(character.name)} hotkey={String(index + 1)} onPress={() => pick($, character.id)} />
          </Box>
        )
      })

      return (
        <Box flexDirection="column">
          <Text bold>{w.pickTitle}</Text>
          <Box flexDirection={columns >= Math.max(size, 22) * 2 + 4 ? 'row' : 'column'}>{cards}</Box>
          <Text> </Text>
          <Button key="close" label={w.close} hotkey="q" onPress={() => hidePane($)} />
        </Box>
      )
    }

    const character = characterOf(chosen)
    const totals = await read($, totalsAtom)
    const wallet = await read($, walletAtom)
    const log = await read($, logAtom)
    const mood = await read($, moodAtom)
    const fx = await read($, fxAtom)
    const { level, into, need } = levelOf(totals.fame)
    const filled = need === 0 ? 10 : Math.floor((into / need) * 10)
    const worn = wornBy(wallet, character.id)
    const visible = character.items.filter(item => item.level <= level || wallet.owned.includes(fullId(character.id, item.id)))
    const nextLocked = character.items.find(item => item.level > level)
    // Rows below the header: recent rewards, the shop, the buttons.
    const below = 1 + Math.max(1, Math.min(4, log.length)) + 1 + visible.length + (nextLocked ? 1 : 0) + 3

    let sprite
    let isBeside = false
    let isOverflowing = false
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      // bodyRows is the most the pane can show at once; rows past it need focus and scrolling.
      runtime.size = columns >= 32 && bodyRows >= BIG_ROWS ? 32 : 16
      const rows = frame({ character: character.id, mood, tick: runtime.tick, equipped: worn, size: runtime.size, fx: fx?.kind })
      const art = encode(rows)
      runtime.drawn = rows.join('')
      runtime.isDrawn = true
      sprite = <Raster key={SPRITE} columns={art.columns} rows={art.rows} cells={art.cells} />
      // When the stack does not fit, put the header beside the small sprite if there is room.
      const stacked = art.rows + HEADER_ROWS + below
      isBeside = runtime.size === 16 && stacked > bodyRows && columns >= art.columns + 2 + HEADER_COLUMNS
      isOverflowing = (isBeside ? Math.max(art.rows, HEADER_ROWS + 2) + below : stacked) > bodyRows
    } else if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)
      const rows = frame({ character: character.id, mood, tick: 0, equipped: worn, size: 32 })
      sprite = <Svg source={svgOf(rows)} alt={`${character.name} Lv${level}`} width={128} height={112} />
    }

    // Ambiguous-width glyphs (■ □ · — ★ ×) take two cells on CJK terminals and push
    // the lines; only single-width ones are used here.
    const header = [
      <Text bold {...(fx === null ? {} : { color: FX_COLOR[fx.kind] })}>{fx === null ? ' ' : fx.label}</Text>,
      <Text bold>
        <Text color={character.color}>{character.name}</Text> Lv{level} {w.ranks[rankOf(level)]}
      </Text>,
      <Text>
        {w.rep} {'▰'.repeat(filled)}
        {'▱'.repeat(10 - filled)} {need === 0 ? w.maxLevel : `${into}/${need}`}
      </Text>,
      <Text>
        {w.gold} ${totals.dust} <Text dimColor>∙ {w.fans(commas(fansOf(totals.fame)))}</Text>
      </Text>,
      ...(isOverflowing ? [<Text dimColor>{w.scrollHint}</Text>] : []),
    ]

    return (
      <Box flexDirection="column">
        {isBeside ? (
          <Box key="beside" flexDirection="row">
            {sprite}
            <Box flexDirection="column" marginLeft={2}>
              {header}
            </Box>
          </Box>
        ) : (
          [sprite, ...header]
        )}
        <Text dimColor>{w.recent}</Text>
        {log.length === 0 && <Text dimColor>{w.noRewards}</Text>}
        {log.slice(-4).map(one => (
          <Text dimColor>
            {w.rewards[one.kind]}
            {one.fame > 0 ? ` +${one.fame}` : ''}
            {one.dust > 0 ? ` $${one.dust}` : ''}
            {one.rate < 1 ? ` (x${one.rate})` : ''}
          </Text>
        ))}
        <Text dimColor>{w.shop}</Text>
        {visible.map((item, index) => {
          const id = fullId(character.id, item.id)
          const isOwned = wallet.owned.includes(id)
          const label = isOwned
            ? `${item.name[lang]} ${worn.includes(item.id) ? w.takeOff : w.wear}`
            : `${item.name[lang]} $${commas(item.price)}`

          return (
            <Button
              key={`shop-${item.id}`}
              label={label}
              {...(index < 10 ? { hotkey: String((index + 1) % 10) } : {})}
              onPress={() => shop($, id, level)}
            />
          )
        })}
        {nextLocked !== undefined && <Text dimColor>{w.next(nextLocked.level, nextLocked.name[lang])}</Text>}
        <Text> </Text>
        <Button key="switch" label={w.switchCharacter} hotkey="c" onPress={() => update($, pickingAtom, () => true)} />
        <Button key="close" label={w.close} hotkey="q" onPress={() => hidePane($)} />
      </Box>
    )
  })
}
