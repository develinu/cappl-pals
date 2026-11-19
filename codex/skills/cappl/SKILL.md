---
name: cappl
description: Open and control the cappl-pals SUNDUST local companion for Codex, including partner selection, status, rewards and sound. Use for explicit cappl-pals requests.
---
Run `node <plugin-root>/dist/cli.mjs open` to open the companion in the default browser. Resolve
`<plugin-root>` from this skill's installed location (two directories above this
skill directory). The panel has all care, shop, wardrobe, rules and progress controls.

Commands: `node <plugin-root>/dist/cli.mjs command cappl-status`, `cappl-rules`,
`cappl-pick riki|caro|numo`, `cappl-sound`, or `cappl` (toggle).
Set CAPPL_PALS_SESSION to the current Codex session id when known.
Never invent outcome events or award rewards manually. Automatic rewards require
the installed lifecycle hooks to be reviewed and trusted in Codex.
The companion window is external to Codex; do not claim it is a native Codex pane.

For an Orca sidebar request, use the built Orca plugin at
`<plugin-root>/dist/orca`: `orca plugin dev load <plugin-root>/dist/orca --json`,
review the returned access and approval instructions, then
`orca plugin open local.cappl-pals-orca --panel companion --json`.
Do not use `open -a Orca <url>` for a sidebar; that does not install or open a panel.
The bridge runs Node on the local machine and requests no Orca host capabilities.
It uses the same local server and progress as the browser companion.
