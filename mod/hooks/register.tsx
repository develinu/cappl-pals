import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Act, Activity, CareKind, CharacterId, Fx, FxKind, Language, Ledger, PaneView, ResultKind, Reward, RewardKind, Totals, Wallet } from '../types'
import { ACTS, DANCES, actTicks, busySlot, idleGap, lookAt, loopTicks, type Moment } from './animations'
import { CHARACTERS, characterOf, fullId, isCharacterId, learnedTricks, type Character } from './characters'
import { WORDS, languageOf } from './i18n'
import {
  BOUNTY_BONUS,
  CONTINUOUS_GAP_MS,
  FRESH_WORK,
  RULES,
  SHOP_SIZE,
  buy,
  checkOutcome,
  chestFor,
  chestsBetween,
  commitOutcome,
  countToday,
  credit,
  dayOf,
  emptyLedger,
  emptyWallet,
  fansOf,
  isBreakOver,
  levelOf,
  luckyNugget,
  mergeOutcome,
  observe,
  prOutcome,
  isTestCommand,
  questsOf,
  rankOf,
  rateOf,
  readBounty,
  readLedger,
  readWallet,
  seedOf,
  settleBounty,
  tally,
  testOutcome,
  totalsOf,
  touch,
  valueOf,
  wear,
  wornBy,
  type Earn,
  type Quest,
  type Signal,
} from './rules'
import { SOUND_LEVELS, play, soundLevel, type Sfx, type SoundLevel } from './sound'
import { animatedSvgOf, encode, frame, type Size } from './sprite'

const PANE = 'cappl-pals'
const SPRITE = 'sprite'
const TICK_MS = 250
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'NotebookRead', 'ToolSearch'])
const STALE_MS = 2 * 24 * 60 * 60_000
// Five quiet minutes and the pal dozes off.
const SLEEP_MS = 5 * 60_000
const GLOW_MS = 10 * 60_000
// The header (fx line, level, rep, gold) and the narrowest column it fits beside the
// small sprite (seven rows tall) even when its lines wrap.
const HEADER_ROWS = 4
const HEADER_COLUMNS = 16
// The big sprite (14 rows) only when the header and a few rows below it fit too.
const BIG_ROWS = 14 + HEADER_ROWS + 6
// Rows the rules view and my progress take (progress adds a row per reward kind earned today).
const RULES_ROWS = 44
// The rules' name-and-value rows stay this narrow on a wide pane, so the eye need not travel.
const RULES_WIDTH = 52
const PROGRESS_ROWS = 22
// The height asked for when /cappl opens the pane above the prompt (the terminal may give less).
const INLINE_ROWS = 30
// How often other sessions' rewards and purchases are read back; the store sends no change events.
const SYNC_MS = 1500
// Latest rewards kept per session ledger (the pane shows four, all sessions merged).
const RECENT = 8
const FX_MS: Record<FxKind, number> = { reward: 1200, comeback: 1600, merge: 2000, level: 2600, stage: 3200, buy: 1500 }
const FX_COLOR: Record<FxKind, string> = {
  reward: '#FCD34D', comeback: '#F472B6', merge: '#60A5FA', level: '#F59E0B', stage: '#F59E0B', buy: '#86EFAC',
}

const totalsAtom = atom({ plugin: 'cappl-pals', key: 'totals' } as const, { fame: 0, dust: 0 })
const walletAtom = atom({ plugin: 'cappl-pals', key: 'wallet' } as const, emptyWallet())
const logAtom = atom({ plugin: 'cappl-pals', key: 'log' } as const, [])
const activityAtom = atom({ plugin: 'cappl-pals', key: 'activity' } as const, 'idle' as Activity)
const actAtom = atom({ plugin: 'cappl-pals', key: 'act' } as const, null as Act | null)
const glowAtom = atom({ plugin: 'cappl-pals', key: 'glowUntil' } as const, 0)
const turnFameAtom = atom({ plugin: 'cappl-pals', key: 'turnFame' } as const, 0)
const fxAtom = atom({ plugin: 'cappl-pals', key: 'fx' } as const, null as Fx | null)
const characterAtom = atom({ plugin: 'cappl-pals', key: 'character' } as const, null as CharacterId | null)
const pickingAtom = atom({ plugin: 'cappl-pals', key: 'picking' } as const, false)
const viewAtom = atom({ plugin: 'cappl-pals', key: 'view' } as const, 'main' as PaneView)

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
  // The terminal tick the current act started on, so its frames run from the start.
  actTick: 0,
  isTurn: false,
  turns: 0,
  lastActiveAt: 0,
  pets: [] as number[],
  tricks: 0,
  // Which idle stretch a desktop loop shows; moves on with each redraw for variety.
  svgSeed: 0,
  // Serializes this session's writes. Each session writes its own ledger; the few shared
  // keys (wallet, chestLevel, bounty:<day>) are each read and written straight back,
  // which keeps the window for two sessions to collide to a few milliseconds.
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
  const signature = JSON.stringify([totals, world.wallet, log, world.character, world.ledgers.map(ledger => ledger.days)])
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

function enqueue($: EngineInterface, job: () => Promise<unknown>): Promise<unknown> {
  runtime.queue = runtime.queue.then(job).catch(() => undefined)

  return runtime.queue
}

// ── Moods and acts ──────────────────────────────────────────────────────────

async function setActivity($: EngineInterface, activity: Activity) {
  runtime.lastActiveAt = await $.clock.now()
  if ((await read($, activityAtom)) !== activity) await update($, activityAtom, () => activity)
}

// Starts a one-off animation; it clears itself when its frames run out.
async function playAct($: EngineInterface, name: string) {
  const ticks = actTicks(name)
  if (ticks === 0) return
  const at = await $.clock.now()
  runtime.actTick = runtime.tick
  runtime.lastActiveAt = at
  await update($, actAtom, () => ({ name, at }))
  $.clock.after(ticks * TICK_MS + 50, () => void update($, actAtom, act => (act?.at === at ? null : act)))
}

// Five quiet minutes: asleep. Any activity wakes the pal again.
async function checkSleep($: EngineInterface) {
  const now = await $.clock.now()
  const activity = await read($, activityAtom)
  if (activity === 'idle' && runtime.lastActiveAt > 0 && now - runtime.lastActiveAt >= SLEEP_MS) {
    await update($, activityAtom, () => 'sleeping' as Activity)
  }
}

function learned(character: Character, totals: Totals): string[] {
  return learnedTricks(character, levelOf(totals.fame).level).map(trick => trick.act)
}

// ── Rewards ─────────────────────────────────────────────────────────────────

function award($: EngineInterface, earn: Earn): Promise<unknown> {
  return enqueue($, () => grant($, earn))
}

// Credits a reward or bonus to this session's ledger and returns the new world.
async function pay($: EngineInterface, world: World, kind: RewardKind, fame: number, dust: number, rate = 1) {
  const now = await $.clock.now()
  const day = dayOf(now, runtime.offset)
  const reward: Reward = { at: now, kind, fame, dust, rate }
  const own = credit(world.own, kind, day, fame, dust)

  return saveOwn($, world, { ...own, recent: [...own.recent, reward].slice(-RECENT) })
}

async function grant($: EngineInterface, earn: Earn) {
  const now = await $.clock.now()
  const day = dayOf(now, runtime.offset)
  let world = await loadWorld($)
  const count = countToday(world.ledgers, earn.kind, day)
  const value = valueOf(earn, count)
  if (value.rate === 0) return
  const before = await read($, totalsAtom)
  world = await pay($, world, earn.kind, value.fame, value.dust, value.rate)
  const character = characterOf(world.character)
  const reward: Reward = { at: now, kind: earn.kind, ...value }
  // Now and then a result turns up a lucky nugget.
  const nugget = earn.kind === 'daily' ? 0 : luckyNugget(seedOf(`${runtime.key}:${now}:${count}`))
  if (nugget > 0) world = await pay($, world, 'lucky', 0, nugget)
  let after = await publish($, world)
  await update($, turnFameAtom, n => n + value.fame)
  const levelled = await openChests($, world, before, after)
  if (levelled !== undefined) {
    world = levelled.world
    after = levelled.totals
  }
  await celebrate($, before, after, reward, character)
  if (nugget > 0) {
    $.ui.toast(words().luckyToast(nugget))
    $.clock.after(2200, () => void enqueue($, async () => {
      await playAct($, 'lucky')
      await play($, 'lucky', character.id)
    }))
  }
  await settleQuests($)
}

// Every new level opens a chest. `chestLevel` remembers the last level paid, across sessions.
async function openChests($: EngineInterface, world: World, before: Totals, after: Totals) {
  const level = levelOf(after.fame).level
  if (level <= levelOf(before.fame).level) return undefined
  const paid = Number((await $.store.get('chestLevel')) ?? levelOf(before.fame).level)
  if (level <= paid) return undefined
  await $.store.set('chestLevel', level)
  const gold = chestsBetween(paid, level)
  const next = await pay($, world, 'chest', 0, gold)
  $.ui.toast(words().chestToast(level, gold))
  const id = characterOf(world.character).id
  $.clock.after(1800, () => void play($, 'chest', id))

  return { world: next, totals: await publish($, next) }
}

// A reward: one sound, a sparkle around the character, a line in the pane, an act,
// and a toast for big ones.
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
    await playAct($, 'bigCelebrate')
    await play($, isNewRank ? 'stage' : 'levelup', character.id)
    // A new trick: show it right after the cheering.
    const trick = character.tricks.find(one => one.level > was && one.level <= now)
    if (trick !== undefined) {
      $.ui.toast(w.learned(trick.name[runtime.language]))
      $.clock.after(actTicks('bigCelebrate') * TICK_MS + 200, () => void enqueue($, async () => {
        await playAct($, trick.act)
        await play($, 'trick', character.id)
      }))
    }
    return
  }
  const isBig = reward.kind === 'merge' || reward.kind === 'comeback'
  if (isBig) $.ui.toast(w.bigToast(label, reward.fame, reward.dust))
  const kind: FxKind = reward.kind === 'merge' ? 'merge' : reward.kind === 'comeback' ? 'comeback' : 'reward'
  const sound: Sfx = reward.kind === 'merge' ? 'fanfare' : reward.kind === 'comeback' ? 'comeback' : 'coin'
  const gain = reward.fame > 0 ? w.repGain(reward.fame) : `+$${reward.dust}`
  await flash($, kind, w.rewardLine(label, gain) + (kind === 'reward' ? '' : '!'))
  await playAct($, isBig ? 'bigCelebrate' : 'celebrate')
  await play($, sound, character.id)
}

async function flash($: EngineInterface, kind: FxKind, label: string) {
  const at = await $.clock.now()
  await update($, fxAtom, () => ({ kind, label, at }))
  $.clock.after(FX_MS[kind], () => void update($, fxAtom, fx => (fx?.at === at ? null : fx)))
}

// Pays any of the day's bounties that are now done (the shared `bounty:<day>` key
// remembers what was paid), and the bonus once all three are.
async function settleQuests($: EngineInterface) {
  const now = await $.clock.now()
  const day = dayOf(now, runtime.offset)
  let world = await loadWorld($)
  const quests = questsOf(day)
  const key = `bounty:${day}`
  const settled = settleBounty(quests, kind => countToday(world.ledgers, kind, day), readBounty(await $.store.get(key)))
  if (settled.finished.length === 0 && !settled.isBonus) return
  await $.store.set(key, settled.bounty)
  const w = words()
  for (const quest of settled.finished) {
    world = await pay($, world, 'quest', 0, quest.gold)
    $.ui.toast(w.questToast(w.quests[quest.id] ?? quest.id, quest.gold))
  }
  if (settled.isBonus) {
    world = await pay($, world, 'quest', 0, BOUNTY_BONUS)
    $.ui.toast(w.bonusToast(BOUNTY_BONUS))
  }
  await publish($, world)
  const character = characterOf(world.character)
  $.clock.after(1200, () => void enqueue($, async () => {
    await playAct($, 'bigCelebrate')
    await play($, 'quest', character.id)
  }))
}

// A person's prompt counts as presence: the day's first earns "Saddled up", coming
// back from a break after a long stretch earns "Campfire rest".
function arrive($: EngineInterface): Promise<unknown> {
  return enqueue($, async () => {
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
}

// Counts a pet, treat or trick for the day's bounties (nothing is paid for it).
async function count($: EngineInterface, kind: CareKind) {
  const day = dayOf(await $.clock.now(), runtime.offset)
  const world = await loadWorld($)
  const next = await saveOwn($, world, tally(world.own, kind, day))
  await publish($, next)
  await settleQuests($)
}

async function changeWallet($: EngineInterface, change: (wallet: Wallet, totals: Totals) => Wallet | undefined) {
  const world = await loadWorld($)
  const totals = await publish($, world)
  // Read the wallet again right before writing it, in case another session just did.
  const wallet = change(readWallet(await $.store.get('wallet')), totals)
  if (wallet === undefined) return false
  await $.store.set('wallet', wallet)
  await publish($, { ...world, wallet })

  return true
}

// ── Interactions ────────────────────────────────────────────────────────────

// A sleeping pal wakes up; one at work stays at work.
async function wake($: EngineInterface) {
  const activity = await read($, activityAtom)
  await setActivity($, activity === 'sleeping' ? 'idle' : activity)
}

// A pet makes hearts; three within a few seconds and the pal rolls about.
async function pet($: EngineInterface) {
  const now = await $.clock.now()
  runtime.pets = [...runtime.pets.filter(at => now - at < 6000), now]
  const character = await currentCharacter($)
  await wake($)
  await playAct($, runtime.pets.length >= 3 ? 'petMore' : 'pet')
  await play($, 'pet', character.id)
  await enqueue($, () => count($, 'pet'))
}

// Shows the learned tricks in turn, the newest first.
async function trick($: EngineInterface) {
  const character = await currentCharacter($)
  const known = learned(character, await read($, totalsAtom))
  if (known.length === 0) {
    $.ui.toast(words().noTricks)
    await wake($)
    await playAct($, 'lookAround')
    await enqueue($, () => count($, 'trick'))
    return
  }
  const act = known[known.length - 1 - (runtime.tricks % known.length)]!
  runtime.tricks += 1
  await wake($)
  await playAct($, act)
  await play($, 'trick', character.id)
  await enqueue($, () => count($, 'trick'))
}

// A treat costs a little gold: the pal munches it and glows for ten minutes.
async function treat($: EngineInterface) {
  const character = await currentCharacter($)
  const price = character.treat.price
  const isPaid = await enqueue($, () =>
    changeWallet($, (wallet, totals) => (totals.dust < price ? undefined : { ...wallet, spent: wallet.spent + price })),
  )
  if (isPaid !== true) {
    $.ui.toast(words().noTreatGold)
    await play($, 'error', character.id)
    return
  }
  const now = await $.clock.now()
  const until = now + GLOW_MS
  await update($, glowAtom, () => until)
  // Clear it when it wears off, so a desktop loop is drawn again without the blush.
  $.clock.after(GLOW_MS + 50, () => void update($, glowAtom, current => (current === until ? 0 : current)))
  await wake($)
  await playAct($, 'treat')
  await play($, 'treat', character.id)
  await enqueue($, () => count($, 'treat'))
}

// ── Sessions, panes, commands ───────────────────────────────────────────────

// /clear and /resume carry on under a new session id without a new session.start, and
// the new session's $.state starts from the defaults. Move to that session's ledger
// (after writes already queued for the old one) and publish everything again.
function rejoin($: EngineInterface): Promise<unknown> {
  return enqueue($, async () => {
    const key = `ledger:${await $.session.id()}`
    if (key === runtime.key) return
    runtime.key = key
    // The new session's values are empty, so publish even what looks unchanged.
    runtime.synced = ''
    await publish($, await loadWorld($))
  })
}

// Ledgers quiet for two days fold into `archive` to keep the key count down, and old
// bounty boards go. A short lease keeps two sessions from folding at once.
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
  const today = dayOf(now, runtime.offset)
  for (const key of await $.store.keys()) {
    if (key.startsWith('bounty:') && key < `bounty:${today}`) stale.push(key)
    if (!key.startsWith('ledger:') || key === runtime.key) continue
    const ledger = readLedger(await $.store.get(key))
    if (now - ledger.lastAt < STALE_MS) continue
    archive.fame += ledger.fame
    archive.dust += ledger.dust
    stale.push(key)
  }
  if (stale.some(key => key.startsWith('ledger:'))) await $.store.set('archive', { ...archive, days: {}, recent: [] })
  for (const key of stale) await $.store.delete(key)
  await $.store.delete('lease')
}

async function currentCharacter($: EngineInterface): Promise<Character> {
  return characterOf(await read($, characterAtom))
}

// A person who closes the pane keeps it closed in later sessions; /cappl opens it again.
async function showPane($: EngineInterface) {
  await $.store.set('hidden', false)
  void play($, 'open', (await currentCharacter($)).id)
  void sync($)

  return $.ui.open({ id: PANE, title: 'CAPPL', rows: INLINE_ROWS })
}

async function hidePane($: EngineInterface) {
  await $.store.set('hidden', true)
  void play($, 'close', (await currentCharacter($)).id)
  await $.ui.close({ id: PANE })
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE && pane.isPlaced && pane.isShown)
}

// Opens a view of the pane: the rules and my progress at their top with the focus on
// "Back"; the pal's view with the focus back on the menu row that opened the other.
async function showView($: EngineInterface, view: PaneView, from: PaneView = 'main') {
  await update($, viewAtom, () => view)
  if (view === 'main') await $.ui.focus({ requestId: PANE, key: from === 'progress' ? 'status' : 'rules' }).catch(() => undefined)
  else await focusTop($, 'back')
}

// Puts the focus on `key` once the new drawing has it, then shows that drawing from
// its top: the person keeps driving the pane by keyboard after a view changes.
async function focusTop($: EngineInterface, key: string) {
  await $.ui.focus({ requestId: PANE, key }).catch(() => undefined)
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

async function openPicker($: EngineInterface) {
  await update($, pickingAtom, () => true)
  const current = await read($, characterAtom)
  await focusTop($, `pick-${current ?? CHARACTERS[0]!.id}`)
}

async function pick($: EngineInterface, id: CharacterId) {
  const character = characterOf(id)
  await $.store.set('character', id)
  await update($, characterAtom, () => id)
  await update($, pickingAtom, () => false)
  await update($, viewAtom, () => 'main' as PaneView)
  void focusTop($, 'pet')
  runtime.drawn = ''
  $.ui.toast(character.hello[runtime.language])
  await flash($, 'buy', `✦ ${character.hello[runtime.language]}`)
  await playAct($, 'hello')
  await play($, 'hello', id)
}

// /cappl-sound: normal → quiet → off → normal.
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
    await enqueue($, () => changeWallet($, current => wear(current, id)))
    await play($, 'equip', character.id)
    return
  }
  const isDone = (await enqueue($, () => changeWallet($, (current, now) => buy(current, now, level, id)))) === true
  if (isDone) {
    await flash($, 'buy', words().bought(item.name[runtime.language]))
    await playAct($, 'buy')
    await play($, 'buy', character.id)
  } else {
    $.ui.toast(words().broke)
    await play($, 'error', character.id)
  }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

async function momentNow($: EngineInterface, character: Character, tick: number, actT?: number): Promise<Moment> {
  const stored = await read($, actAtom)
  const glowUntil = await read($, glowAtom)
  const now = await $.clock.now()
  // An act past its last frame is over, even if the timer that clears it was lost to a reload.
  const act = stored !== null && actTicks(stored.name) > 0 && now - stored.at < actTicks(stored.name) * TICK_MS ? stored : null

  return {
    character: character.id,
    activity: await read($, activityAtom),
    tick,
    learned: learned(character, await read($, totalsAtom)),
    isGlowing: glowUntil > now,
    ...(act === null ? {} : { act: { name: act.name, t: actT ?? tick - runtime.actTick } }),
  }
}

// The terminal sprite is blitted in place every tick; SVG surfaces animate on their
// own (SMIL inside the SVG) and are drawn again only when the moment changes.
async function animate($: EngineInterface) {
  if (!runtime.isDrawn) return
  runtime.tick += 1
  const id = await read($, characterAtom)
  if (id === null || (await read($, pickingAtom)) || (await read($, viewAtom)) !== 'main') return
  const character = characterOf(id)
  const wallet = await read($, walletAtom)
  const fx = await read($, fxAtom)
  const moment = await momentNow($, character, runtime.tick)
  const rows = frame({ character: id, look: lookAt(moment), tick: runtime.tick, equipped: wornBy(wallet, id), size: runtime.size, fx: fx?.kind })
  const signature = rows.join('')
  if (signature === runtime.drawn) return
  runtime.drawn = signature
  const done = await $.ui.blit({ requestId: PANE, key: SPRITE, cells: encode(rows).cells })
  if (done.deny !== undefined) runtime.isDrawn = false
}

// One loop of the moment as an animated SVG, waving back when pointed at.
function loopSvg(moment: Moment, equipped: readonly string[], fx: FxKind | undefined): string {
  const ticks = loopTicks(moment)
  const isIdle = moment.act === undefined && moment.activity === 'idle'
  const start = isIdle ? busySlot(moment.learned, runtime.svgSeed) * idleGap(moment.character, moment.isGlowing === true) : 0
  const frames = Array.from({ length: ticks }, (_, i) => {
    const tick = start + i
    const look = lookAt({ ...moment, tick, ...(moment.act === undefined ? {} : { act: { name: moment.act.name, t: i } }) })
    return frame({ character: moment.character, look, tick, equipped, size: 32, ...(fx === undefined ? {} : { fx }) })
  })
  const hover = Array.from({ length: actTicks('hello') }, (_, t) =>
    frame({ character: moment.character, look: ACTS.hello!.at(t, moment.character), tick: t, equipped, size: 32 }),
  )

  return animatedSvgOf(frames, TICK_MS, hover)
}

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function utcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)

  return `${sign}${Math.floor(abs / 60)}${abs % 60 === 0 ? '' : `:${String(abs % 60).padStart(2, '0')}`}`
}

// The results in the order a day usually brings them, for the rules view and /cappl-rules.
const RESULT_ORDER: readonly ResultKind[] = ['verify', 'comeback', 'check', 'commit', 'pr', 'merge', 'plan', 'break', 'daily']

async function ruleRows($: EngineInterface) {
  const world = await loadWorld($)
  const day = dayOf(await $.clock.now(), runtime.offset)

  return RESULT_ORDER.map(kind => {
    const rule = RULES[kind]
    const n = countToday(world.ledgers, kind, day)

    return { kind, rule, today: n, rate: rateOf(kind, n) }
  })
}

async function rulesText($: EngineInterface): Promise<string> {
  const w = words()
  const r = w.rules
  const rows = await ruleRows($)
  const lines = [`${r.title}: ${r.intro}`, '', r.earn]
  for (const row of rows) {
    const limit = row.rule.cap !== undefined ? r.limit.cap(row.rule.cap) : r.limit.taper(row.rule.full)
    const today = row.today > 0 ? ` ∙ ${r.today(row.today)}${row.rate < 1 ? ` (x${row.rate})` : ''}` : ''
    lines.push(`- ${w.rewards[row.kind]}: ${r.values(row.rule.fame, row.rule.dust)} ∙ ${limit}${today}`, `  ${r.when[row.kind]}`)
  }
  lines.push(r.commitBonus, r.taper, '', r.bountyTitle, ...r.bounty.map(line => `- ${line}`), '', r.bonusTitle, ...r.bonus.map(line => `- ${line}`))
  lines.push('', `${r.noneTitle}: ${r.none}`, r.fair(5, utcOffset(runtime.offset)))

  return lines.join('\n')
}

async function statusText($: EngineInterface): Promise<string> {
  const w = words()
  const world = await loadWorld($)
  const totals = await publish($, world)
  const { level, into, need } = levelOf(totals.fame)
  const character = characterOf(world.character)

  return w.status({
    name: character.name,
    level,
    rank: w.ranks[rankOf(level)]!,
    fame: totals.fame,
    progress: need === 0 ? w.maxLevel : `${into}/${need}`,
    dust: totals.dust,
    fans: w.fans(commas(fansOf(totals.fame))),
    owned: world.wallet.owned.length,
    total: SHOP_SIZE,
    tricks: learnedTricks(character, level).length,
    allTricks: character.tricks.length,
  })
}

function bountyLines(quests: readonly Quest[], ledgers: readonly Ledger[], day: string, done: readonly string[]) {
  return quests.map(quest => ({
    quest,
    have: Math.min(quest.target, countToday(ledgers, quest.count, day)),
    isDone: done.includes(quest.id),
  }))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    runtime.key = `ledger:${await $.session.id()}`
    runtime.offset = -new Date().getTimezoneOffset()
    runtime.language = languageOf(options.language, await $.settings.read({ key: 'language' }).catch(() => undefined))
    runtime.lastActiveAt = await $.clock.now()
    const w = words()
    await $.command.register({ name: 'cappl', description: w.commands.toggle, immediate: true })
    await $.command.register({ name: 'cappl-pick', description: w.commands.pick, argumentHint: 'riki | caro | numo', immediate: true })
    await $.command.register({ name: 'cappl-status', description: w.commands.status })
    await $.command.register({ name: 'cappl-rules', description: w.commands.rules })
    await $.command.register({ name: 'cappl-sound', description: w.commands.sound, immediate: true })
    const totals = await publish($, await loadWorld($))
    // Chests start from the level a profile already has; only new levels pay.
    if ((await $.store.get('chestLevel')) === undefined) await $.store.set('chestLevel', levelOf(totals.fame).level)
    $.clock.every(TICK_MS, () => void animate($).catch(() => undefined))
    $.clock.every(SYNC_MS, () => void sync($))
    $.clock.every(15_000, () => void checkSleep($).catch(() => undefined))
    // Desktop loops show a different idle stretch now and then.
    $.clock.every(30_000, () => {
      runtime.svgSeed += 1
    })
    if ((await $.store.get('hidden')) !== true) void $.ui.open({ id: PANE, title: 'CAPPL' })
    void compact($).catch(() => undefined)

    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    const started = await next(e)
    if (e.source !== 'startup') await rejoin($)

    return started
  })

  // Waiting on a permission prompt: the pal waves for attention.
  on('classic.Notification', async ($, e, next) => {
    const done = await next(e)
    if (/permission/i.test(e.notification_type)) await setActivity($, 'waiting')

    return done
  })

  on('command.run', { command: 'cappl' }, async $ => {
    const w = words()
    if (await isPaneOpen($)) {
      await hidePane($)

      return { text: w.closed }
    }
    const opened = await showPane($)

    return { text: opened.isPlaced ? w.opened : w.waiting }
  })

  // /cappl-pick caro picks at once; /cappl-pick alone opens the picker in the pane.
  on('command.run', { command: 'cappl-pick' }, async ($, e) => {
    const w = words()
    const wanted = e.args.trim().toLowerCase()
    if (wanted !== '') {
      const found = CHARACTERS.find(one => one.id === wanted || one.name.toLowerCase() === wanted)
      if (found === undefined) return { text: w.unknownCharacter(CHARACTERS.map(one => one.name.toLowerCase()).join(', ')) }
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

  on('command.run', { command: 'cappl-status' }, async $ => ({ text: await statusText($) }))

  on('command.run', { command: 'cappl-rules' }, async $ => ({ text: await rulesText($) }))

  on('command.run', { command: 'cappl-sound' }, async $ => ({ text: await cycleSound($) }))

  on('prompt.submit', async ($, e, next) => {
    await arrive($)
    if ((await read($, activityAtom)) === 'sleeping') await setActivity($, 'idle')
    await playAct($, 'listen')

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      runtime.isTurn = true
      await setActivity($, 'thinking')
      await update($, turnFameAtom, () => 0)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      runtime.isTurn = false
      runtime.turns += 1
      await setActivity($, 'idle')
      // A dance to end the turn, after whatever cheering is still going.
      const act = await read($, actAtom)
      const now = await $.clock.now()
      const left = act === null ? 0 : Math.max(0, act.at + actTicks(act.name) * TICK_MS - now)
      const turn = runtime.turns
      $.clock.after(left + 100, () => {
        // Not if the next turn has already begun.
        if (!runtime.isTurn && runtime.turns === turn) void playAct($, DANCES[turn % DANCES.length]!)
      })
    }

    return done
  })

  on('turn.abort', async ($, e, next) => {
    const done = await next(e)
    runtime.isTurn = false
    await setActivity($, 'idle')

    return done
  })

  on('tool.call', async ($, e, next) => {
    const isMain = !('agentId' in e) || e.agentId === undefined
    const tool = String(e.tool)
    const command = e.tool === 'Bash' ? e.command : ''
    if (isMain) {
      const doing: Activity = EDIT_TOOLS.has(tool)
        ? 'editing'
        : READ_TOOLS.has(tool)
          ? 'reading'
          : isTestCommand(command) || /\btest\b/.test(command)
            ? 'testing'
            : 'running'
      await setActivity($, doing)
    }
    const ran = await next(e)
    if (isMain) await setActivity($, runtime.isTurn ? 'thinking' : 'idle')
    if (ran.deny !== undefined) return ran
    const isError = ran.isError === true
    // One command can do several things (`npm test && git commit && gh pr create`),
    // taken in the order they happen.
    const signals: Signal[] = []
    if (EDIT_TOOLS.has(tool)) {
      if (!isError) signals.push({ type: 'edit' })
    } else if (e.tool === 'ExitPlanMode') {
      if (!isError) signals.push({ type: 'plan' })
    } else if (e.tool === 'Bash') {
      const output = ran.text ?? ''
      const isPass = testOutcome(command, output, isError)
      if (isPass !== undefined) {
        signals.push({ type: 'test', isPass })
        if (!isPass) {
          await playAct($, 'fail')
          await play($, 'fail', (await currentCharacter($)).id)
        }
      } else {
        const isClean = checkOutcome(command, output, isError)
        if (isClean !== undefined) signals.push({ type: 'check', isPass: isClean })
      }
      if (commitOutcome(command, output, isError)) signals.push({ type: 'commit' })
      if (prOutcome(command, output, isError)) signals.push({ type: 'pr' })
      if (mergeOutcome(command, output, isError)) signals.push({ type: 'merge' })
    }
    for (const signal of signals) {
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
    const view = await read($, viewAtom)
    const isTerminal = e.surface === 'terminal'
    const columns = isTerminal ? e.props.bodyColumns : 80
    const bodyRows = isTerminal ? e.props.scroll.bodyRows : 60
    // Driven by a click, or from the keyboard: the focus walks the controls top to
    // bottom (Tab, and ⇅ while the tree fits; ⇅ scrolls a taller one), Enter presses.
    // So every control gets its own row: a row of buttons would look like left and
    // right work too. No hotkeys: a Korean layout never sends the Latin letter one needs.
    const menuButton = (key: string, label: string, onPress: () => unknown) => <Button key={key} label={label} onPress={onPress} />
    const hintFor = (isLong: boolean) =>
      isTerminal ? <Text key="hint" dimColor>{!e.props.isFocused ? w.hint.idle : isLong ? w.hint.scroll : w.hint.focused}</Text> : null
    const back = () => menuButton('back', w.menu.back, () => showView($, 'main', view))
    const close = () => menuButton('close', w.close, () => hidePane($))

    if (isPicking) {
      runtime.isDrawn = false
      const size: Size = columns >= 70 && bodyRows >= 14 + 6 ? 32 : 16
      // Two cards side by side fit a 40-column dock with the small sprites.
      const cardWidth = size === 32 ? 34 : 18
      const cards = CHARACTERS.map((character, index) => {
        let art
        if (isTerminal) {
          const { Raster } = $.ui.resolve(e)
          const look = ACTS.hello!.at(1, character.id)
          const cells = encode(frame({ character: character.id, look, tick: 0, equipped: [], size }))
          art = <Raster key={`art-${character.id}`} columns={cells.columns} rows={cells.rows} cells={cells.cells} />
        } else {
          const { Svg } = $.ui.resolve(e)
          const moment: Moment = { character: character.id, activity: 'idle', tick: 0, learned: [], act: { name: 'hello', t: 0 } }
          art = <Svg source={loopSvg(moment, [], undefined)} alt={character.name} width={128} height={112} isInteractive />
        }

        return (
          <Box key={`card-${character.id}`} flexDirection="column" width={cardWidth} marginRight={index === 0 ? 2 : 0}>
            {art}
            <Text bold color={character.color}>
              {index + 1}. {character.name}
              {chosen === character.id ? w.current : ''}
            </Text>
            <Text dimColor>{character.blurb[lang]}</Text>
          </Box>
        )
      })

      return (
        <Box flexDirection="column">
          <Text bold>{w.pickTitle}</Text>
          {hintFor(false)}
          <Box flexDirection={columns >= cardWidth * 2 + 2 ? 'row' : 'column'}>{cards}</Box>
          <Text> </Text>
          {CHARACTERS.map((character, index) =>
            menuButton(`pick-${character.id}`, w.pick(character.name), () => pick($, character.id)),
          )}
          {close()}
        </Box>
      )
    }

    const character = characterOf(chosen)
    const totals = await read($, totalsAtom)
    const wallet = await read($, walletAtom)
    const log = await read($, logAtom)
    const fx = await read($, fxAtom)
    const { level, into, need } = levelOf(totals.fame)
    const filled = need === 0 ? 10 : Math.floor((into / need) * 10)
    const worn = wornBy(wallet, character.id)
    const nextLocked = character.items.find(item => item.level > level)
    const nextTrick = character.tricks.find(one => one.level > level)
    const now = await $.clock.now()
    const day = dayOf(now, runtime.offset)
    const world = await loadWorld($)
    const rankLine = (
      <Text key="rank" bold>
        <Text color={character.color}>{character.name}</Text> Lv{level} {w.ranks[rankOf(level)]}
      </Text>
    )
    const repLine = (
      <Text key="rep">
        {w.rep} {'▰'.repeat(filled)}
        {'▱'.repeat(10 - filled)} {need === 0 ? w.maxLevel : `${into}/${need}`}
      </Text>
    )
    const goldLine = (
      <Text key="gold">
        {w.gold} ${totals.dust} <Text dimColor>∙ {w.fans(commas(fansOf(totals.fame)))}</Text>
      </Text>
    )

    if (view === 'rules') {
      runtime.isDrawn = false
      const r = w.rules
      const rows = await ruleRows($)

      return (
        <Box flexDirection="column">
          <Text bold>{r.title}</Text>
          <Text dimColor>{r.intro}</Text>
          {hintFor(bodyRows < RULES_ROWS)}
          {back()}
          <Text> </Text>
          <Text bold>{r.earn}</Text>
          {rows.map(row => (
            <Box key={`rule-${row.kind}`} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" width={Math.min(columns, RULES_WIDTH)}>
                <Text bold>{w.rewards[row.kind]}</Text>
                <Text color="#FCD34D">{r.values(row.rule.fame, row.rule.dust)}</Text>
              </Box>
              <Text dimColor>
                {'  '}
                {r.when[row.kind].replaceAll('`', '')}
                {row.today > 0 ? ` (${r.today(row.today)})` : ''}
              </Text>
            </Box>
          ))}
          <Text dimColor>{r.commitBonus}</Text>
          <Text dimColor>{r.taper}</Text>
          <Text> </Text>
          <Text bold>{r.bountyTitle}</Text>
          {r.bounty.map((line, i) => (
            <Text key={`bounty-${i}`}>  {line}</Text>
          ))}
          <Text bold>{r.bonusTitle}</Text>
          {r.bonus.map((line, i) => (
            <Text key={`bonus-${i}`}>  {line}</Text>
          ))}
          <Text bold>{r.noneTitle}</Text>
          <Text dimColor>  {r.none}</Text>
          <Text dimColor>{r.fair(5, utcOffset(runtime.offset))}</Text>
        </Box>
      )
    }

    if (view === 'progress') {
      runtime.isDrawn = false
      const p = w.progress
      const earned = (Object.keys(w.rewards) as RewardKind[])
        .map(kind => ({ kind, n: countToday(world.ledgers, kind, day) }))
        .filter(one => one.n > 0)
      const tricks = learnedTricks(character, level)
      const owned = character.items.filter(item => wallet.owned.includes(fullId(character.id, item.id)))

      return (
        <Box flexDirection="column">
          <Text bold>{p.title}</Text>
          {hintFor(bodyRows < PROGRESS_ROWS + earned.length)}
          {back()}
          <Text> </Text>
          {rankLine}
          {repLine}
          {need > 0 && <Text dimColor>{p.toNext(need - into, level + 1)}</Text>}
          {goldLine}
          <Text> </Text>
          <Text bold>{p.today}</Text>
          {earned.length === 0 && <Text dimColor>  {p.nothingToday}</Text>}
          {earned.map(one => (
            <Text key={`today-${one.kind}`}>  {p.count(w.rewards[one.kind], one.n)}</Text>
          ))}
          <Text bold>{w.recent}</Text>
          {log.length === 0 && <Text dimColor>  {w.noRewards}</Text>}
          {log.slice(-5).map(one => (
            <Text key={`recent-${one.at}-${one.kind}`} dimColor>
              {'  '}
              {w.rewards[one.kind]}
              {one.fame > 0 ? ` +${one.fame}` : ''}
              {one.dust > 0 ? ` $${one.dust}` : ''}
              {one.rate < 1 ? ` (x${one.rate})` : ''}
            </Text>
          ))}
          <Text bold>{p.tricks(tricks.length, character.tricks.length)}</Text>
          <Text dimColor>  {nextTrick === undefined ? p.allLearned : w.nextTrick(nextTrick.level, nextTrick.name[lang])}</Text>
          <Text bold>{p.items(owned.length, character.items.length)}</Text>
          <Text dimColor>  {nextLocked === undefined ? p.allUnlocked : w.next(nextLocked.level, nextLocked.name[lang])}</Text>
        </Box>
      )
    }

    const visible = character.items.filter(item => item.level <= level || wallet.owned.includes(fullId(character.id, item.id)))
    const quests = questsOf(day)
    const bounty = readBounty(await $.store.get(`bounty:${day}`))
    const lines = bountyLines(quests, world.ledgers, day, bounty.done)
    const recent = log.slice(-3)
    // Rows below the header: the hint, the actions, the bounties, recent rewards, the
    // shop, what's next and the menu.
    const below =
      (isTerminal ? 1 : 0) + 3 + 1 + lines.length + 1 + 1 + Math.max(1, recent.length) + 1 + visible.length + (nextLocked ? 1 : 0) + (nextTrick ? 1 : 0) + 1 + 4

    let sprite
    let isBeside = false
    let isOverflowing = false
    if (isTerminal) {
      const { Raster } = $.ui.resolve(e)
      // bodyRows is the most the pane can show at once; rows past it need focus and scrolling.
      runtime.size = columns >= 32 && bodyRows >= BIG_ROWS ? 32 : 16
      const moment = await momentNow($, character, runtime.tick)
      const rows = frame({ character: character.id, look: lookAt(moment), tick: runtime.tick, equipped: worn, size: runtime.size, fx: fx?.kind })
      const art = encode(rows)
      runtime.drawn = rows.join('')
      runtime.isDrawn = true
      sprite = <Raster key={SPRITE} columns={art.columns} rows={art.rows} cells={art.cells} />
      // When the stack does not fit, put the header beside the small sprite if there is room.
      const stacked = art.rows + HEADER_ROWS + below
      isBeside = runtime.size === 16 && stacked > bodyRows && columns >= art.columns + 2 + HEADER_COLUMNS
      isOverflowing = (isBeside ? Math.max(art.rows, HEADER_ROWS + 3) + below - 1 : stacked) > bodyRows
    } else if (e.surface === 'desktop' || e.surface === 'vscode' || e.surface === 'mobile') {
      const { Svg } = $.ui.resolve(e)
      const moment = await momentNow($, character, 0, 0)
      const source = loopSvg(moment, worn, fx?.kind)
      sprite = <Svg source={source} alt={`${character.name} Lv${level}`} width={128} height={112} isInteractive />
    }

    // Ambiguous-width glyphs (■ □ · — ★ ×) take two cells on CJK terminals and push
    // the lines; only single-width ones are used here.
    const header = [
      <Text key="fx" bold {...(fx === null ? {} : { color: FX_COLOR[fx.kind] })}>{fx === null ? ' ' : fx.label}</Text>,
      rankLine,
      repLine,
      goldLine,
    ]
    const done = lines.filter(line => line.isDone).length

    // The hint, and that there is more below: beside the small sprite there is room for
    // them next to the header, so a pane of seven rows still says how to use it.
    const guide = [hintFor(isOverflowing), isOverflowing ? <Text key="more" dimColor>{w.scrollHint}</Text> : null]

    return (
      <Box flexDirection="column">
        {isBeside ? (
          <Box key="beside" flexDirection="row">
            {sprite}
            <Box flexDirection="column" marginLeft={2}>
              {header}
              {guide}
            </Box>
          </Box>
        ) : (
          [sprite, ...header, ...guide]
        )}
        {menuButton('pet', w.pet, () => pet($))}
        {menuButton('trick', w.trick, () => trick($))}
        {menuButton('treat', w.treat(character.treat.name[lang], character.treat.price), () => treat($))}
        <Text dimColor>{w.bountyHeader(done, lines.length)}</Text>
        {lines.map(line => (
          <Text key={`quest-${line.quest.id}`} {...(line.isDone ? { color: '#86EFAC' } : { dimColor: true })}>
            {w.questLine(w.quests[line.quest.id] ?? line.quest.id, line.have, line.quest.target, line.quest.gold, line.isDone)}
          </Text>
        ))}
        <Text dimColor>{w.bonusLine(BOUNTY_BONUS, bounty.bonus)}</Text>
        <Text dimColor>{w.recent}</Text>
        {recent.length === 0 && <Text dimColor>{w.noRewards}</Text>}
        {recent.map(one => (
          <Text key={`recent-${one.at}-${one.kind}`} dimColor>
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
            ? `${item.name[lang]} ∙ ${worn.includes(item.id) ? w.takeOff : w.wear}`
            : `${item.name[lang]} $${commas(item.price)}`

          return menuButton(`shop-${item.id}`, label, () => shop($, id, level))
        })}
        {nextLocked !== undefined && <Text dimColor>{w.next(nextLocked.level, nextLocked.name[lang])}</Text>}
        {nextTrick !== undefined && <Text dimColor>{w.nextTrick(nextTrick.level, nextTrick.name[lang])}</Text>}
        <Text> </Text>
        {menuButton('rules', w.menu.rules, () => showView($, 'rules'))}
        {menuButton('status', w.menu.status, () => showView($, 'progress'))}
        {menuButton('switch', w.switchCharacter, () => openPicker($))}
        {close()}
      </Box>
    )
  })
}
