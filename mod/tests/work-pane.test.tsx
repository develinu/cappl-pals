import type { AgentStatus, On, PromptSubmitInput, TurnStartInput, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'cappl-pals',
  component: 'Pane',
  requestId: 'cappl-pals',
  props: {
    title: 'CAPPL',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const
const WIDE = { ...PANE, props: { ...PANE.props, bodyColumns: 120 } }

const NOW = Date.UTC(2026, 9, 29, 3)
const LOCKI = { character: 'locki' }
const USAGE = { input_tokens: 1_200, output_tokens: 300, cache_read_input_tokens: 10_000, cache_creation_input_tokens: 500 }

// The engine beneath the plugin: tools answer, a spawn starts agent `a<n>`, the session
// has cost `usd` so far, and the agent list has every spawned agent.
type Live = { usd: number; agents: { id: string; status: AgentStatus }[]; percent?: number; weekly?: number }

function engine(on: On, live: Live) {
  let spawned = 0
  on('session.id', () => ({ value: 's1' }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) => (e.tool === 'TaskCreate' ? { result: { task: { id: String(e.subject).length, subject: e.subject } }, text: '' } : { result: {}, text: '' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - 600_000,
      context: { window: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: live.percent ?? 42, resetsAt: new Date(NOW + 2 * 3600_000 + 13 * 60_000).toISOString() },
        { kind: 'seven_day', percentUsed: live.weekly ?? 18 },
      ],
      cost: { usd: live.usd },
    },
  }))
  // Every agent spawned is listed as running, unless `agents` says otherwise.
  on('agent.list', () => ({
    value: Array.from({ length: spawned }, (_, i) => `a${i + 1}`).map(id => ({
      id, status: live.agents.find(agent => agent.id === id)?.status ?? ('running' as AgentStatus), description: '', type: 'general-purpose',
    })),
  }))
  on('agent.spawn', () => {
    spawned += 1
    return { model: 'haiku', agentId: `a${spawned}` }
  })
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { ...USAGE, model: 'claude-haiku-5-5' } }
  })
}

const spawnOf = (prompt: string, description: string, subagentType: string) => ({
  prompt, description, subagentType, tool_use_id: `tu-${description}`, provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'haiku', background: false, fork: false,
})

// The person sends a prompt and its turn starts.
type Asker = { prompt: { submit: (e: PromptSubmitInput) => Promise<unknown> }; turn: { start: (e: TurnStartInput) => Promise<unknown> } }

async function ask($: Asker, prompt: string, turnId: string) {
  await $.prompt.submit({ text: prompt, wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: prompt, turnId })
}

const text = async (ui: { find: (q: object) => Promise<{ text?: string } | undefined> }, pattern: RegExp) =>
  (await ui.find({ type: 'Text', text: pattern }))?.text

type Stepper = { turn: { step: (input: TurnStepInput) => AsyncGenerator<TurnStepChunk, TurnStepResult> } }

async function step($: Stepper, turnId: string, agentId?: string) {
  const stream = $.turn.step({ turnId, index: 0, model: 'haiku', messageCount: 1, ...(agentId === undefined ? {} : { agentId }) })
  for await (const _ of stream) {
    // drained
  }
}

test('before anything is asked, the pane says where progress will show', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /^Progress shows here/)).toBe('Progress shows here when you ask')
    await ui.unmount()
  }
})

test('a request shows what the pal is doing, for how long, its tokens and what it cost', async ($, on) => {
  const live: Live = { usd: 1.25, agents: [], percent: 62 }
  engine(on, live)
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Fix the login test\nthen tidy up', 't1')
  await $.tool.call({ tool: 'Edit', file_path: '/a.py', old_string: 'a', new_string: 'b', ...{} })
  await clock.advance(192_000)
  live.usd = 1.75
  await step($, 't1')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^ Thinking $/)).toBe(' Thinking ')
  expect(await text(ui, /^ 3m 1\ds$/)).toMatch(/^ 3m 1\ds$/)
  expect(await text(ui, /^Fix the login/)).toBe('Fix the login test')
  expect(await text(ui, /^Tokens/)).toBe('Tokens 12k ∙ API value US$0.50')
  // The dock keeps the counts; a wider pane adds the session's time.
  expect(await text(ui, /^This session/)).toBe('This session 12k tokens ∙ US$1.75')
  expect(await text(ui, /^5-hour limit/)).toBe('5-hour limit ▰▰▰▰▰▰▱▱▱▱ 62% ∙ resets in 2h')
  await ui.unmount()
  const wide = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await text(wide, /^This session/)).toMatch(/^This session 1\dm \d+s ∙ 12k tokens ∙ US\$1\.75$/)
  await wide.unmount()

  await $.turn.complete({ answer: 'Fixed.', durationMs: 200_000, isAborted: false, turnId: 't1', reason: 'answer' })
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(after, /^ Done $/)).toBe(' Done ')
  expect(await text(after, /^▸ Work$/)).toBe('▸ Work')
  await after.unmount()
})

test('each subagent is a kid with its number and colour, what it does, its time and tokens', async ($, on) => {
  const live: Live = { usd: 0, agents: [] }
  engine(on, live)
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Review the PR', 't1')
  await $.agent.spawn(spawnOf('Find auth bugs', 'Find auth bugs', 'Explore'))
  await $.agent.spawn(spawnOf('Check the docs', 'Check the docs', 'general-purpose'))
  await $.turn.start({ text: 'Find auth bugs', turnId: 'k1', agentId: 'a1' })
  await $.tool.call({ tool: 'Read', file_path: '/auth.py', agentId: 'a1' })
  await step($, 'k1', 'a1')
  await clock.advance(40_000)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await text(ui, /^ 1 $/)).toBe(' 1 ')
    expect(await text(ui, /^Find auth bugs$/)).toBe('Find auth bugs')
    expect(await text(ui, /^Check the docs$/)).toBe('Check the docs')
    // The dock (40 columns) keeps the time; a wider pane adds the kid's tokens.
    expect(await text(ui, /^ Thinking 40s/)).toBe(surface === 'terminal' ? ' Thinking 40s' : ' Thinking 40s ∙ 12k')
    expect(await text(ui, /deputies/)).toBe('2 deputies ∙ 2 working')
    await ui.unmount()
  }
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ key: 'kid-a1' })).toBeDefined()
  expect(await terminal.find({ key: 'kid-a2' })).toBeDefined()
  await terminal.unmount()

  await clock.advance(22_000)
  await $.turn.complete({ answer: 'Two bugs.', durationMs: 62_000, isAborted: false, turnId: 'k1', agentId: 'a1', reason: 'answer' })
  // The other one was stopped from the task list: the agent list tells.
  live.agents = [{ id: 'a2', status: 'killed' }]
  await clock.advance(2_000)
  const done = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await text(done, /^ Done 1m 2s/)).toBe(' Done 1m 2s ∙ 12k')
  expect(await text(done, /^ Stopped/)).toMatch(/^ Stopped 1m 4s$/)
  await done.unmount()
})

test('on a wide pane the kids stand beside the pal', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'go', 't1')
  await $.agent.spawn(spawnOf('x', 'Explore the repo', 'Explore'))
  const ui = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await ui.find({ key: 'family' })).toBeDefined()
  expect(await ui.find({ key: 'kid-a1' })).toBeDefined()
  await ui.unmount()
  const narrow = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await narrow.find({ key: 'family' })).toBeUndefined()
  expect(await narrow.find({ key: 'kids' })).toBeDefined()
  await narrow.unmount()
})

test('the plan shows how far along it is and the step in hand', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Ship it', 't1')
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Read the code', status: 'completed', activeForm: 'Reading the code' },
      { content: 'Fix the bug', status: 'in_progress', activeForm: 'Fixing the bug' },
      { content: 'Run the tests', status: 'pending', activeForm: 'Running the tests' },
    ],
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /1\/3/)).toBe('▰▰▰▱▱▱▱▱ 1/3 ')
  expect(await text(ui, /^Fixing the bug$/)).toBe('Fixing the bug')
  await ui.unmount()
})

test('a kid tool call does not move the pal, and the pal\'s own plan ignores a kid\'s to-do list', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'go', 't1')
  await $.agent.spawn(spawnOf('x', 'Edit things', 'general-purpose'))
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'kid step', status: 'pending', activeForm: 'kid stepping' }], agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /▱ 0\/1/)).toBeUndefined()
  expect(await text(ui, /^ Thinking $/)).toBe(' Thinking ')
  await ui.unmount()
})

test("an agent's report waking the loop carries the request on, kids and all", async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Summarize both files', 't1')
  await $.agent.spawn(spawnOf('x', 'Summarize trail.js', 'Explore'))
  await $.turn.complete({ answer: 'Waiting.', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })
  // The pal answered, the kid still works: not done yet, and the clock runs on.
  await clock.advance(5_000)
  const waiting = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(waiting, /^ Deputies out $/)).toBe(' Deputies out ')
  expect(await text(waiting, /^ 5s$/)).toBe(' 5s')
  await waiting.unmount()
  await $.turn.complete({ answer: 'Done.', durationMs: 4_000, isAborted: false, turnId: 'k1', agentId: 'a1', reason: 'answer' })
  await clock.advance(30_000)
  const notice = '<agent-message from="a1">Done.</agent-message>'
  await $.prompt.submit({ text: notice, wait: false, origin: { kind: 'task-notification' } as PromptSubmitInput['origin'] })
  await $.turn.start({ text: notice, turnId: 't2' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Summarize both/)).toBe('Summarize both files')
  expect(await text(ui, /^Summarize trail/)).toBe('Summarize trail.js')
  await ui.unmount()
})

test('kids sent off side by side all make it into the family', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Three at once', 't1')
  await Promise.all([
    $.agent.spawn(spawnOf('x', 'Read trail.js', 'general-purpose')),
    $.agent.spawn(spawnOf('y', 'Read camp.js', 'general-purpose')),
    $.agent.spawn(spawnOf('z', 'Read the test', 'general-purpose')),
  ])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /deputies/)).toBe('3 deputies ∙ 3 working')
  await ui.unmount()
})

test('a low pane keeps the status beside the small pal, and the kids past it when there is room', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Look around', 't1')
  await $.agent.spawn(spawnOf('x', 'Explore the repo', 'Explore'))
  const low = { ...PANE, props: { ...PANE.props, bodyColumns: 120, scroll: { offset: 0, bodyRows: 9 } } }
  const ui = await $.ui.mount({ ...low, surface: 'terminal' })
  expect(await ui.find({ key: 'beside' })).toBeDefined()
  expect(await text(ui, /^ Thinking $/)).toBe(' Thinking ')
  expect(await ui.find({ key: 'kid-a1' })).toBeDefined()
  await ui.unmount()
  // Too narrow for a kid past the header: it stands in a row under the small pal instead.
  const narrow = { ...low, props: { ...low.props, bodyColumns: 56 } }
  const small = await $.ui.mount({ ...narrow, surface: 'terminal' })
  expect(await small.find({ key: 'kid-a1' })).toBeDefined()
  expect(await small.find({ key: 'kids' })).toBeDefined()
  await small.unmount()
})

test('the weekly limit gets its own line in the dock once half of it is used', async ($, on) => {
  const live: Live = { usd: 0, agents: [] }
  engine(on, live)
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'go', 't1')
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Weekly limit/)).toBeUndefined()
  await ui.unmount()
  ui = await $.ui.mount({ ...WIDE, surface: 'terminal' })
  expect(await text(ui, /^Weekly limit/)).toBe('Weekly limit ▰▰▱▱▱▱▱▱▱▱ 18%')
  await ui.unmount()
  live.weekly = 64
  await ask($, 'again', 't2')
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Weekly limit/)).toBe('Weekly limit ▰▰▰▰▰▰▱▱▱▱ 64%')
  await ui.unmount()
})

test('a prompt queued over a running turn starts its own request when its turn comes', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'First thing', 't1')
  await $.prompt.submit({ text: 'Second thing', wait: true, origin: { kind: 'composer' }, turnId: 't1' })
  await $.turn.complete({ answer: 'ok', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.turn.start({ text: 'Second thing', turnId: 't2' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /thing$/)).toBe('Second thing')
  await ui.unmount()
})

test('a slash command with no turn does not name the request a report wakes', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Summarize both files', 't1')
  await $.agent.spawn(spawnOf('x', 'Summarize trail.js', 'Explore'))
  await $.turn.complete({ answer: 'Waiting.', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.prompt.submit({ text: '/cappl', wait: false, origin: { kind: 'composer' } })
  await clock.advance(2_000)
  await $.turn.complete({ answer: 'Done.', durationMs: 4_000, isAborted: false, turnId: 'k1', agentId: 'a1', reason: 'answer' })
  await $.turn.start({ text: '<agent-message from="a1">Done.</agent-message>', turnId: 't2' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^Summarize both/)).toBe('Summarize both files')
  await ui.unmount()
})

test('the time runs until the last kid reports, and stays there', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'go', 't1')
  await $.agent.spawn(spawnOf('x', 'Slow kid', 'general-purpose'))
  await clock.advance(5_000)
  await $.turn.complete({ answer: 'Waiting.', durationMs: 5_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(295_000)
  await $.turn.complete({ answer: 'Done.', durationMs: 300_000, isAborted: false, turnId: 'k1', agentId: 'a1', reason: 'answer' })
  await clock.advance(10_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await text(ui, /^ Done $/)).toBe(' Done ')
  expect((await ui.find({ key: 'work-time' }))?.text).toBe(' 5m 0s')
  await ui.unmount()
})

test('beside the small pal in a narrow dock the status drops its time rather than wrap', { options: { language: 'ko' } }, async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'go', 't1')
  await $.agent.spawn(spawnOf('x', 'Kid', 'general-purpose'))
  await $.turn.complete({ answer: 'Waiting.', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(65_000)
  const low = { ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows: 9 } } }
  const ui = await $.ui.mount({ ...low, surface: 'terminal' })
  expect(await ui.find({ key: 'beside' })).toBeDefined()
  // " 부보안관 출동 중 " and " 1분 5초" take 26 cells; beside the pal there are 22.
  expect(await text(ui, /^ 부보안관 출동 중 $/)).toBe(' 부보안관 출동 중 ')
  expect(await ui.find({ key: 'work-time' })).toBeUndefined()
  await ui.unmount()
})

test('five deputies all show at every pane size, wrapping to a second row when the pane is narrow', async ($, on) => {
  engine(on, { usd: 0, agents: [] })
  mock.store(on, LOCKI)
  mock.clock(on, { now: NOW })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await ask($, 'Five at once', 't1')
  for (const name of ['one', 'two', 'three', 'four', 'five']) await $.agent.spawn(spawnOf(name, name, 'general-purpose'))
  await $.turn.complete({ answer: 'Done.', durationMs: 1_000, isAborted: false, turnId: 'k3', agentId: 'a3', reason: 'answer' })
  for (const [columns, rows] of [[40, 60], [52, 60], [72, 60], [120, 60], [150, 60], [40, 9], [72, 9], [120, 9]] as const) {
    const pane = { ...PANE, props: { ...PANE.props, bodyColumns: columns, scroll: { offset: 0, bodyRows: rows } } }
    const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
    const drawn = []
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) if ((await ui.find({ key: `kid-${id}` })) !== undefined) drawn.push(id)
    expect([columns, rows, drawn]).toEqual([columns, rows, ['a1', 'a2', 'a3', 'a4', 'a5']])
    await ui.unmount()
  }
})
