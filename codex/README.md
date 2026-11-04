# cappl-pals for Codex

[한국어 안내](README.ko.md)

The Codex adapter builds the original Claude Code registration code, rules, characters,
animations and sounds without changing `mod/`. Pick RIKI, CARO or NUMO in a local browser
companion or an Orca sidebar beside your terminal. Care, tricks, treats, rewards,
wardrobes, English/Korean and sound controls share the same local progress.

## Build and install

Build with Bun; run with Node.js 22 or later. From the repository root:

```sh
bun run --cwd codex build
bun run --cwd codex test
codex plugin marketplace add "$PWD"
codex plugin add cappl-pals-codex@cappl-pals-codex-dev
```

Restart the desktop app and start a new Codex conversation. Review and trust the
installed lifecycle hooks in Codex before expecting automatic events. Installation
does not approve hook trust or change Codex permission decisions.

```sh
node codex/dist/cli.mjs open
node codex/dist/cli.mjs command cappl-status
```

`open` uses the default browser. Other commands include `cappl` (toggle),
`cappl-pick riki|caro|numo`, `cappl-rules` and `cappl-sound`. The installed `cappl`
skill explains these commands. Select a Codex session and language in the companion;
characters, purchases and gold are shared. Set `CAPPL_PALS_SESSION` for CLI commands.

After changes, rebuild, reinstall the Codex plugin and restart the desktop app.
Stop the running companion with `node codex/dist/cli.mjs stop`, then reopen it.

## Orca sidebar

Use Orca desktop 1.4.246 or later and Node.js 22 or later on the same machine.
From the repository root:

```sh
bun run --cwd codex build
orca plugin validate "$PWD/codex/dist/orca" --json
orca plugin inspect "$PWD/codex/dist/orca" --json
orca plugin dev load "$PWD/codex/dist/orca" --json
```

The first load returns `approval_required`, an access list and a fingerprint.
Review the list, then use the returned command with `--approve <fingerprint>`.
The bridge runs its own Node process with your user account's machine access;
it requests no Orca host capabilities such as terminal reading or input. Later
code changes in an approved development folder also run, so use a trusted folder.
With an Orca workspace open, show the panel:

```sh
orca plugin open local.cappl-pals-orca --panel companion --json
```

This is an Orca panel, not a native Codex panel. It uses the same companion server
and progress as the browser. Choose the Codex session in the header. Loading it
does not trust Codex hooks or create rewards from Orca session events.
`open -a Orca <url>` does not install or open this sidebar.

The build creates `codex/dist/orca/`. Keep it beside the generated `cli.mjs` and
`server.mjs`; it is not a standalone plugin distribution. Node must be on Orca's
PATH, or set `CAPPL_PALS_NODE` in Orca's launch environment. Rebuilding updates the
development plugin. Remove it with:

```sh
orca plugin dev unload "$PWD/codex/dist/orca" --json
```

If an old browser link shows a blank page, obtain a new link with
`node codex/dist/cli.mjs url`. The initial request needs `?token=...`; older launchers
used `#token=...`, which the server could not read and rejected with HTTP 403.
After loading, the page moves the token into the fragment. Keep tokens private.

## Events and limits

Prompt/model/tool/permission/stop hooks drive the pal's mood. The adapter maps patch
tools to edits and shell results to the original result-based reward rules. Long
commands accumulate streamed output and award only once their final result arrives.
Tests, checks, commits, PR creation and merges use the original rule engine.
Completing a plan tool is not human approval: use **Approve plan** before editing.

Claude's `$.ui`, spinner and keyboard integration are not injected into Codex.
Use buttons, CLI commands or the skill instead of Claude-specific slash commands.
Sounds reuse the original platform players and require an available audio player.
The automated suite covers original rules/art/animation, HTTP integration,
authenticated page loading and the Orca worker bridge. Actual Codex hook delivery,
visible browser/sidebar rendering and speaker playback require manual checks.

## Local data and security

Data lives in `${CODEX_HOME:-~/.codex}/cappl-pals/` (override with `CAPPL_PALS_DATA`).
`store.json` holds shared progress, session state, duplicate receipts and pending
commands; `endpoint.json` contains the local token; `daemon.log` records errors.
Claude progress files are not read or changed.

The server binds only to loopback on a random port, requires a token for every
request and rejects cross-origin requests. Mutations are serialized and writes use
an atomic rename. The Orca worker only forwards the companion's view, button,
command and language endpoints; it cannot forward arbitrary URLs or hook events.

`src/runtime.ts` adapts the original runtime, `src/engine.ts` renders it,
`src/events.ts` and `src/server.ts` handle hooks, and `orca/worker.mjs` bridges the
sidebar. `build.ts` bundles the original code and shares one HTML UI across both
surfaces instead of copying the game rules.
