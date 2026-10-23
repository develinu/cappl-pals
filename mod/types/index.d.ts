export type CharacterId = 'locki' | 'cappl'
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

export type Activity = 'idle' | 'sleeping' | 'thinking' | 'reading' | 'editing' | 'running' | 'testing' | 'waiting'
// A one-off animation (a reward, a pet, a trick) and when it started, in ms.
export type Act = { name: string; at: number }

// The sparkle around the character and the line in the pane at a reward or a purchase.
export type FxKind = 'reward' | 'comeback' | 'merge' | 'level' | 'stage' | 'buy'
export type Fx = { kind: FxKind; label: string; at: number }

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
    }
  }
}
