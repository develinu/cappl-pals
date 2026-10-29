import type { Activity, Kid, KidStatus, Limit, Outcome, PlanItem, PlanStatus, Work } from '../types'

// What this session is working on, as plain functions over a Work value: the request
// typed last, the plan the model keeps (TodoWrite, TaskCreate/TaskUpdate) and the
// subagents it sends off, drawn as the pal's deputies ("kids" in the code). register.tsx
// feeds them events.

// Six kid colours (hooks/kids.ts); a seventh kid at once gets none and is only counted.
export const KID_SLOTS = 6
const TITLE_MAX = 120
// Finished kids are let go past this many, oldest first.
const KIDS_KEPT = 24
// Agent-list polls a kid may be missing from before it is taken as gone.
const MISSING_POLLS = 3
const SILENT_MS = 60 * 60_000

export function emptyWork(): Work {
  return { request: null, plan: [], kids: [], tokens: 0, limits: [] }
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// Everything the request was answered over and wrote, cache reads included, as /cost counts.
export function tokensOf(usage: Usage): number {
  return usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
}

function titleOf(text: string): string {
  const line = text.split('\n').map(one => one.trim()).find(one => one !== '') ?? ''

  return line.length > TITLE_MAX ? line.slice(0, TITLE_MAX) : line
}

const isFinished = (kid: Kid) => kid.status !== 'working'

// A typed prompt starts a request; a turn with no text (a continuation, a background
// agent's report waking the loop) carries the latest one on.
export function startRequest(work: Work, { text, at }: { text: string; at: number }): Work {
  const title = titleOf(text)
  if (title === '' && work.request !== null) {
    const { endedAt: _ended, outcome: _outcome, ...request } = work.request
    return { ...work, request }
  }
  const isPlanDone = work.plan.every(item => item.status === 'completed')

  return {
    ...work,
    request: { title, startedAt: at, tokens: 0, ...(work.usd === undefined ? {} : { usdAtStart: work.usd }) },
    plan: isPlanDone ? [] : work.plan,
    kids: work.kids.filter(kid => !isFinished(kid)),
  }
}

export function endRequest(work: Work, { at, reason }: { at: number; reason: Outcome }): Work {
  if (work.request === null) return work

  return { ...work, request: { ...work.request, endedAt: at, outcome: reason } }
}

export function withTokens(work: Work, agentId: string | undefined, usage: Usage, at?: number): Work {
  const n = tokensOf(usage)
  if (n === 0) return work

  return {
    ...work,
    tokens: work.tokens + n,
    request: work.request === null ? null : { ...work.request, tokens: work.request.tokens + n },
    kids:
      agentId === undefined
        ? work.kids
        : work.kids.map(kid => (kid.id === agentId ? { ...kid, tokens: kid.tokens + n, ...(at === undefined ? {} : { seenAt: at }) } : kid)),
  }
}

type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

export function measure(work: Work, { usd, limits }: { usd?: number; limits: readonly RateLimit[] }): Work {
  const next: Limit[] = limits.map(one => {
    const resetsAt = one.resetsAt === undefined ? NaN : Date.parse(one.resetsAt)
    return { kind: one.kind, percent: one.percentUsed, ...(Number.isNaN(resetsAt) ? {} : { resetsAt }) }
  })

  return { ...work, ...(usd === undefined ? {} : { usd }), limits: next }
}

// When the request ended: its answer, or its last kid's report if that came later;
// undefined while the pal or any kid still works.
export function requestEnd(work: Work): number | undefined {
  const ended = work.request?.endedAt
  if (ended === undefined || work.kids.some(kid => kid.status === 'working')) return undefined

  return Math.max(ended, ...work.kids.map(kid => kid.endedAt ?? 0))
}

// What the session cost since the request started; undefined without a cost ledger.
export function requestCost(work: Work): number | undefined {
  if (work.request?.usdAtStart === undefined || work.usd === undefined) return undefined

  return Math.max(0, work.usd - work.request.usdAtStart)
}

// ── Kids ────────────────────────────────────────────────────────────────────

type Spawn = { id: string; label: string; type: string; at: number; isWorkflow?: boolean }

export function spawnKid(work: Work, { id, label, type, at, isWorkflow }: Spawn): Work {
  if (work.kids.some(kid => kid.id === id)) return work
  let kids = work.kids
  const taken = new Set(kids.map(kid => kid.slot))
  let slot = Array.from({ length: KID_SLOTS }, (_, i) => i).find(i => !taken.has(i)) ?? -1
  if (slot < 0) {
    // Every colour taken: the kid that finished first goes home and leaves its colour.
    const home = kids.filter(kid => kid.slot >= 0 && isFinished(kid)).sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0))[0]
    if (home !== undefined) {
      slot = home.slot
      kids = kids.filter(kid => kid !== home)
    }
  }
  const kid: Kid = {
    id, slot, label: titleOf(label) || type, type, status: 'working', activity: 'thinking', startedAt: at, tokens: 0, seenAt: at,
    ...(isWorkflow === true ? { isWorkflow: true } : {}),
  }
  kids = [...kids, kid]
  while (kids.length > KIDS_KEPT) {
    const oldest = kids.findIndex(one => isFinished(one))
    if (oldest < 0) break
    kids = kids.filter((_, i) => i !== oldest)
  }

  return { ...work, kids }
}

function change(work: Work, id: string, fn: (kid: Kid) => Kid): Work {
  let isChanged = false
  const kids = work.kids.map(kid => {
    if (kid.id !== id) return kid
    const next = fn(kid)
    if (next !== kid) isChanged = true
    return next
  })

  return isChanged ? { ...work, kids } : work
}

// A kid starts a tool: it works (again, if it was taken as done).
export function kidTool(work: Work, id: string, activity: Activity, at?: number): Work {
  return change(work, id, kid => {
    if (kid.activity === activity && kid.status === 'working') return kid
    const { endedAt: _ended, missing: _missing, ...rest } = kid
    return { ...rest, status: 'working', activity, ...(at === undefined ? {} : { seenAt: at }) }
  })
}

// Its tool came back: back to thinking, unless it was stopped meanwhile.
export function kidToolDone(work: Work, id: string): Work {
  return change(work, id, kid => (kid.status !== 'working' || kid.activity === 'thinking' ? kid : { ...kid, activity: 'thinking' }))
}

export function kidStart(work: Work, id: string, at: number): Work {
  return change(work, id, kid => {
    if (kid.status === 'working') return kid
    const { endedAt: _ended, missing: _missing, ...rest } = kid
    return { ...rest, status: 'working', activity: 'thinking', seenAt: at }
  })
}

const END_STATUS: Record<Outcome, KidStatus> = { answer: 'done', error: 'failed', refusal: 'failed', aborted: 'stopped' }

export function kidEnd(work: Work, id: string, { at, reason }: { at: number; reason: Outcome }): Work {
  return change(work, id, kid => ({ ...kid, status: END_STATUS[reason], endedAt: at }))
}

// An idle teammate waits for a message: its work is done.
const LIST_STATUS: Readonly<Record<string, KidStatus>> = { completed: 'done', failed: 'failed', killed: 'stopped', idle: 'done' }

// $.agent.list() settles a kid whose loop ended with no turn.complete heard: stopped from
// the task list, killed with the session's agents, an idle teammate, a kid the engine
// dropped from the list. One silent for an hour (no local loop at all) is taken as stopped.
export function kidStatuses(work: Work, list: readonly { id: string; status: string }[], at: number): Work {
  let next = work
  const listed = new Map(list.map(agent => [agent.id, agent.status]))
  for (const kid of work.kids) {
    if (kid.status !== 'working') continue
    const status = listed.get(kid.id)
    const settled = status === undefined ? undefined : LIST_STATUS[status]
    if (settled !== undefined) {
      next = change(next, kid.id, one => ({ ...one, status: settled, endedAt: at }))
    } else if (at - kid.seenAt >= SILENT_MS) {
      next = change(next, kid.id, one => ({ ...one, status: 'stopped', endedAt: at }))
    } else if (status === undefined && kid.isWorkflow !== true) {
      const missing = (kid.missing ?? 0) + 1
      next = change(next, kid.id, one => (missing >= MISSING_POLLS ? { ...one, status: 'done', endedAt: at, missing } : { ...one, missing }))
    } else if (kid.missing !== undefined) {
      next = change(next, kid.id, ({ missing: _missing, ...one }) => one)
    }
  }

  return next
}

// Every kid with a colour, in number order: all of them are drawn, the pane wraps them.
export function drawnKids(work: Work): Kid[] {
  return work.kids.filter(kid => kid.slot >= 0).sort((a, b) => a.slot - b.slot)
}

// ── The plan ────────────────────────────────────────────────────────────────

const isPlanStatus = (value: unknown): value is PlanStatus => value === 'pending' || value === 'in_progress' || value === 'completed'
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

export function planFrom(work: Work, { tool, input, result }: { tool: string; input: unknown; result?: unknown }): Work {
  const args = record(input)
  if (tool === 'TodoWrite') {
    const todos = Array.isArray(args.todos) ? args.todos : []
    const plan: PlanItem[] = todos.map((todo, i) => {
      const one = record(todo)
      const active = text(one.activeForm)
      return { id: String(i), subject: text(one.content), ...(active === '' ? {} : { active }), status: isPlanStatus(one.status) ? one.status : 'pending' }
    })
    return { ...work, plan }
  }
  if (tool === 'TaskCreate') {
    const id = text(record(record(result).task).id)
    if (id === '') return work
    const active = text(args.activeForm)
    return { ...work, plan: [...work.plan, { id, subject: text(args.subject), ...(active === '' ? {} : { active }), status: 'pending' }] }
  }
  if (tool === 'TaskUpdate') {
    if (record(result).success !== true) return work
    const id = text(args.taskId)
    if (args.status === 'deleted') return { ...work, plan: work.plan.filter(item => item.id !== id) }
    return {
      ...work,
      plan: work.plan.map(item => {
        if (item.id !== id) return item
        const subject = text(args.subject)
        const active = text(args.activeForm)
        return {
          ...item,
          ...(subject === '' ? {} : { subject }),
          ...(active === '' ? {} : { active }),
          ...(isPlanStatus(args.status) ? { status: args.status } : {}),
        }
      }),
    }
  }

  return work
}
