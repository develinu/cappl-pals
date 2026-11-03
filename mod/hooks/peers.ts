// Other sessions waiting on the person (a permission prompt, a question, a finished
// answer), and how to bring their terminal forward.
//
// A session that waits writes `waiting:<id>` to the shared store with where it runs (its
// spot); every other pane reads those keys back and offers a button that switches to it.
// The spot holds only what the terminal itself tells a process: its environment and tty.

import type { Call, Peer, Spot } from '../types'

const CALLS: readonly Call[] = ['permission', 'question', 'done']

export const PEER_PREFIX = 'waiting:'
// A waiting session writes again this often; one not heard from for longer is gone.
export const PEER_REFRESH_MS = 10_000
export const PEER_STALE_MS = 30_000

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function readSpot(value: unknown): Spot {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const spot: Spot = {}
  const app = text(raw.app)
  const program = text(raw.program)
  const tty = text(raw.tty)
  const wezterm = text(raw.wezterm)
  if (app !== undefined) spot.app = app
  if (program !== undefined) spot.program = program
  if (tty !== undefined) spot.tty = tty
  if (wezterm !== undefined) spot.wezterm = wezterm
  const orca = raw.orca as Record<string, unknown> | undefined
  if (text(orca?.bin) !== undefined && text(orca?.handle) !== undefined) spot.orca = { bin: orca!.bin as string, handle: orca!.handle as string }
  const tmux = raw.tmux as Record<string, unknown> | undefined
  const pane = text(tmux?.pane)
  if (pane !== undefined) spot.tmux = { pane, ...(text(tmux?.socket) === undefined ? {} : { socket: tmux!.socket as string }) }
  const kitty = raw.kitty as Record<string, unknown> | undefined
  const window = text(kitty?.window)
  if (window !== undefined) spot.kitty = { window, ...(text(kitty?.listen) === undefined ? {} : { listen: kitty!.listen as string }) }

  return spot
}

export function readPeer(id: string, value: unknown): Peer | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.since !== 'number' || typeof raw.seenAt !== 'number') return null

  const reason = CALLS.find(one => one === raw.reason) ?? 'permission'

  return { id, project: text(raw.project) ?? '?', reason, since: raw.since, seenAt: raw.seenAt, spot: readSpot(raw.spot) }
}

// The sessions waiting now, other than this one, the longest waiting first.
export function livePeers(peers: readonly Peer[], self: string, now: number): Peer[] {
  return peers.filter(peer => peer.id !== self && now - peer.seenAt < PEER_STALE_MS).sort((a, b) => a.since - b.since)
}

// The spot from the environment a terminal gives its processes.
export function spotOf(env: Readonly<Record<string, string | undefined>>, tty?: string): Spot {
  const spot: Spot = {}
  const app = text(env.__CFBundleIdentifier)
  const program = text(env.TERM_PROGRAM)
  if (app !== undefined) spot.app = app
  if (program !== undefined) spot.program = program
  if (tty !== undefined) spot.tty = tty
  const handle = text(env.ORCA_TERMINAL_HANDLE)
  const orcaBin = text(env.ORCA_CLI_BIN_DIR)
  if (handle !== undefined && orcaBin !== undefined) spot.orca = { bin: `${orcaBin}/orca`, handle }
  const pane = text(env.TMUX_PANE)
  const socket = text(env.TMUX)?.split(',')[0]
  if (pane !== undefined) spot.tmux = { pane, ...(socket === undefined || socket === '' ? {} : { socket }) }
  const wezterm = text(env.WEZTERM_PANE)
  if (wezterm !== undefined) spot.wezterm = wezterm
  const kitty = text(env.KITTY_WINDOW_ID)
  const listen = text(env.KITTY_LISTEN_ON)
  if (kitty !== undefined) spot.kitty = { window: kitty, ...(listen === undefined ? {} : { listen }) }

  return spot
}

// `ps -o tty=` says ttys003 or pts/3, or ?? with no terminal.
export function ttyOf(ps: string): string | undefined {
  const name = ps.trim()
  if (name === '' || name.startsWith('?')) return undefined

  return name.startsWith('/dev/') ? name : `/dev/${name}`
}

function osascript(lines: readonly string[], ...args: string[]): string[] {
  return ['osascript', ...lines.flatMap(line => ['-e', line]), ...args]
}

const ITERM = [
  'on run argv',
  'tell application "iTerm2"',
  'repeat with w in windows',
  'repeat with t in tabs of w',
  'repeat with s in sessions of t',
  'if tty of s is (item 1 of argv) then',
  'tell w to select',
  'tell t to select',
  'tell s to select',
  'activate',
  'return',
  'end if',
  'end repeat',
  'end repeat',
  'end repeat',
  'end tell',
  'end run',
]

const TERMINAL = [
  'on run argv',
  'tell application "Terminal"',
  'repeat with w in windows',
  'repeat with t in tabs of w',
  'if tty of t is (item 1 of argv) then',
  'set selected of t to true',
  'set index of w to 1',
  'activate',
  'return',
  'end if',
  'end repeat',
  'end repeat',
  'end tell',
  'end run',
]

// The commands that bring a spot forward, in order: the tab or pane inside the terminal,
// then the terminal app itself. Each is tried; one that fails (not installed) is skipped.
export function focusSteps(spot: Spot): string[][] {
  const steps: string[][] = []
  if (spot.orca !== undefined) steps.push([spot.orca.bin, 'terminal', 'switch', '--terminal', spot.orca.handle])
  if (spot.tmux !== undefined) {
    const tmux = ['tmux', ...(spot.tmux.socket === undefined ? [] : ['-S', spot.tmux.socket])]
    steps.push([...tmux, 'switch-client', '-t', spot.tmux.pane], [...tmux, 'select-window', '-t', spot.tmux.pane], [...tmux, 'select-pane', '-t', spot.tmux.pane])
  }
  if (spot.wezterm !== undefined) steps.push(['wezterm', 'cli', 'activate-pane', '--pane-id', spot.wezterm])
  if (spot.kitty !== undefined) {
    steps.push(['kitten', '@', ...(spot.kitty.listen === undefined ? [] : ['--to', spot.kitty.listen]), 'focus-window', '--match', `id:${spot.kitty.window}`])
  }
  // Inside tmux the tty is tmux's own, which no tab of the terminal owns.
  if (spot.tty !== undefined && spot.tmux === undefined && spot.orca === undefined) {
    if (spot.program === 'iTerm.app') steps.push(osascript(ITERM, spot.tty))
    if (spot.program === 'Apple_Terminal') steps.push(osascript(TERMINAL, spot.tty))
  }
  if (spot.app !== undefined) steps.push(['open', '-b', spot.app])

  return steps
}
