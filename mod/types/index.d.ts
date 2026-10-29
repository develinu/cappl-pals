export type CharacterId = 'locki' | 'cappl' | 'numo'
export type Language = 'en' | 'ko'

// Results a person can check (see rules.ts), plus bonuses paid on top of them.
export type ResultKind = 'daily' | 'verify' | 'comeback' | 'commit' | 'merge' | 'plan' | 'break' | 'check' | 'pr'
export type BonusKind = 'chest' | 'quest' | 'lucky'
export type RewardKind = ResultKind | BonusKind
// Things the pal and the person do together; counted for the day's bounties, never paid.
export type CareKind = 'pet' | 'treat' | 'trick'

export type Reward = {
  at: number
  kind: RewardKind
  fame: number
  dust: number
  // Below 1 when the same kind was earned many times that day.
  rate: number
}

export type DayCounts = Partial<Record<RewardKind | CareKind, number>>

// A session writes only its own ledger (`ledger:<session id>`), so sessions running
// side by side never overwrite each other. Every pane sums all of them.
export type Ledger = {
  fame: number
  dust: number
  days: Record<string, DayCounts>
  lastAt: number
  activeSince: number
  // This session's latest rewards; the pane merges every session's by time.
  recent: Reward[]
}

// Item ids carry their character: `locki/aviators`, `cappl/banjo`.
export type Wallet = {
  spent: number
  owned: string[]
  equipped: string[]
}

export type Totals = { fame: number; dust: number }

export type PaneView = 'main' | 'rules' | 'progress'
export type Activity = 'idle' | 'sleeping' | 'thinking' | 'reading' | 'editing' | 'running' | 'testing' | 'waiting'
// A one-off animation (a reward, a pet, a trick) and when it started, in ms.
export type Act = { name: string; at: number }

// The sparkle around the character and the line in the pane at a reward or a purchase.
export type FxKind = 'reward' | 'comeback' | 'merge' | 'level' | 'stage' | 'buy'
export type Fx = { kind: FxKind; label: string; at: number }

// What this session is working on (hooks/work.ts): the request typed last, the plan the
// model keeps, and the subagents it sent off, drawn as the pal's deputies. Kept per session
// ($.state), never shared: every pane shows its own session's work.
export type Outcome = 'answer' | 'aborted' | 'error' | 'refusal'
export type Request = {
  title: string
  startedAt: number
  endedAt?: number
  outcome?: Outcome
  // Every model request made while this one was the latest, its kids' included.
  tokens: number
  // The session's cost when it started, to tell what it cost.
  usdAtStart?: number
}
export type PlanStatus = 'pending' | 'in_progress' | 'completed'
export type PlanItem = { id: string; subject: string; active?: string; status: PlanStatus }
export type KidStatus = 'working' | 'done' | 'failed' | 'stopped'
export type Kid = {
  // The agent id its loop's events carry.
  id: string
  // Its colour for its whole life, 0 to KID_SLOTS - 1; -1 when every colour was taken.
  slot: number
  label: string
  type: string
  status: KidStatus
  activity: Activity
  startedAt: number
  endedAt?: number
  tokens: number
  // When its loop last did something; a kid silent for an hour is taken as stopped.
  seenAt: number
  // Agent-list polls in a row it was missing from (hooks/work.ts kidStatuses).
  missing?: number
  // A workflow's agents are never in the agent list, so missing from it means nothing.
  isWorkflow?: boolean
}
export type Limit = { kind: string; percent: number; resetsAt?: number }
export type Work = {
  request: Request | null
  plan: PlanItem[]
  kids: Kid[]
  // The session's cost so far, where the host keeps a ledger.
  usd?: number
  tokens: number
  limits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    'cappl-pals': {
      totals: Totals
      wallet: Wallet
      log: Reward[]
      activity: Activity
      act: Act | null
      // A treat makes the pal glow (blush, livelier) until this time, in ms.
      glowUntil: number
      turnFame: number
      fx: Fx | null
      character: CharacterId | null
      picking: boolean
      // What the pane shows besides the picker: the pal, the rules or my progress.
      view: PaneView
      work: Work
      // Moves every second while something runs, so the times on screen count up.
      beat: number
    }
  }
}
