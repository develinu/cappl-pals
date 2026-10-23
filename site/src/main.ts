// The cappl-pals page. The pals are drawn by the mod's own composer (mod/hooks), so
// every face, act, trick and item here is the same as in the terminal pane.
import { actTicks, lookAt } from '../../mod/hooks/animations'
import { CHARACTERS, characterOf, learnedTricks, type Character, type Item } from '../../mod/hooks/characters'
import { PALETTE } from '../../mod/hooks/characters/art'
import { WORDS } from '../../mod/hooks/i18n'
import { BOUNTY_BONUS, RANK_LEVELS, RULES, dayOf, fameFor, questsOf, rankOf } from '../../mod/hooks/rules'
import { frame } from '../../mod/hooks/sprite'
import type { Activity, CharacterId, Language, ResultKind } from '../../mod/types'
import { COPY, type Copy } from './copy'

const TICK_MS = 250
// Median rep per active hour in the replay of real history (docs/reward-design.md).
const REP_PER_HOUR = 31.4
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector(selector) as T
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll(selector)] as T[]
const el = (tag: string, className = '', html = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html) node.innerHTML = html
  return node
}

// ── Language ───────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search)
// Storage can be off (private windows); the page works without it.
const stored = (key: string) => {
  try {
    return localStorage.getItem(`cappl-pals:${key}`)
  } catch {
    return null
  }
}
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(`cappl-pals:${key}`, value)
  } catch {
    // Not saved; the choice still holds for this visit.
  }
}
let lang: Language = (() => {
  const asked = params.get('lang') ?? stored('lang')
  if (asked === 'ko' || asked === 'en') return asked
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
})()
const copy = (): Copy => COPY[lang]
const words = () => WORDS[lang]

function pick(path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], copy())
}

// ── Sound: the mod's own effects, only after a click or a key ──────────────

let isSoundOn = stored('sound') !== 'off'
const cache = new Map<string, HTMLAudioElement>()
function sound(character: CharacterId, name: string) {
  if (!isSoundOn) return
  const key = `${character}/${name}`
  let audio = cache.get(key)
  if (audio === undefined) {
    audio = new Audio(`./sfx/${key}.wav`)
    audio.volume = 0.55
    cache.set(key, audio)
  }
  const shot = audio.cloneNode() as HTMLAudioElement
  shot.volume = audio.volume
  void shot.play().catch(() => undefined)
}

// ── Pals ───────────────────────────────────────────────────────────────────

const RGB = Object.fromEntries(Object.entries(PALETTE).map(([key, value]) => [key, [(value >> 16) & 255, (value >> 8) & 255, value & 255]]))

class Pal {
  character: CharacterId
  equipped: string[] = []
  activity: Activity = 'idle'
  level = 50
  act: { name: string; at: number } | null = null
  loop: string | null = null
  tick = Math.floor(Math.random() * 40)
  glowUntil = 0
  isVisible = true
  readonly size: 32 | 16
  private readonly ctx: CanvasRenderingContext2D
  private readonly image: ImageData

  constructor(readonly canvas: HTMLCanvasElement, character: CharacterId, size: 32 | 16 = 32) {
    this.character = character
    this.size = size
    canvas.width = size
    canvas.height = size === 32 ? 28 : 14
    this.ctx = canvas.getContext('2d')!
    this.image = this.ctx.createImageData(canvas.width, canvas.height)
    new IntersectionObserver(([entry]) => {
      this.isVisible = entry!.isIntersecting
    }).observe(canvas)
    this.draw()
  }

  get learned(): string[] {
    if (REDUCED) return []
    return learnedTricks(characterOf(this.character), this.level).map(trick => trick.act)
  }

  play(name: string, loop = false) {
    this.act = { name, at: this.tick }
    this.loop = loop ? name : null
    this.draw()
  }

  stop() {
    this.act = null
    this.loop = null
  }

  step() {
    this.tick += 1
    if (this.act !== null && this.tick - this.act.at >= actTicks(this.act.name)) {
      if (this.loop === this.act.name) this.act.at = this.tick
      else this.act = null
    }
    if (this.isVisible) this.draw()
  }

  draw() {
    const look = lookAt({
      character: this.character,
      activity: this.activity,
      tick: this.tick,
      learned: this.learned,
      isGlowing: Date.now() < this.glowUntil,
      ...(this.act === null ? {} : { act: { name: this.act.name, t: this.tick - this.act.at } }),
    })
    const rows = frame({ character: this.character, look, tick: this.tick, equipped: this.equipped, size: this.size })
    const data = this.image.data
    data.fill(0)
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const rgb = RGB[row[x]!]
        if (rgb === undefined) continue
        const p = (y * this.canvas.width + x) * 4
        data[p] = rgb[0]!
        data[p + 1] = rgb[1]!
        data[p + 2] = rgb[2]!
        data[p + 3] = 255
      }
    })
    this.ctx.putImageData(this.image, 0, 0)
  }
}

const pals = new Map<string, Pal>()
function palAt(name: string, character: CharacterId): Pal {
  const canvas = $<HTMLCanvasElement>(`canvas[data-pal="${name}"]`)
  const pal = new Pal(canvas, character, canvas.dataset.size === '16' ? 16 : 32)
  pals.set(name, pal)
  return pal
}
setInterval(() => {
  for (const pal of pals.values()) pal.step()
}, TICK_MS)

function toast(node: HTMLElement | null, text: string) {
  if (node === null) return
  node.textContent = text
  node.classList.remove('show')
  void node.offsetWidth
  node.classList.add('show')
}

// ── Hero ───────────────────────────────────────────────────────────────────

const brand = palAt('brand', 'cappl')
brand.level = 1
const heroLocki = palAt('hero-locki', 'locki')
const heroCappl = palAt('hero-cappl', 'cappl')
const appLocki = palAt('app-locki', 'locki')
const appCappl = palAt('app-cappl', 'cappl')
appLocki.equipped = ['gold-star', 'lasso', 'white-hat']
appCappl.equipped = ['sparrow', 'banjo', 'black-hat']

const petTimes = new Map<Pal, number[]>()
function pet(pal: Pal, bubble: HTMLElement | null) {
  const now = Date.now()
  const times = [...(petTimes.get(pal) ?? []).filter(at => now - at < 6000), now]
  petTimes.set(pal, times)
  const isMore = times.length >= 3
  pal.play(isMore ? 'petMore' : 'pet')
  sound(pal.character, 'pet')
  toast(bubble, isMore ? copy().play.petMoreToast : copy().play.petToast)
  if (isMore) petTimes.set(pal, [])
}
for (const [name, pal] of [['hero-locki', heroLocki], ['hero-cappl', heroCappl]] as const) {
  const button = $(`[data-pet="${name}"]`)
  button.addEventListener('click', () => pet(pal, button.parentElement!.querySelector('.toast')))
}

// ── Moods: a session played out, step by step ──────────────────────────────

type MoodState = { activity: Activity; act?: string }
const MOODS: Record<string, MoodState> = {
  prompt: { activity: 'idle', act: 'listen' },
  thinking: { activity: 'thinking' },
  reading: { activity: 'reading' },
  editing: { activity: 'editing' },
  testing: { activity: 'testing' },
  fail: { activity: 'idle', act: 'fail' },
  pass: { activity: 'idle', act: 'bigCelebrate' },
  waiting: { activity: 'waiting' },
  done: { activity: 'idle', act: 'dance1' },
  sleep: { activity: 'sleeping' },
}
const moodPal = palAt('mood', 'cappl')
moodPal.level = 35
let moodIndex = 0
let isMoodAuto = !REDUCED
let moodTimer = 0
let moodHeldUntil = 0
let isMoodVisible = false

function showMood(index: number) {
  moodIndex = index
  const step = copy().moods.steps[index]!
  const state = MOODS[step.key]!
  moodPal.activity = state.activity
  if (state.act !== undefined) moodPal.play(state.act, true)
  else moodPal.stop()
  $$('.term-steps button').forEach((button, i) => {
    button.setAttribute('aria-pressed', String(i === index))
    button.closest('li')!.classList.toggle('done', i < index)
  })
  $('.mood-label strong').textContent = step.label
  $('.mood-label span').textContent = step.look
  moodPal.canvas.setAttribute('aria-label', `${step.label}: ${step.look}`)
  const bar = $('.progress i')
  bar.style.transition = 'none'
  bar.style.width = '0%'
  if (isMoodAuto) {
    void bar.offsetWidth
    bar.style.transition = `width ${moodDuration(step.key)}ms linear`
    bar.style.width = '100%'
  }
}

function moodDuration(key: string) {
  const act = MOODS[key]!.act
  return act === undefined ? 2600 : Math.max(2600, actTicks(act) * TICK_MS * 1.5)
}

function scheduleMood() {
  clearTimeout(moodTimer)
  if (!isMoodAuto || !isMoodVisible) return
  const wait = Math.max(moodDuration(copy().moods.steps[moodIndex]!.key), moodHeldUntil - Date.now())
  moodTimer = window.setTimeout(() => {
    showMood((moodIndex + 1) % copy().moods.steps.length)
    scheduleMood()
  }, wait)
}

function renderSteps() {
  const list = $('[data-list="moods.steps"]')
  list.replaceChildren(
    ...copy().moods.steps.map((step, i) => {
      const item = el('li')
      const button = el('button', 'step') as HTMLButtonElement
      button.type = 'button'
      button.setAttribute('aria-pressed', String(i === moodIndex))
      button.append(el('span', 'line', ''), el('span', 'label', ''))
      button.querySelector('.line')!.textContent = step.line
      button.querySelector('.label')!.textContent = step.label
      button.addEventListener('click', () => {
        moodHeldUntil = Date.now() + 9000
        showMood(i)
        const key = step.key
        if (key === 'fail') sound(moodPal.character, 'fail')
        if (key === 'pass') sound(moodPal.character, 'levelup')
        if (key === 'prompt') sound(moodPal.character, 'coin')
        scheduleMood()
      })
      item.append(button)
      return item
    }),
  )
  showMood(moodIndex)
}

$$('[data-mood-pal]').forEach(button =>
  button.addEventListener('click', () => {
    moodPal.character = button.dataset.moodPal as CharacterId
    $$('[data-mood-pal]').forEach(other => other.setAttribute('aria-pressed', String(other === button)))
    showMood(moodIndex)
  }),
)
const autoButton = $('[data-action="mood-auto"]')
function setMoodAuto(isOn: boolean) {
  isMoodAuto = isOn
  autoButton.setAttribute('aria-pressed', String(isOn))
  autoButton.querySelector('.sr')!.textContent = isOn ? copy().moods.pause : copy().moods.resume
  showMood(moodIndex)
  scheduleMood()
}
autoButton.addEventListener('click', () => setMoodAuto(!isMoodAuto))
new IntersectionObserver(([entry]) => {
  isMoodVisible = entry!.isIntersecting
  scheduleMood()
}, { threshold: 0.35 }).observe($('#moods'))

// ── Play: pet, trick, treat and the wardrobe ───────────────────────────────

const playPal = palAt('play', 'locki')
const outfits: Record<CharacterId, string[]> = { locki: [], cappl: [] }
let trickTurn = 0
let isPlayVisible = false
const playToast = () => $('.stage-floor .toast')

function playCharacter(): Character {
  return characterOf(playPal.character)
}

function setPlayCharacter(id: CharacterId) {
  playPal.character = id
  playPal.equipped = outfits[id]
  playPal.stop()
  trickTurn = 0
  $$('[data-play-pal]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.playPal === id)))
  $('.play-stage .blurb').textContent = playCharacter().blurb[lang]
  $('.play-stage').dataset.who = id
  renderWardrobe()
  playPal.play('hello')
  updatePlayLabel()
}

function updatePlayLabel() {
  const character = playCharacter()
  const worn = character.items.filter(item => outfits[character.id].includes(item.id)).map(item => item.name[lang])
  const label = `${character.name}${worn.length > 0 ? ` · ${copy().play.wearing}: ${worn.join(', ')}` : ''}`
  playPal.canvas.setAttribute('aria-label', label)
}

const playActions: Record<string, () => void> = {
  pet: () => pet(playPal, playToast()),
  trick: () => {
    const tricks = [...playCharacter().tricks].reverse()
    const trick = tricks[trickTurn % tricks.length]!
    trickTurn += 1
    playPal.play(trick.act)
    sound(playPal.character, 'trick')
    toast(playToast(), copy().play.trickToast(trick.name[lang], trick.level))
  },
  treat: () => {
    const character = playCharacter()
    playPal.glowUntil = Date.now() + 20_000
    playPal.play('treat')
    sound(playPal.character, 'treat')
    toast(playToast(), copy().play.treatToast(character.treat.name[lang]))
  },
}
$$('[data-play]').forEach(button => button.addEventListener('click', () => playActions[button.dataset.play!]!()))
$$('[data-play-pal]').forEach(tab => tab.addEventListener('click', () => setPlayCharacter(tab.dataset.playPal as CharacterId)))
new IntersectionObserver(([entry]) => {
  isPlayVisible = entry!.isIntersecting
}, { threshold: 0.3 }).observe($('#play'))
document.addEventListener('keydown', event => {
  if (event.metaKey || event.ctrlKey || event.altKey || !isPlayVisible) return
  const target = event.target as HTMLElement
  if (target.closest('input, textarea, select, [contenteditable]')) return
  const action = { p: 'pet', t: 'trick', f: 'treat' }[event.key.toLowerCase()]
  if (action === undefined) return
  event.preventDefault()
  const button = $(`[data-play="${action}"]`)
  button.classList.add('pressed')
  setTimeout(() => button.classList.remove('pressed'), 160)
  playActions[action]!()
})

function renderWardrobe() {
  const character = playCharacter()
  const list = $('[data-list="wardrobe"]')
  list.replaceChildren(
    ...character.items.map(item => {
      const li = el('li')
      const button = el('button', 'item') as HTMLButtonElement
      button.type = 'button'
      button.setAttribute('aria-pressed', String(outfits[character.id].includes(item.id)))
      button.append(itemIcon(character, item), el('span', 'item-name'), el('span', 'item-meta'))
      button.querySelector('.item-name')!.textContent = item.name[lang]
      button.querySelector('.item-meta')!.textContent = copy().play.itemMeta(item.level, item.price.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US'))
      button.addEventListener('click', () => {
        const worn = outfits[character.id]
        const isOn = worn.includes(item.id)
        const slotOf = (id: string) => character.items.find(one => one.id === id)?.slot
        outfits[character.id] = isOn ? worn.filter(id => id !== item.id) : [...worn.filter(id => slotOf(id) !== item.slot), item.id]
        playPal.equipped = outfits[character.id]
        if (!isOn) {
          playPal.play('buy')
          sound(character.id, 'equip')
        }
        renderWardrobe()
        updatePlayLabel()
      })
      li.append(button)
      return li
    }),
  )
}

// A small picture of the item on the pal's 16 px sprite.
function itemIcon(character: Character, item: Item): HTMLCanvasElement {
  const canvas = el('canvas', 'item-pic') as HTMLCanvasElement
  canvas.setAttribute('aria-hidden', 'true')
  canvas.width = 16
  canvas.height = 14
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(16, 14)
  frame({ character: character.id, look: {}, tick: 0, equipped: [item.id], size: 16 }).forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const rgb = RGB[row[x]!]
      if (rgb === undefined) continue
      const p = (y * 16 + x) * 4
      image.data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], p)
    }
  })
  ctx.putImageData(image, 0, 0)
  return canvas
}

// ── Rewards ────────────────────────────────────────────────────────────────

const ORDER: ResultKind[] = ['verify', 'comeback', 'check', 'commit', 'pr', 'merge', 'plan', 'break', 'daily']
function renderRewards() {
  $('[data-list="rewards.noneItems"]').replaceChildren(...copy().rewards.noneItems.map(item => el('li', '', escapeHtml(item))))
  $('[data-list="rewards.rows"]').replaceChildren(
    ...ORDER.map(kind => {
      const rule = RULES[kind]
      const row = el('tr')
      const name = el('th') as HTMLTableCellElement
      name.scope = 'row'
      name.textContent = words().rewards[kind]
      const when = el('td', 'when', copy().rewards.when[kind] ?? '')
      const rep = el('td', 'num rep', rule.fame > 0 ? `+${rule.fame}` : '—')
      const gold = el('td', 'num gold', `+${rule.dust}`)
      row.append(name, when, rep, gold)
      return row
    }),
  )
}

// ── Gold ───────────────────────────────────────────────────────────────────

const GOLD_PALS: Record<string, { who: CharacterId; act: string; equipped: string[] }> = {
  chest: { who: 'cappl', act: 'bigCelebrate', equipped: ['sparrow', 'black-hat'] },
  bounty: { who: 'locki', act: 'petMore', equipped: ['gold-star'] },
  lucky: { who: 'cappl', act: 'lucky', equipped: ['banjo'] },
  treat: { who: 'locki', act: 'treat', equipped: ['white-hat'] },
}
function renderGold() {
  const list = $('[data-list="gold.cards"]')
  const isFirst = list.childElementCount === 0
  if (isFirst) {
    list.replaceChildren(
      ...copy().gold.cards.map(card => {
        const li = el('li', `gold-card px-box ${card.key}`)
        const canvas = el('canvas', 'pal') as HTMLCanvasElement
        canvas.dataset.pal = `gold-${card.key}`
        canvas.dataset.size = '32'
        canvas.setAttribute('aria-hidden', 'true')
        li.append(canvas, el('h3'), el('p', 'amount'), el('p', 'body'))
        return li
      }),
    )
    for (const card of copy().gold.cards) {
      const spec = GOLD_PALS[card.key]!
      const pal = palAt(`gold-${card.key}`, spec.who)
      pal.equipped = spec.equipped
      pal.play(spec.act, true)
    }
  }
  copy().gold.cards.forEach((card, i) => {
    const li = list.children[i]!
    li.querySelector('h3')!.textContent = card.title
    li.querySelector('.amount')!.innerHTML = `${escapeHtml(card.amount)} <span>${escapeHtml(copy().gold.unit)}</span>`
    li.querySelector('.body')!.textContent = card.body
  })
  const today = dayOf(Date.now(), -new Date().getTimezoneOffset())
  const quests = questsOf(today)
  $('[data-list="gold.today"]').replaceChildren(
    ...quests.map(quest => {
      const li = el('li')
      li.append(el('span', 'quest'), el('span', 'reward'))
      li.querySelector('.quest')!.textContent = words().quests[quest.id] ?? quest.id
      li.querySelector('.reward')!.textContent = `+${quest.gold} ${copy().gold.unit}`
      return li
    }),
    (() => {
      const li = el('li', 'bonus')
      li.textContent = copy().gold.bonus(BOUNTY_BONUS)
      return li
    })(),
  )
}

// ── The trail ──────────────────────────────────────────────────────────────

const trailPals: Record<CharacterId, Pal> = { locki: palAt('trail-locki', 'locki'), cappl: palAt('trail-cappl', 'cappl') }
let trailLevel = 35
let trailTimer = 0

function wornAt(character: Character, level: number): string[] {
  const best = new Map<string, Item>()
  // Backdrops stay in the list but off the pals, so the two stand side by side cleanly.
  for (const item of character.items) if (item.level <= level && item.slot !== 'stage') best.set(item.slot, item)
  return [...best.values()].map(item => item.id)
}

function renderTrail(level: number, isNewLevel: boolean) {
  const previous = trailLevel
  trailLevel = level
  const rank = rankOf(level)
  $('.trail-level .lv').textContent = `Lv${level}`
  $('.trail-level .rank').textContent = words().ranks[rank]!
  $('.trail-hours').textContent = copy().trail.hours(Math.round(fameFor(level) / REP_PER_HOUR))
  const input = $<HTMLInputElement>('[data-trail]')
  input.value = String(level)
  input.style.setProperty('--fill', `${((level - 1) / 49) * 100}%`)
  input.setAttribute('aria-valuetext', `Lv${level} ${words().ranks[rank]}`)
  for (const character of CHARACTERS) {
    const pal = trailPals[character.id]
    pal.level = level
    pal.equipped = wornAt(character, level)
  }
  const chips = (kind: 'tricks' | 'items') =>
    CHARACTERS.flatMap(character => {
      const group = el('li', `chip-group ${character.id}`)
      const head = el('span', 'chip-who')
      head.textContent = character.name
      const entries = kind === 'tricks' ? character.tricks : character.items
      const row = el('span', 'chip-row')
      for (const entry of entries) {
        const isOpen = entry.level <= level
        // Just unlocked by moving the slider up.
        const isFresh = isNewLevel && isOpen && entry.level > previous
        const chip = el('span', `chip${isOpen ? ' open' : ''}${isFresh ? ' fresh' : ''}`)
        chip.textContent = entry.name[lang]
        if (!isOpen) {
          const lock = el('small')
          lock.textContent = copy().trail.locked(entry.level)
          chip.append(lock)
        }
        row.append(chip)
      }
      group.append(head, row)
      return [group]
    })
  $('[data-list="trail.tricks"]').replaceChildren(...chips('tricks'))
  $('[data-list="trail.items"]').replaceChildren(...chips('items'))
  if (isNewLevel && !REDUCED) {
    clearTimeout(trailTimer)
    trailTimer = window.setTimeout(() => {
      for (const character of CHARACTERS) {
        const latest = learnedTricks(character, level).at(-1)
        trailPals[character.id].play(latest?.act ?? 'hello')
      }
    }, 180)
  }
}

function renderTicks() {
  $('[data-list="trail.ticks"]').replaceChildren(
    ...RANK_LEVELS.map(level => {
      const tick = el('button', 'tick') as HTMLButtonElement
      tick.type = 'button'
      tick.tabIndex = -1
      tick.style.left = `${((level - 1) / 49) * 100}%`
      tick.textContent = String(level)
      tick.addEventListener('click', () => renderTrail(level, true))
      return tick
    }),
  )
}
$<HTMLInputElement>('[data-trail]').addEventListener('input', event => renderTrail(Number((event.target as HTMLInputElement).value), true))

// ── Fair play, install, copy buttons, tabs ─────────────────────────────────

const ICONS = [
  '<path d="M20 6 9 17l-5-5"/>',
  '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  '<circle cx="9" cy="9" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.4 18.1"/><path d="M8 7h1.5v4"/>',
  '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  '<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 21v-5h5"/><path d="M21 3v5h-5"/>',
  '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="m7 9 2 2-2 2"/><path d="M11 13h3"/>',
]
function renderFair() {
  $('[data-list="fair.cards"]').replaceChildren(
    ...copy().fair.cards.map((card, i) => {
      const li = el('li', 'fair-card px-box', `<svg class="ico big" viewBox="0 0 24 24" aria-hidden="true">${ICONS[i] ?? ''}</svg>`)
      li.append(el('h3'), el('p'))
      li.querySelector('h3')!.textContent = card.title
      li.querySelector('p')!.textContent = card.body
      return li
    }),
  )
}

function renderLists() {
  $('[data-list="hero.badges"]').replaceChildren(
    ...copy().hero.badges.map(badge => {
      const li = el('li', '', '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/></svg>')
      li.append(document.createTextNode(badge))
      return li
    }),
  )
  $('[data-list="install.desktopSteps"]').replaceChildren(...copy().install.desktopSteps.map(step => el('li', '', step)))
}

$$<HTMLButtonElement>('[data-copy]').forEach(button =>
  button.addEventListener('click', async () => {
    const code = button.parentElement!.querySelector('code')!.textContent ?? ''
    try {
      await navigator.clipboard.writeText(code)
      button.textContent = copy().install.copied
      button.classList.add('done')
      setTimeout(() => {
        button.textContent = copy().install.copy
        button.classList.remove('done')
      }, 1600)
    } catch {
      const range = document.createRange()
      range.selectNodeContents(button.parentElement!.querySelector('code')!)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
    }
  }),
)

const tabs = $$<HTMLButtonElement>('[data-tab]')
function selectTab(tab: HTMLButtonElement) {
  for (const other of tabs) {
    const isOn = other === tab
    other.setAttribute('aria-selected', String(isOn))
    other.tabIndex = isOn ? 0 : -1
    $(`#${other.getAttribute('aria-controls')}`).hidden = !isOn
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab))
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!
    selectTab(next)
    next.focus()
  })
})

// ── Nav: language, sound, current section ──────────────────────────────────

const soundButton = $('[data-action="sound"]')
function renderSound() {
  soundButton.setAttribute('aria-pressed', String(isSoundOn))
  soundButton.querySelector('.sr')!.textContent = isSoundOn ? copy().nav.soundOn : copy().nav.soundOff
  soundButton.title = soundButton.querySelector('.sr')!.textContent ?? ''
}
soundButton.addEventListener('click', () => {
  isSoundOn = !isSoundOn
  store('sound', isSoundOn ? 'on' : 'off')
  renderSound()
  if (isSoundOn) sound('cappl', 'coin')
})

$('[data-action="lang"]').addEventListener('click', () => {
  lang = lang === 'en' ? 'ko' : 'en'
  store('lang', lang)
  const url = new URL(location.href)
  url.searchParams.set('lang', lang)
  history.replaceState(null, '', url)
  render()
})

const sections = $$('main section[id]')
const links = $$<HTMLAnchorElement>('.nav-links a')
const sectionObserver = new IntersectionObserver(
  entries => {
    for (const entry of entries) if (entry.isIntersecting) for (const link of links) {
      if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
  },
  { rootMargin: '-45% 0px -50% 0px' },
)
sections.forEach(section => sectionObserver.observe(section))

// Sections ease in as they arrive.
const revealer = new IntersectionObserver(
  entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('in')
      revealer.unobserve(entry.target)
    }
  },
  { threshold: 0.12 },
)
$$('.section-head, .px-box, .fair-card').forEach(node => {
  node.classList.add('reveal')
  revealer.observe(node)
})

// ── The night sky ──────────────────────────────────────────────────────────

function sky() {
  const canvas = $<HTMLCanvasElement>('canvas.stars')
  const ctx = canvas.getContext('2d')!
  let stars: { x: number; y: number; s: number; phase: number; speed: number }[] = []
  const resize = () => {
    const ratio = Math.min(2, devicePixelRatio || 1)
    canvas.width = innerWidth * ratio
    canvas.height = innerHeight * ratio
    const count = Math.round((innerWidth * innerHeight) / 9000)
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      s: Math.ceil(Math.random() * 3) * ratio,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.6,
    }))
  }
  const paint = (time: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const star of stars) {
      const glow = REDUCED ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((time / 1000) * star.speed + star.phase))
      ctx.fillStyle = `rgba(255, 243, 220, ${glow * (star.s > 2 ? 0.95 : 0.55)})`
      ctx.fillRect(Math.round(star.x), Math.round(star.y), star.s, star.s)
    }
  }
  resize()
  addEventListener('resize', () => {
    resize()
    paint(performance.now())
  })
  if (REDUCED) {
    paint(0)
    return
  }
  let last = 0
  const loop = (time: number) => {
    if (time - last > 66 && !document.hidden) {
      paint(time)
      last = time
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

// ── Putting the words in ───────────────────────────────────────────────────

function render() {
  document.documentElement.lang = lang
  document.title = copy().meta.title
  $('meta[name="description"]').setAttribute('content', copy().meta.description)
  for (const node of $$('[data-t]')) node.textContent = String(pick(node.dataset.t!) ?? '')
  for (const node of $$('[data-t-html]')) node.innerHTML = String(pick(node.dataset.tHtml!) ?? '')
  for (const node of $$('[data-t-label]')) node.setAttribute('aria-label', String(pick(node.dataset.tLabel!) ?? ''))
  $$('[data-pet]').forEach((button, i) => button.setAttribute('aria-label', copy().hero.pet(i === 0 ? 'LOCKI' : 'CAPPL')))
  renderLists()
  renderSteps()
  renderRewards()
  renderGold()
  renderFair()
  renderTicks()
  renderTrail(trailLevel, false)
  setPlayCharacter(playPal.character)
  renderSound()
  autoButton.querySelector('.sr')!.textContent = isMoodAuto ? copy().moods.pause : copy().moods.resume
  const video = $<HTMLVideoElement>('video')
  if (video.paused) {
    const suffix = lang === 'ko' ? 'ko' : 'en'
    if (!video.currentSrc.endsWith(`demo-${suffix}.mp4`)) {
      video.poster = `./media/poster-${suffix}.png`
      video.querySelector('source')!.src = `./media/demo-${suffix}.mp4`
      video.load()
    }
  }
  const storeIos = $<HTMLAnchorElement>('[data-store="ios"]')
  storeIos.href = lang === 'ko' ? 'https://apps.apple.com/kr/app/cappl/id6761328898' : 'https://apps.apple.com/app/id6761328898'
  const storeAndroid = $<HTMLAnchorElement>('[data-store="android"]')
  storeAndroid.href = `https://play.google.com/store/apps/details?id=com.ksh.cappl${lang === 'ko' ? '&hl=ko' : ''}`
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
}

sky()
render()
setMoodAuto(isMoodAuto)

// A hello from both pals as the page opens.
setTimeout(() => {
  const hello = lang === 'ko' ? ['하우디!', '반가워!'] : ['Howdy!', 'Hey, partner!']
  ;[heroLocki, heroCappl].forEach((pal, i) => {
    setTimeout(() => {
      pal.play('hello')
      toast($$('.hero-stage .pal-slot .toast')[i] ?? null, hello[i]!)
    }, i * 450)
  })
}, 700)

