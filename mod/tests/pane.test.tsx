import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'howdy',
  component: 'Pane',
  requestId: 'howdy',
  props: {
    title: 'howdy',
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
    expect((await ui.find({ key: 'pick-locki' }))?.text).toMatch(/Ride with Locki/)
    expect((await ui.find({ key: 'pick-cappl' }))?.text).toMatch(/Ride with Cappl/)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'pick-cappl' })
  expect(await text(ui, /Lv1/)).toBe('Cappl Lv1 Greenhorn')
  expect((await ui.find({ key: 'shop-round-specs' }))?.text).toMatch(/Round specs \$50/)
  // "Switch character" brings the picker back, marking who rides now.
  await ui.press({ key: 'switch' })
  expect(await text(ui, /riding now/)).toBe('Cappl (riding now)')
  await ui.press({ key: 'pick-locki' })
  expect(await text(ui, /Lv1/)).toBe('Locki Lv1 Greenhorn')
  await ui.unmount()
})

test('/howdy-pick picks by name, and says which names exist', async ($, on) => {
  engine(on)
  mock.store(on)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'howdy-pick', ...RUN, args: 'Cappl' })).text).toBe('Cappl is riding with you now.')
  expect((await $.command.run({ command: 'howdy-status', ...RUN })).text).toMatch(/^Cappl Lv1 Greenhorn/)
  expect((await $.command.run({ command: 'howdy-pick', ...RUN, args: 'bob' })).text).toMatch(/locki, cappl/)
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
    expect(await text(ui, /Lv/)).toBe('Locki Lv1 Greenhorn')
    expect(await text(ui, /^Claim staked/)).toBe('Claim staked +10 $5')
    await ui.unmount()
  }
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
  expect(await text(ui, /Lv/)).toMatch(/^Locki Lv6 Stable Hand$/)
  await ui.press({ key: 'shop-aviators' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$70/)
  expect((await ui.find({ key: 'shop-aviators' }))?.text).toMatch(/Aviator shades take off/)

  await ui.press({ key: 'switch' })
  await ui.press({ key: 'pick-cappl' })
  expect((await ui.find({ key: 'shop-round-specs' }))?.text).toMatch(/Round specs \$50/)
  await ui.press({ key: 'shop-round-specs' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$20/)
  await ui.press({ key: 'shop-coffee' })
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$20/)

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
  expect(await text(ui, /^Gold/)).toMatch(/^Gold \$70/)
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
  expect(await text(ui, /Lv/)).toMatch(/^Cappl Lv/)
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
    value: state.isOpen ? [{ id: 'howdy', title: 'howdy', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
}

test('/howdy opens and closes the pane, and a closed pane stays closed next session', async ($, on) => {
  const state: { isOpen: boolean; opens: number; closes: string[]; rows?: number } = { isOpen: false, opens: 0, closes: [] }
  paneEngine(on, state)
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(state.isOpen).toBe(true)
  expect((await $.command.run({ command: 'howdy', ...RUN })).text).toMatch(/^Closed/)
  expect(state.isOpen).toBe(false)
  expect((await $.command.run({ command: 'howdy', ...RUN })).text).toMatch(/^Opened/)
  expect(state.isOpen).toBe(true)
  // Opened by /howdy above the prompt, the pane asks for room for the shop too.
  expect(state.rows).toBe(24)
  await $.command.run({ command: 'howdy', ...RUN })

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
    expect(beside?.text).toMatch(/Locki Lv1 Greenhorn/)
    expect(beside?.text).toMatch(/Rep [▰▱]/)
    expect(beside?.text).toMatch(/Gold \$0/)
    expect(beside?.text).toMatch(/▾ Shop below/)
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

test('a reward flashes a line in the pane, and /howdy-sound cycles normal → quiet → off', async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^✦ Bullseye/)).toBe('✦ Bullseye +5 rep')
  await ui.unmount()

  expect((await $.command.run({ command: 'howdy-sound', ...RUN })).text).toMatch(/^Sound effects: quiet/)
  expect((await $.command.run({ command: 'howdy-sound', ...RUN })).text).toMatch(/^Sound effects: off/)
  expect((await $.command.run({ command: 'howdy-sound', ...RUN })).text).toMatch(/^Sound effects: normal/)
})

test('Korean, from the language option or from the Claude Code setting', { options: { language: 'ko' } }, async ($, on) => {
  engine(on, { 'pytest -q': '12 passed in 0.3s' })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'pytest -q' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /Lv/)).toBe('Locki Lv1 새내기')
  expect(await text(ui, /^골드/)).toMatch(/^골드 \$3/)
  expect((await ui.find({ key: 'shop-aviators' }))?.text).toMatch(/보안관 선글라스 \$50/)
  expect(await text(ui, /^✦ 과녁 명중/)).toBe('✦ 과녁 명중 +5 명성')
  await ui.unmount()
  expect((await $.command.run({ command: 'howdy-rules', ...RUN })).text).toMatch(/UTC/)
})

test('auto language follows Claude Code’s language setting', async ($, on) => {
  engine(on)
  on('settings.read', () => ({ value: { language: 'Korean' } }))
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'howdy-status', ...RUN })).text).toMatch(/^Locki Lv1 새내기 · 명성 0/)
})
