#!/usr/bin/env bash
# Recording setup: a copy of the mod under another name (so the demo never touches your
# real progress) and a tiny repository with one failing test.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D=/tmp/cappl-demo
rm -rf "$D/cappl-pals-demo" "$D/repo"
mkdir -p "$D"
rsync -a --exclude .claude-plugin/types "$ROOT/mod/" "$D/cappl-pals-demo/"
cd "$D/cappl-pals-demo"
python3 - <<'PY'
import json
p = '.claude-plugin/plugin.json'; d = json.load(open(p)); d['name'] = 'cappl-pals-demo'; json.dump(d, open(p, 'w'), ensure_ascii=False, indent=2)
p = 'types/index.d.ts'; s = open(p).read().replace("    'cappl-pals': {", "    'cappl-pals-demo': {"); open(p, 'w').write(s)
p = 'hooks/register.tsx'; s = open(p).read().replace("{ plugin: 'cappl-pals', key:", "{ plugin: 'cappl-pals-demo', key:")
anchor = "    runtime.key = `ledger:${await $.session.id()}`"
seed = anchor + """
    // Demo only: start at Lv14, 12 rep short of Lv15, with $642 ($8 short of the banjo).
    if ((await $.store.get('seeded')) === undefined) {
      await $.store.set('archive', { fame: 2526, dust: 1262, days: {}, lastAt: 0, activeSince: 0 })
      const owned = ['locki/aviators', 'locki/feather', 'locki/harmonica', 'cappl/round-specs', 'cappl/straw', 'cappl/coffee']
      await $.store.set('wallet', { spent: 620, owned, equipped: owned })
      await $.store.set('seeded', true)
    }"""
assert anchor in s
s = s.replace(anchor, seed); open(p, 'w').write(s)
PY
mkdir -p "$D/repo/src" "$D/repo/test" && cd "$D/repo"
cat > package.json <<'JSON'
{ "name": "trail", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > src/trail.js <<'JS'
// Total riding time of a trail, as h:mm.
export function rideTime(legs) {
  const minutes = legs.reduce((sum, leg) => sum + leg.minutes, 0)
  const hours = Math.floor(minutes / 60)
  return `${hours}:${minutes % 60}`
}
JS
cat > test/trail.test.js <<'JS'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rideTime } from '../src/trail.js'

test('one leg', () => {
  assert.equal(rideTime([{ to: 'Dry Creek', minutes: 95 }]), '1:35')
})

test('adds the legs', () => {
  assert.equal(rideTime([{ minutes: 80 }, { minutes: 65 }]), '2:25')
})

test('pads the minutes', () => {
  assert.equal(rideTime([{ minutes: 125 }]), '2:05')
})
JS
git init -q && git config user.name "cappl-pals demo" && git config user.email demo@example.com
git add -A && git commit -qm "Trail ride time"
cat > "$D/tmux.conf" <<'CONF'
set -g default-terminal "tmux-256color"
set -as terminal-overrides ",*:RGB"
set -g status off
set -g history-limit 5000
CONF
echo "ready: $D (before the first take, start claude once in $D/repo and trust the folder)"
