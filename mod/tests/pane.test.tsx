import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { WORDS } from '../hooks/i18n'
import { dayOf, questsOf } from '../hooks/rules'

const PANE = {
  plugin: 'cappl-pals',
  component: 'Pane',
  requestId: 'cappl-pals',
  props: {
    title: 'CAPPL',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const NOW = Date.UTC(2026, 9, 23, 3)
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 190 }, args: '' } as const
const LOCKI = { character: 'locki' }

function engine(on: On, outputs: Record<string, string> = {}) {
  // Nothing sits under the plugin; these hooks stand in for the engine.
  on('session.id', () => ({ value: 's1' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => {
    const command = 'command' in e ? String(e.command) : ''

    return { result: {}, text: outputs[command] ?? '' }
  })
}

// A store file shared with other sessions; the test edits it to stand in for their writes.
function sharedStore(on: On, data: Map<string, unknown>) {
  on('store.get', (_, e) => ({ value: data.get(e.key) }))
  on('store.set', (_, e) => {
    data.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    data.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...data.keys()] }))
}

const text = async (ui: { find: (q: object) => Promise<{ text?: string } | undefined> }, pattern: RegExp) =>
  (await ui.find({ type: 'Text', text: pattern }))?.text

test('the first time, the pane asks who to ride with; picking shows that character', async ($, on) => {
  engine(on)
  mock.store(on)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /^Pick your partner/)).toBe('Pick your partner')
    expect((await ui.find({ key: 'pick-locki' }))?.text).toMatch(/Pick RIKI/)
    expect((await ui.find({ key: 'pick-cappl' }))?.text).toMatch(/Pick CARO/)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'pick-cappl' })
  expect(await text(ui, /Lv1/)).toBe('CARO Lv1 Greenhorn')
  expect((await ui.find({ key: 'shop-round-specs' }))?.text).toMatch(/Round specs \$30/)
  // "Switch character" brings the picker back, marking who rides now.
  await ui.press({ key: 'switch' })
  expect(await text(ui, /riding now/)).toBe('2. CARO (riding now)')
  await ui.press({ key: 'pick-locki' })
  expect(await text(ui, /Lv1/)).toBe('RIKI Lv1 Greenhorn')
  await ui.unmount()
})

test('/cappl-pick picks by name, and says which names exist', async ($, on) => {
  engine(on)
  mock.store(on)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'cappl-pick', ...RUN, args: 'CARO' })).text).toBe('CARO is riding with you now.')
  expect((await $.command.run({ command: 'cappl-status', ...RUN })).text).toMatch(/^CARO Lv1 Greenhorn/)
  expect((await $.command.run({ command: 'cappl-pick', ...RUN, args: 'bob' })).text).toMatch(/locki, cappl/)
})

test('editing, passing a test and committing shows rep and gold in the pane', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -q -m fix' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // Bullseye (5, $3) + claim staked (3, $2; tested 5, $3; small 2) = 15 rep, $8
    expect(await text(ui, /^Rep/)).toMatch(/15\/\d+$/)
    expect(await text(ui, /^Gold/)).toMatch(/^Gold \$8/)
    expect(await text(ui, /Lv/)).toBe('RIKI Lv1 Greenhorn')
    expect(await text(ui, /^Claim staked/)).toBe('Claim staked +10 $5')
    await ui.unmount()
  }
})

test('one command can test, commit and open a pull request, and each counts', async ($, on) => {
  const all = 'pytest -q && git commit -q -m fix && gh pr create --fill'
  engine(on, { [all]: '12 passed in 0.3s\n[main 1a2b3c4] fix\nhttps://github.com/o/r/pull/7' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: all })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Bullseye/)).toBe('Bullseye +5 $3')
  expect(await text(ui, /^Claim staked/)).toBe('Claim staked +10 $5')
  expect(await text(ui, /^Poster up/)).toBe('Poster up +4 $3')
  await ui.unmount()
})

test('every control is a button on its own row, driven by click or keyboard; the rules and my progress open from the menu', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  const idle = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(idle, /^Click, or ctrl\+x Tab/)).toBe('Click, or ctrl+x Tab for the keyboard')
  await idle.unmount()
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true }, surface: 'terminal' })
  expect(await text(ui, /^⇅ move/)).toBe('⇅ move ∙ Enter select ∙ Esc leave')
  expect(await ui.find({ key: 'keys' })).toBeUndefined()
  for (const [key, label] of [['pet', 'Pet'], ['trick', 'Trick'], ['rules', 'Rules and bounties'], ['status', 'My progress'], ['switch', 'Switch character']]) {
    const button = await ui.find({ key: key! })
    expect([key, button?.text, button?.props.hotkey]).toEqual([key, label, undefined])
  }
  expect(await text(ui, /^▸ Today's bounties/)).toBe("▸ Today's bounties 0/3")

  await ui.press({ key: 'rules' })
  expect(await text(ui, /^How rewards work/)).toBe('How rewards work')
  expect(await text(ui, /first passing test after you edit/)).toMatch(/\(today 1\)$/)
  expect(await text(ui, /^\s*Three a day/)).toBeDefined()
  // One way back, at the top.
  expect(await ui.find({ key: 'back-below' })).toBeUndefined()
  await ui.press({ key: 'back' })
  expect(await text(ui, /Lv1/)).toBe('RIKI Lv1 Greenhorn')

  await ui.press({ key: 'status' })
  expect(await text(ui, /^My progress/)).toBe('My progress')
  expect(await text(ui, /Bullseye ×1/)).toBe('  Bullseye ×1')
  expect(await text(ui, /rep to Lv2/)).toBe('25 rep to Lv2')
  await ui.press({ key: 'back' })
  await ui.press({ key: 'switch' })
  expect(await text(ui, /^Pick your partner/)).toBe('Pick your partner')
  expect((await ui.find({ key: 'pick-cappl' }))?.text).toBe('Pick CARO')
  await ui.press({ key: 'pick-cappl' })
  expect(await text(ui, /Lv1/)).toBe('CARO Lv1 Greenhorn')
  await ui.unmount()

  // The desktop draws the same views with its native buttons and no keyboard hints.
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await text(desktop, /^Click, or|^⇅|^Tab move/)).toBeUndefined()
  await desktop.press({ key: 'rules' })
  expect(await text(desktop, /^How rewards work/)).toBe('How rewards work')
  await desktop.press({ key: 'back' })
  await desktop.press({ key: 'status' })
  expect(await text(desktop, /^My progress/)).toBe('My progress')
  await desktop.unmount()

  const rules = await $.command.run({ ...RUN, command: 'cappl-rules' })
  expect(rules.text).toMatch(/^How rewards work: /)
  expect(rules.text).toMatch(/- Bullseye: \+5 rep ∙ \$3 ∙ full value 12 a day ∙ today 1\n  The first passing test/)
  expect(rules.text).toMatch(/▸ Bounties\n- Three a day/)
})

test('running the same test again earns nothing more', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  for (let i = 0; i < 5; i += 1) await $.tool.call({ tool: 'Bash', command: 'pytest -q' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Rep/)).toMatch(/ 5\/\d+$/)
  await ui.unmount()
})

test('other sessions add up; buying spends gold and each character keeps its own wardrobe', async ($, on) => {
  engine(on)
  mock.store(on, {
    ...LOCKI,
    'ledger:other': { fame: 400, dust: 120, days: {}, lastAt: NOW - 60_000, activeSince: NOW - 600_000 },
  })
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /Lv/)).toMatch(/^RIKI Lv6 Stable Hand$/)
  await ui.press({ key: 'shop-aviators' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$90/)
  expect((await ui.find({ key: 'shop-aviators' }))?.text).toMatch(/Aviator shades ∙ take off/)

  await ui.press({ key: 'switch' })
  await ui.press({ key: 'pick-cappl' })
  expect((await ui.find({ key: 'shop-round-specs' }))?.text).toMatch(/Round specs \$30/)
  await ui.press({ key: 'shop-round-specs' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$60/)
  await ui.press({ key: 'shop-coffee' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$60/)

  await ui.press({ key: 'switch' })
  await ui.press({ key: 'pick-locki' })
  expect((await ui.find({ key: 'shop-aviators' }))?.text).toMatch(/take off/)
  await ui.unmount()
})

test('folding quiet ledgers into the archive keeps the totals', async ($, on) => {
  engine(on)
  mock.store(on, {
    ...LOCKI,
    'ledger:old': { fame: 300, dust: 90, days: {}, lastAt: NOW - 3 * 86_400_000, activeSince: 0 },
    'ledger:recent': { fame: 100, dust: 30, days: {}, lastAt: NOW - 60_000, activeSince: 0 },
  })
  const clock = mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(1_000)

  // The purchase reads the totals after the fold; a fold that kept the old ledger would leave 160.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'shop-aviators' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$90/)
  await ui.unmount()
})

test("another session's rewards, purchases and character show up in an open pane", async ($, on) => {
  engine(on)
  const file = new Map<string, unknown>([
    ['character', 'locki'],
    ['ledger:other', { fame: 400, dust: 120, days: {}, lastAt: NOW - 60_000, activeSince: NOW - 600_000 }],
  ])
  sharedStore(on, file)
  const clock = mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$120/)

  const strike = { at: NOW + 500, kind: 'merge', fame: 15, dust: 10, rate: 1 }
  file.set('ledger:other', { fame: 415, dust: 130, days: {}, lastAt: NOW, activeSince: NOW - 600_000, recent: [strike] })
  file.set('wallet', { spent: 50, owned: ['locki/aviators'], equipped: ['locki/aviators'] })
  await clock.advance(2_000)

  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$80/)
  expect((await ui.find({ key: 'shop-aviators' }))?.text).toMatch(/take off/)
  expect(await text(ui, /^Gold strike/)).toBe('Gold strike +15 $10')

  file.set('character', 'cappl')
  await clock.advance(2_000)
  expect(await text(ui, /Lv/)).toMatch(/^CARO Lv/)
  await ui.unmount()
})

function paneEngine(on: On, state: { isOpen: boolean; opens: number; closes: string[]; rows?: number }) {
  on('session.id', () => ({ value: 's1' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', (_, e) => {
    state.isOpen = true
    state.opens += 1
    state.rows = e.rows
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    state.isOpen = false
    state.closes.push(e.origin.kind)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: state.isOpen ? [{ id: 'cappl-pals', title: 'CAPPL', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
}

test('/cappl opens and closes the pane, and a closed pane stays closed next session', async ($, on) => {
  const state: { isOpen: boolean; opens: number; closes: string[]; rows?: number } = { isOpen: false, opens: 0, closes: [] }
  paneEngine(on, state)
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(state.isOpen).toBe(true)
  expect((await $.command.run({ command: 'cappl', ...RUN })).text).toMatch(/^Closed/)
  expect(state.isOpen).toBe(false)
  expect((await $.command.run({ command: 'cappl', ...RUN })).text).toMatch(/^Opened/)
  expect(state.isOpen).toBe(true)
  // Opened by /cappl above the prompt, the pane asks for room for the shop too.
  expect(state.rows).toBe(30)
  await $.command.run({ command: 'cappl', ...RUN })

  const opensBefore = state.opens
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(state.opens).toBe(opensBefore)
})

test('the close button in the pane closes it', async ($, on) => {
  const state: { isOpen: boolean; opens: number; closes: string[]; rows?: number } = { isOpen: false, opens: 0, closes: [] }
  paneEngine(on, state)
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'close' })
  expect(state.isOpen).toBe(false)
  expect(state.closes).toEqual(['plugin'])
  await ui.unmount()
})

test('a low pane above the prompt puts the header beside the small sprite', async ($, on) => {
  engine(on)
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const bodyColumns of [48, 34]) {
    const props = { ...PANE.props, placement: 'inline', bodyColumns, scroll: { offset: 0, bodyRows: 10 } } as const
    const ui = await $.ui.mount({ ...PANE, props, surface: 'terminal' })
    expect((await ui.find({ key: 'sprite' }))?.props.rows).toBe(7)
    const beside = await ui.find({ key: 'beside' })
    expect(beside?.props.flexDirection).toBe('row')
    expect(JSON.stringify(beside?.children)).toMatch(/"Raster"/)
    expect(beside?.text).toMatch(/RIKI Lv1 Greenhorn/)
    expect(beside?.text).toMatch(/Rep [▰▱]/)
    expect(beside?.text).toMatch(/Gold \$0/)
    // A low pane says there is more below, beside the sprite.
    expect(beside?.text).toMatch(/▾ More below/)
    await ui.unmount()
  }

  // Too narrow to sit beside: the header goes under the small sprite.
  const narrow = { ...PANE.props, placement: 'inline', bodyColumns: 33, scroll: { offset: 0, bodyRows: 10 } } as const
  let ui = await $.ui.mount({ ...PANE, props: narrow, surface: 'terminal' })
  expect((await ui.find({ key: 'sprite' }))?.props.rows).toBe(7)
  expect(await ui.find({ key: 'beside' })).toBeUndefined()
  await ui.unmount()

  // Wide and tall: the big sprite, no scroll hint.
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'sprite' }))?.props.rows).toBe(14)
  expect(await text(ui, /▾/)).toBeUndefined()
  await ui.unmount()
})

test('a reward flashes a line in the pane, and /cappl-sound cycles normal → quiet → off', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^✦ Bullseye/)).toBe('✦ Bullseye +5 rep')
  await ui.unmount()

  expect((await $.command.run({ command: 'cappl-sound', ...RUN })).text).toMatch(/^Sound effects: quiet/)
  expect((await $.command.run({ command: 'cappl-sound', ...RUN })).text).toMatch(/^Sound effects: off/)
  expect((await $.command.run({ command: 'cappl-sound', ...RUN })).text).toMatch(/^Sound effects: normal/)
})

test('Korean, from the language option or from the Claude Code setting', { options: { language: 'ko' } }, async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /Lv/)).toBe('RIKI Lv1 새내기')
  expect(await text(ui, /^골드/)).toMatch(/^골드 \$3/)
  expect((await ui.find({ key: 'shop-aviators' }))?.text).toMatch(/보안관 선글라스 \$30/)
  expect(await text(ui, /^✦ 과녁 명중/)).toBe('✦ 과녁 명중 +5 명성')
  await ui.unmount()
  expect((await $.command.run({ command: 'cappl-rules', ...RUN })).text).toMatch(/UTC/)
})

test('auto language follows Claude Code’s language setting', async ($, on) => {
  engine(on)
  on('settings.read', () => ({ value: { language: 'Korean' } }))
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'cappl-status', ...RUN })).text).toMatch(/^RIKI Lv1 새내기 · 명성 0/)
})

// $.state kept per session: after /clear the new session id starts with empty values.
function sessionState(on: On, session: { id: string }) {
  const bySession = new Map<string, Map<string, { value: unknown; version: number }>>()
  const slot = (e: { plugin: string; key: string; id?: string }) => {
    if (!bySession.has(session.id)) bySession.set(session.id, new Map())
    const values = bySession.get(session.id)!
    const name = `${e.plugin}/${e.key}/${e.id ?? ''}`

    return { values, name, current: values.get(name) ?? { value: undefined, version: 0 } }
  }
  on('state.get', (_, e) => ({ value: slot(e).current }))
  on('state.set', (_, e) => {
    const { values, name, current } = slot(e)
    if (e.ifVersion !== undefined && e.ifVersion !== current.version) return { value: { isSet: false, version: current.version } }
    values.set(name, { value: e.value, version: current.version + 1 })

    return { value: { isSet: true, version: current.version + 1 } }
  })
}

function sessionEngine(on: On) {
  const session = { id: 's1' }
  on('session.id', () => ({ value: session.id }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', (_, e) => ({ result: {}, text: 'command' in e && e.command === 'pytest -q' ? '12 passed in 0.3s' : '' }))
  on('classic.SessionStart', () => ({}))
  sessionState(on, session)
  const store = new Map<string, unknown>([
    ['character', 'cappl'],
    ['ledger:s1', { fame: 400, dust: 120, days: {}, lastAt: NOW - 60_000, activeSince: NOW - 600_000 }],
    ['wallet', { owned: ['cappl/round-specs'], equipped: ['cappl/round-specs'], spent: 50 }],
  ])
  sharedStore(on, store)
  mock.clock(on, { now: NOW })

  return { session, store }
}

test('after /clear the pane keeps rep, gold, items and the character; new rewards go to the new ledger', async ($, on) => {
  const { session, store } = sessionEngine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // /clear sends no session.start, only SessionStart with source "clear".
  session.id = 's2'
  await $.classic.SessionStart({ source: 'clear' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /Lv/)).toBe('CARO Lv6 Stable Hand')
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$70/)
  expect((await ui.find({ key: 'shop-round-specs' }))?.text).toMatch(/Round specs ∙ take off/)
  await ui.unmount()

  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  expect(store.get('ledger:s2')).toMatchObject({ fame: 5 })
  expect(store.get('ledger:s1')).toMatchObject({ fame: 400 })
})

test('when the session id stays the same, as after /compact, the ledger stays put', async ($, on) => {
  const { store } = sessionEngine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.classic.SessionStart({ source: 'compact' })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  expect(store.get('ledger:s1')).toMatchObject({ fame: 405 })
  expect([...store.keys()].filter(key => key.startsWith('ledger:'))).toEqual(['ledger:s1'])
})

test('on the desktop the pal is an animated SVG: blinks while idle, taps while working, sparkles at a reward', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const source = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    await ui.unmount()
    expect(svg?.props.isInteractive).toBe(true)
    return String(svg?.props.source)
  }
  const idle = await source()
  // SMIL steps between frames on its own, with no redraw from the mod.
  expect(idle).toMatch(/<animate attributeName="visibility"[^>]*repeatCount="indefinite"/)
  expect(idle.length).toBeLessThan(131_072)
  expect((idle.match(/<g /g) ?? []).length).toBeGreaterThan(1)

  await $.turn.start({ text: 'go', turnId: 't1' })
  const working = await source()
  expect(working).not.toBe(idle)
  expect(working).toMatch(/dur="4s"/)

  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  expect(await source()).not.toBe(working)
})

const dayNow = () => dayOf(NOW, -new Date().getTimezoneOffset())

// Stands in for the session's $.state so the test can read what the plugin set.
function stateSpy(on: On) {
  const values = new Map<string, { value: unknown; version: number }>()
  on('state.get', (_, e) => ({ value: values.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_, e) => {
    const version = (values.get(e.key)?.version ?? 0) + 1
    values.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  return {
    value: (key: string) => values.get(key)?.value,
    act: () => (values.get('act')?.value as { name: string } | null | undefined)?.name,
  }
}

test('the pal follows the session: thinking in a turn, asleep after five quiet minutes, waving at a permission prompt', async ($, on) => {
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}))
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  const spy = stateSpy(on)
  const activity = async () => spy.value('activity') ?? 'idle'

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(await activity()).toBe('idle')
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await activity()).toBe('thinking')
  await $.classic.Notification({ message: 'Claude needs your permission', notification_type: 'permission_prompt' })
  expect(await activity()).toBe('waiting')
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1000, reason: 'answer' } as never)
  expect(await activity()).toBe('idle')
  await clock.advance(6 * 60_000)
  expect(await activity()).toBe('sleeping')
})

test('playing with the pal mid-turn keeps it at work; a pet wakes it from a nap', async ($, on) => {
  engine(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  const spy = stateSpy(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.advance(6 * 60_000)
  expect(spy.value('activity')).toBe('sleeping')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'pet' })
  expect(spy.value('activity')).toBe('idle')
  await $.turn.start({ text: 'go', turnId: 't1' })
  await ui.press({ key: 'trick' })
  await ui.press({ key: 'pet' })
  expect(spy.value('activity')).toBe('thinking')
  await ui.unmount()
})

test('pet, trick and treat: each plays its act and counts toward the bounties; a treat costs gold', async ($, on) => {
  engine(on)
  // Level 3 knows the first trick (wave at Lv2).
  mock.store(on, { ...LOCKI, 'ledger:other': { fame: 100, dust: 50, days: {}, lastAt: NOW - 60_000, activeSince: NOW - 600_000 } })
  mock.clock(on, { now: NOW })
  const spy = stateSpy(on)
  const act = async () => spy.act()

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'pet' })
  expect(await act()).toBe('pet')
  await ui.press({ key: 'trick' })
  expect(await act()).toBe('wave')
  await ui.press({ key: 'treat' })
  expect(await act()).toBe('treat')
  expect((spy.value('totals') as { dust: number }).dust).toBe(44)
  await ui.unmount()
  // The day's care bounty counts the pet, trick or treat (the spy holds the state, so mount again to read it).
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const care = questsOf(dayNow())[0]!
  const label = WORDS.en.quests[care.id]!.replace(/[×()]/g, '.')
  expect(await text(again, new RegExp(label))).toMatch(care.target === 1 ? /^✓/ : / 1\/\d/)
  await again.unmount()
})

test('without gold a treat is refused, and a new pal knows no tricks yet', async ($, on) => {
  engine(on)
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  const spy = stateSpy(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'treat' })
  expect(spy.act()).not.toBe('treat')
  await ui.press({ key: 'trick' })
  expect(spy.act()).toBe('lookAround')
  expect(await text(ui, /^Next trick/)).toBe('Next trick: Lv2 Wave')
  await ui.unmount()
})

test('a level up opens a chest of gold and teaches the next trick', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  // 28 rep: two short of Lv2, which teaches RIKI to wave.
  mock.store(on, { ...LOCKI, chestLevel: 1, 'ledger:other': { fame: 28, dust: 0, days: {}, lastAt: NOW - 60_000, activeSince: NOW - 600_000 } })
  const clock = mock.clock(on, { now: NOW })
  const spy = stateSpy(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^RIKI Lv/)).toMatch(/^RIKI Lv2 /)
  // Bullseye $3 + Lv2 chest $7 (+ a lucky nugget, if this moment rolled one).
  expect(await text(ui, /^Level chest/)).toBe('Level chest $7')
  await clock.advance(5000)
  expect(spy.act()).toBe('wave')
  await ui.unmount()
})

test('a failing test makes the pal flinch', async ($, on) => {
  engine(on, { 'pytest -q': '1 failed, 3 passed' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  const spy = stateSpy(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  expect(spy.act()).toBe('fail')
})
