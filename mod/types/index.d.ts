export type CharacterId = 'locki' | 'cappl'
export type Language = 'en' | 'ko'

export type RewardKind = 'daily' | 'verify' | 'comeback' | 'commit' | 'merge' | 'plan' | 'break'

export type Reward = {
  at: number
  kind: RewardKind
  fame: number
  dust: number
  // Below 1 when the same kind was earned many times that day.
  rate: number
}

export type DayCounts = Partial<Record<RewardKind, number>>

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

export type Mood = 'idle' | 'working' | 'happy'

// The sparkle around the character and the line in the pane at a reward or a purchase.
export type FxKind = 'reward' | 'comeback' | 'merge' | 'level' | 'stage' | 'buy'
export type Fx = { kind: FxKind; label: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    howdy: {
      totals: Totals
      wallet: Wallet
      log: Reward[]
      mood: Mood
      turnFame: number
      fx: Fx | null
      character: CharacterId | null
      picking: boolean
    }
  }
}
