import type { EngineInterface } from 'claude-code'

import type { CharacterId } from '../types'

// Sound effects. macOS plays through the engine's $.audio.play (afplay); the engine
// is silent on Linux and Windows, so WSL and Windows go through PowerShell's
// SoundPlayer and other Linux systems through paplay, pw-play or aplay.
// Each character has its own voice: assets/sfx/<character>/<name>.wav.

export type Sfx = 'coin' | 'comeback' | 'fanfare' | 'levelup' | 'stage' | 'buy' | 'equip' | 'error' | 'open' | 'close' | 'hello'

const PRIORITY: Record<Sfx, number> = {
  open: 0, close: 0, equip: 1, error: 1, coin: 2, hello: 3, buy: 3, comeback: 3, fanfare: 4, levelup: 5, stage: 6,
}

type Player =
  | { kind: 'mac' }
  | { kind: 'powershell'; root: string }
  | { kind: 'linux'; bin: string; root: string }
  | { kind: 'none' }

const audio = { player: undefined as Promise<Player> | undefined, lastAt: 0, lastPriority: -1 }

async function detectPlayer($: EngineInterface): Promise<Player> {
  const root = $.plugin.root
  try {
    const os = await $.process.run(['uname', '-s'], { timeoutMs: 3000 })
    if (os.stdout.trim() === 'Darwin') return { kind: 'mac' }
    const wsl = await $.process.run(
      ['sh', '-c', 'command -v powershell.exe >/dev/null 2>&1 && wslpath -w "$1"', 'sh', root],
      { timeoutMs: 3000 },
    )
    if (wsl.exitCode === 0 && wsl.stdout.trim() !== '') return { kind: 'powershell', root: wsl.stdout.trim() }
    const bin = await $.process.run(['sh', '-c', 'command -v paplay || command -v pw-play || command -v aplay'], {
      timeoutMs: 3000,
    })
    const found = bin.stdout.trim().split('\n')[0] ?? ''
    return bin.exitCode === 0 && found !== '' ? { kind: 'linux', bin: found, root } : { kind: 'none' }
  } catch {
    // No uname: Claude Code runs on Windows itself.
    try {
      await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', 'exit'], { timeoutMs: 5000 })
      return { kind: 'powershell', root }
    } catch {
      return { kind: 'none' }
    }
  }
}

// Volume: normal (about a chat notification) · quiet (about the Windows "Ding") · off.
export type SoundLevel = 'normal' | 'quiet' | 'off'
export const SOUND_LEVELS: readonly SoundLevel[] = ['normal', 'quiet', 'off']

export async function soundLevel($: EngineInterface): Promise<SoundLevel> {
  const value = await $.store.get('sound')
  if (value === false || value === 'off') return 'off'
  return value === 'quiet' ? 'quiet' : 'normal'
}

// Sounds that land together keep only the most important (no coin over a level-up).
export async function play($: EngineInterface, name: Sfx, character: CharacterId): Promise<void> {
  const level = await soundLevel($)
  if (level === 'off') return
  const now = await $.clock.now()
  if (now - audio.lastAt < 400 && PRIORITY[name] <= audio.lastPriority) return
  audio.lastAt = now
  audio.lastPriority = PRIORITY[name]
  audio.player ??= detectPlayer($)
  const player = await audio.player
  const file = level === 'quiet' ? `assets/sfx/${character}/quiet/${name}.wav` : `assets/sfx/${character}/${name}.wav`
  if (player.kind === 'mac') {
    void $.audio.play({ asset: file }).catch(() => undefined)
  } else if (player.kind === 'powershell') {
    const path = `${player.root}\\${file.replaceAll('/', '\\')}`.replaceAll("'", "''")
    void $.process
      .run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${path}').PlaySync()`], {
        timeoutMs: 10000,
      })
      .catch(() => undefined)
  } else if (player.kind === 'linux') {
    void $.process.run([player.bin, `${player.root}/${file}`], { timeoutMs: 10000 }).catch(() => undefined)
  }
}
