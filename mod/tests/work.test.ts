import { expect, test } from 'claude-code/testing'

import { WORDS } from '../hooks/i18n'
import {
  KID_SLOTS,
  emptyWork,
  endRequest,
  kidEnd,
  kidStart,
  kidStatuses,
  kidTool,
  kidToolDone,
  measure,
  planFrom,
  requestCost,
  requestEnd,
  spawnKid,
  startRequest,
  tokensOf,
  drawnKids,
  withTokens,
} from '../hooks/work'

const T0 = Date.UTC(2026, 9, 29, 3)
const usage = (input: number, output: number, read = 0, write = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

test('a prompt starts a request named by its first line; a continuation keeps it going', () => {
  let work = startRequest(emptyWork(), { text: '  Fix the login test\nand then the docs', at: T0 })
  expect(work.request?.title).toBe('Fix the login test')
  expect(work.request?.startedAt).toBe(T0)

  work = endRequest(work, { at: T0 + 5_000, reason: 'answer' })
  expect(work.request?.endedAt).toBe(T0 + 5_000)
  expect(work.request?.outcome).toBe('answer')

  // A turn with no typed text (a background agent's report woke the loop) carries on.
  work = startRequest(work, { text: '', at: T0 + 9_000 })
  expect(work.request?.title).toBe('Fix the login test')
  expect(work.request?.startedAt).toBe(T0)
  expect(work.request?.endedAt).toBeUndefined()
  expect(work.request?.outcome).toBeUndefined()

  work = startRequest(work, { text: 'Now the docs', at: T0 + 20_000 })
  expect(work.request?.title).toBe('Now the docs')
  expect(work.request?.startedAt).toBe(T0 + 20_000)
})

test('a long or empty first line still makes a title', () => {
  expect(startRequest(emptyWork(), { text: 'x'.repeat(300), at: T0 }).request?.title.length).toBe(120)
  expect(startRequest(emptyWork(), { text: '\n\n  /review 12  \n', at: T0 }).request?.title).toBe('/review 12')
})

test('tokens of every model request add up for the request, the session and the kid that made them', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  work = spawnKid(work, { id: 'a1', label: 'Find auth bugs', type: 'Explore', at: T0 })
  work = withTokens(work, undefined, usage(100, 50, 1_000, 200))
  work = withTokens(work, 'a1', usage(10, 5, 300))
  // A loop no kid stands for (a compaction fork) still costs the request.
  work = withTokens(work, 'fork-x', usage(7, 3))

  expect(tokensOf(usage(100, 50, 1_000, 200))).toBe(1_350)
  expect(work.request?.tokens).toBe(1_350 + 315 + 10)
  expect(work.tokens).toBe(1_350 + 315 + 10)
  expect(work.kids[0]?.tokens).toBe(315)

  // The next request starts from zero; the session keeps counting.
  work = startRequest(work, { text: 'again', at: T0 + 1 })
  work = withTokens(work, undefined, usage(1, 1))
  expect(work.request?.tokens).toBe(2)
  expect(work.tokens).toBe(1_677)
})

test('a request costs what the session cost while it ran', () => {
  let work = measure(emptyWork(), { usd: 1.25, limits: [] })
  work = startRequest(work, { text: 'go', at: T0 })
  expect(requestCost(work)).toBe(0)
  work = measure(work, { usd: 1.75, limits: [{ kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-29T06:00:00Z' }] })
  expect(Math.round((requestCost(work) ?? 0) * 100)).toBe(50)
  expect(work.limits).toEqual([{ kind: 'five_hour', percent: 42, resetsAt: Date.parse('2026-10-29T06:00:00Z') }])

  // Without a cost ledger there is nothing to show.
  expect(requestCost(startRequest(emptyWork(), { text: 'go', at: T0 }))).toBeUndefined()
})

test('kids take the lowest free colour; finished kids keep theirs until the next request', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  for (const id of ['a', 'b', 'c']) work = spawnKid(work, { id, label: id, type: 'general-purpose', at: T0 })
  expect(work.kids.map(kid => kid.slot)).toEqual([0, 1, 2])

  work = kidEnd(work, 'b', { at: T0 + 1_000, reason: 'answer' })
  work = spawnKid(work, { id: 'd', label: 'd', type: 'Explore', at: T0 + 2_000 })
  expect(work.kids.find(kid => kid.id === 'd')?.slot).toBe(3)

  // A new request lets the finished ones go home; the ones still working stay.
  work = startRequest(work, { text: 'next', at: T0 + 3_000 })
  expect(work.kids.map(kid => kid.id)).toEqual(['a', 'c', 'd'])
  work = spawnKid(work, { id: 'e', label: 'e', type: 'Plan', at: T0 + 4_000 })
  expect(work.kids.find(kid => kid.id === 'e')?.slot).toBe(1)
})

test(`past ${KID_SLOTS} kids the rest have no colour of their own`, () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  for (let i = 0; i < KID_SLOTS + 2; i += 1) work = spawnKid(work, { id: `k${i}`, label: `k${i}`, type: 'general-purpose', at: T0 })
  expect(work.kids.map(kid => kid.slot)).toEqual([0, 1, 2, 3, 4, 5, -1, -1])
})

test('a kid works, reads, finishes, fails or is stopped as its loop does', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  work = spawnKid(work, { id: 'a', label: 'Read the specs', type: 'Explore', at: T0 })
  expect(work.kids[0]).toMatchObject({ status: 'working', activity: 'thinking', startedAt: T0, tokens: 0 })

  work = kidTool(work, 'a', 'reading')
  expect(work.kids[0]?.activity).toBe('reading')
  work = kidEnd(work, 'a', { at: T0 + 62_000, reason: 'answer' })
  expect(work.kids[0]).toMatchObject({ status: 'done', endedAt: T0 + 62_000 })

  // SendMessage wakes it again.
  work = kidStart(work, 'a', T0 + 70_000)
  expect(work.kids[0]).toMatchObject({ status: 'working', activity: 'thinking' })
  expect(work.kids[0]?.endedAt).toBeUndefined()

  expect(kidEnd(work, 'a', { at: T0, reason: 'error' }).kids[0]?.status).toBe('failed')
  expect(kidEnd(work, 'a', { at: T0, reason: 'refusal' }).kids[0]?.status).toBe('failed')
  expect(kidEnd(work, 'a', { at: T0, reason: 'aborted' }).kids[0]?.status).toBe('stopped')
  // Events of loops that are no kid change nothing.
  expect(kidTool(work, 'nobody', 'editing')).toBe(work)
})

test("the agent list settles kids whose loop ended without a word: killed, failed, completed", () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  for (const id of ['a', 'b', 'c', 'd']) work = spawnKid(work, { id, label: id, type: 'general-purpose', at: T0 })
  work = kidEnd(work, 'd', { at: T0 + 1, reason: 'answer' })
  work = kidStatuses(
    work,
    [
      { id: 'a', status: 'killed' },
      { id: 'b', status: 'failed' },
      { id: 'c', status: 'running' },
      { id: 'd', status: 'failed' },
    ],
    T0 + 5,
  )
  expect(work.kids.map(kid => kid.status)).toEqual(['stopped', 'failed', 'working', 'done'])
  expect(work.kids[0]?.endedAt).toBe(T0 + 5)
  // Nothing changed, the same value comes back (the pane is not redrawn for it).
  expect(kidStatuses(work, [{ id: 'c', status: 'running' }], T0 + 6)).toBe(work)
})

test('the plan follows TodoWrite, TaskCreate and TaskUpdate', () => {
  let work = planFrom(emptyWork(), {
    tool: 'TodoWrite',
    input: {
      todos: [
        { content: 'Read the code', status: 'completed', activeForm: 'Reading the code' },
        { content: 'Fix the bug', status: 'in_progress', activeForm: 'Fixing the bug' },
        { content: 'Run the tests', status: 'pending', activeForm: 'Running the tests' },
      ],
    },
  })
  expect(work.plan.map(item => item.status)).toEqual(['completed', 'in_progress', 'pending'])
  expect(work.plan[1]?.active).toBe('Fixing the bug')

  work = planFrom(emptyWork(), { tool: 'TaskCreate', input: { subject: 'Write tests', activeForm: 'Writing tests' }, result: { task: { id: '1', subject: 'Write tests' } } })
  work = planFrom(work, { tool: 'TaskCreate', input: { subject: 'Ship it' }, result: { task: { id: '2', subject: 'Ship it' } } })
  work = planFrom(work, { tool: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' }, result: { success: true } })
  expect(work.plan).toEqual([
    { id: '1', subject: 'Write tests', active: 'Writing tests', status: 'in_progress' },
    { id: '2', subject: 'Ship it', status: 'pending' },
  ])
  work = planFrom(work, { tool: 'TaskUpdate', input: { taskId: '2', status: 'deleted' }, result: { success: true } })
  expect(work.plan.map(item => item.id)).toEqual(['1'])
  // A failed update changes nothing.
  expect(planFrom(work, { tool: 'TaskUpdate', input: { taskId: '1', status: 'completed' }, result: { success: false } })).toBe(work)
})

test('a new request drops a finished plan and keeps one with steps left', () => {
  const todos = (statuses: string[]) => ({
    tool: 'TodoWrite',
    input: { todos: statuses.map((status, i) => ({ content: `step ${i}`, status, activeForm: `doing ${i}` })) },
  })
  const done = planFrom(startRequest(emptyWork(), { text: 'a', at: T0 }), todos(['completed', 'completed']))
  expect(startRequest(done, { text: 'b', at: T0 + 1 }).plan).toEqual([])
  const open = planFrom(startRequest(emptyWork(), { text: 'a', at: T0 }), todos(['completed', 'pending']))
  expect(startRequest(open, { text: 'b', at: T0 + 1 }).plan).toHaveLength(2)
})

test('every kid with a colour is drawn, in number order, however many fit on a row', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  for (const id of ['a', 'b', 'c', 'd', 'e']) work = spawnKid(work, { id, label: id, type: 'general-purpose', at: T0 })
  work = kidEnd(work, 'a', { at: T0 + 1, reason: 'answer' })
  work = kidEnd(work, 'c', { at: T0 + 2, reason: 'answer' })
  expect(drawnKids(work).map(kid => kid.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  // A recycled colour keeps its number's place in the row.
  for (const id of ['f', 'g']) work = spawnKid(work, { id, label: id, type: 'general-purpose', at: T0 + 3 })
  expect(drawnKids(work).map(kid => kid.slot)).toEqual([0, 1, 2, 3, 4, 5])
})

test('tokens and time read short in both languages', () => {
  const ko = WORDS.ko.work
  const en = WORDS.en.work
  expect([ko.tokens(980), ko.tokens(12_345), ko.tokens(182_000), ko.tokens(1_234_567), ko.tokens(320_000_000)]).toEqual([
    '980', '1.2만', '18.2만', '123만', '3.2억',
  ])
  expect([en.tokens(980), en.tokens(12_345), en.tokens(182_000), en.tokens(1_234_567)]).toEqual(['980', '12.3k', '182k', '1.23M'])
  expect([ko.time(12_400), ko.time(192_000), ko.time(3_840_000)]).toEqual(['12초', '3분 12초', '1시간 4분'])
  expect([en.time(12_400), en.time(192_000), en.time(3_840_000)]).toEqual(['12s', '3m 12s', '1h 4m'])
  expect([en.soon(30_000), en.soon(2.2 * 3600_000), en.soon(2.6 * 86_400_000)]).toEqual(['1m', '2h', '3d'])
  expect([ko.soon(40 * 60_000), ko.soon(5 * 3600_000), ko.soon(6 * 86_400_000)]).toEqual(['40분', '5시간', '6일'])
  expect([en.usd(0), en.usd(0.004), en.usd(0.84), en.usd(12.5)]).toEqual(['US$0.00', '<US$0.01', 'US$0.84', 'US$12.50'])
})

test('a kid past the six colours takes the colour of the kid that finished first, which goes home', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  // Six background agents one after another, each report waking the loop (no new prompt).
  for (let i = 0; i < KID_SLOTS; i += 1) {
    work = spawnKid(work, { id: `k${i}`, label: `k${i}`, type: 'general-purpose', at: T0 + i })
    work = kidEnd(work, `k${i}`, { at: T0 + 10 + i, reason: 'answer' })
    work = startRequest(work, { text: '', at: T0 + 20 + i })
  }
  work = spawnKid(work, { id: 'k6', label: 'k6', type: 'general-purpose', at: T0 + 100 })
  expect(work.kids.find(kid => kid.id === 'k6')?.slot).toBe(0)
  expect(work.kids.some(kid => kid.id === 'k0')).toBe(false)
  expect(drawnKids(work).map(kid => kid.id)).toContain('k6')
})

test('kids whose loop never reports settle: idle teammates, kids gone from the list, kids silent for an hour', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  for (const id of ['mate', 'gone', 'flow', 'quiet']) work = spawnKid(work, { id, label: id, type: 'general-purpose', at: T0, ...(id === 'flow' ? { isWorkflow: true } : {}) })
  const list = [{ id: 'mate', status: 'idle' }, { id: 'quiet', status: 'running' }]
  // An idle teammate is done; one poll missing is not enough to call a kid gone.
  work = kidStatuses(work, list, T0 + 2_000)
  expect(work.kids.map(kid => kid.status)).toEqual(['done', 'working', 'working', 'working'])
  work = kidStatuses(work, list, T0 + 4_000)
  work = kidStatuses(work, list, T0 + 6_000)
  // Three polls without it: gone. A workflow's agents are never listed, so they wait.
  expect(work.kids.map(kid => kid.status)).toEqual(['done', 'done', 'working', 'working'])
  work = kidStatuses(work, list, T0 + 61 * 60_000)
  expect(work.kids.map(kid => kid.status)).toEqual(['done', 'done', 'stopped', 'stopped'])
})

test('a tool coming back after the kid was stopped does not bring it back', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  work = spawnKid(work, { id: 'a', label: 'a', type: 'Explore', at: T0 })
  work = kidTool(work, 'a', 'running')
  work = kidStatuses(work, [{ id: 'a', status: 'killed' }], T0 + 1_000)
  work = kidToolDone(work, 'a')
  expect(work.kids[0]?.status).toBe('stopped')
  // While it works, the call's end puts it back to thinking.
  let live = kidTool(spawnKid(startRequest(emptyWork(), { text: 'go', at: T0 }), { id: 'b', label: 'b', type: 'Explore', at: T0 }), 'b', 'editing')
  live = kidToolDone(live, 'b')
  expect(live.kids[0]?.activity).toBe('thinking')
})

test('a request ends when its last kid does, not before', () => {
  let work = startRequest(emptyWork(), { text: 'go', at: T0 })
  work = spawnKid(work, { id: 'a', label: 'a', type: 'Explore', at: T0 })
  work = endRequest(work, { at: T0 + 5_000, reason: 'answer' })
  work = kidEnd(work, 'a', { at: T0 + 300_000, reason: 'answer' })
  expect(requestEnd(work)).toBe(T0 + 300_000)
})

test('english token counts round up into millions', () => {
  expect([WORDS.en.work.tokens(999_499), WORDS.en.work.tokens(999_999)]).toEqual(['999k', '1M'])
})

test('the helpers are deputies of the Sundust sheriffs, in both languages', () => {
  expect([WORDS.en.work.kids(1, 1), WORDS.en.work.kids(3, 0), WORDS.en.work.waitingKids]).toEqual(['1 deputy ∙ 1 working', '3 deputies', 'Deputies out'])
  expect([WORDS.ko.work.kids(3, 2), WORDS.ko.work.waitingKids]).toEqual(['부보안관 3명 ∙ 2명 일하는 중', '부보안관 출동 중'])
})
