import { expect, test } from 'claude-code/testing'

import { focusSteps, livePeers, readPeer, spotOf, ttyOf } from '../hooks/peers'

test('a spot comes from what the terminal set, and the tty from ps', () => {
  expect(ttyOf('ttys003\n')).toBe('/dev/ttys003')
  expect(ttyOf('pts/2')).toBe('/dev/pts/2')
  expect(ttyOf('??')).toBeUndefined()
  expect(spotOf({ TERM_PROGRAM: 'iTerm.app', __CFBundleIdentifier: 'com.googlecode.iterm2', TMUX: '/tmp/tmux-501/default,123,0', TMUX_PANE: '%3' }, '/dev/ttys009')).toEqual({
    app: 'com.googlecode.iterm2',
    program: 'iTerm.app',
    tty: '/dev/ttys009',
    tmux: { pane: '%3', socket: '/tmp/tmux-501/default' },
  })
})

test('each terminal is brought forward its own way, the app last', () => {
  const iterm = focusSteps({ app: 'com.googlecode.iterm2', program: 'iTerm.app', tty: '/dev/ttys009' })
  expect(iterm[0]![0]).toBe('osascript')
  expect(iterm[0]!.at(-1)).toBe('/dev/ttys009')
  expect(iterm[1]).toEqual(['open', '-b', 'com.googlecode.iterm2'])
  // Inside tmux the pane is chosen through tmux, not by the tty.
  expect(focusSteps({ app: 'com.apple.Terminal', program: 'Apple_Terminal', tty: '/dev/ttys001', tmux: { pane: '%3' } })).toEqual([
    ['tmux', 'switch-client', '-t', '%3'],
    ['tmux', 'select-window', '-t', '%3'],
    ['tmux', 'select-pane', '-t', '%3'],
    ['open', '-b', 'com.apple.Terminal'],
  ])
  expect(focusSteps({ wezterm: '7' })).toEqual([['wezterm', 'cli', 'activate-pane', '--pane-id', '7']])
  expect(focusSteps({})).toEqual([])
})

test('only live waits of other sessions count, the longest waiting first', () => {
  const now = 100_000
  const peers = [
    readPeer('a', { project: 'a', since: 90_000, seenAt: now - 1_000, spot: {} }),
    readPeer('b', { project: 'b', since: 80_000, seenAt: now - 2_000, spot: { orca: { bin: 'x' } } }),
    readPeer('self', { project: 'me', since: 50_000, seenAt: now, spot: {} }),
    readPeer('gone', { project: 'gone', since: 10_000, seenAt: now - 60_000, spot: {} }),
    readPeer('junk', 'nope'),
  ].filter(peer => peer !== null)
  const live = livePeers(peers, 'self', now)
  expect(live.map(peer => peer.id)).toEqual(['b', 'a'])
  // A half-written spot is dropped, not trusted.
  expect(live[0]!.spot).toEqual({})
})
