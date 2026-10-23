# Reward design

cappl-pals pays for results a person can check, not for how much Claude did, and it is paced so that a steady user reaches level 50 in about 1,000 active hours. The numbers below come from replaying 27 days of one heavy user's Claude Code history (185 active hours, 216 sessions) through the same rule code the mod runs (`tools/sim.ts`).

## Principles

| Principle | Why |
|---|---|
| Currency only for checked results: passing tests, fixed failures, commits, merged PRs | Counting activity makes people produce activity (the removal of GitHub's streak counter, Hacktoberfest 2020's spam PRs). Intrinsic motivation drives quality; rewards drive quantity (Cerasoli et al., 2014). |
| Nothing for prompts, turns, tool calls, tokens or lines | That would reward burning through usage limits. |
| Diminishing returns within a day, not hard caps | Stops farming one kind of result without blocking a normal busy day. |
| No streaks, no penalties, no decay | A broken streak lowers later engagement (Silverman & Barasch, 2023). The pals never get sick or leave, like Finch or Neko Atsume. |
| Rest is rewarded | An hour of work followed by a 20-minute break earns "Campfire rest". |
| Currency buys cosmetics only; no loot boxes, no trading | No gambling mechanics, no power race between people. |
| The rules are visible | `/cappl-rules` shows the table, today's counts and the current multiplier. |

## What the history showed

| Measure | Value |
|---|---|
| Active time (stretches with no gap over 10 minutes) | 184.7 h over 27 days, 6.8 h a day |
| Test runs judged | 840 passed, 478 failed |
| Commits / merged PRs | 908 / 73 |

Four findings shaped the rules:

1. **93% of failed test runs exited with code 0.** Agents pipe test output (`pytest | tail -5`), so the exit code says success. cappl-pals reads the runner's summary line instead (`3 failed, 9 passed`, `Some tests failed`, `--- FAIL`, `ℹ fail 1`).
2. **Almost every commit used `git commit -q`,** which prints no line counts. A commit's size is estimated from the number of file edits since the previous commit.
3. **Turns end without a person.** Background agents keep finishing turns, so presence (for breaks and the daily reward) counts only prompts a person sent.
4. **Plan mode was barely used.** "Trail mapped" stays for people who do use it; it hardly moves the curve.

## Reward table

| Reward | What happened | Rep | Gold | Full value per day |
|---|---|---|---|---|
| Bullseye | First passing test after editing files (reruns pay 0) | 5 | 3 | 12 |
| Showdown won | A test failed, files were edited, it passes | 8 | 5 | 5 |
| Claim staked | `git commit` succeeded (not `--amend`, `--allow-empty`, `--dry-run`) | 3 | 2 | 10 |
| └ tested bonus | A Bullseye since the previous commit | +5 | +3 | |
| └ small bonus | 1 to 8 file edits since the previous commit | +2 | 0 | |
| Gold strike | `gh pr merge` merged (not an auto-merge request) | 15 | 10 | 4 |
| Trail mapped | A plan approved (ExitPlanMode) before any edit | 3 | 2 | 5 |
| Campfire rest | Back after 20 min to 4 h away, having worked 60+ min | 2 | 4 | stops at 4 |
| Saddled up | The first prompt of the day | 0 | 10 | stops at 1 |

- **Taper:** past the daily full value a reward is worth half; past twice that, a fifth. Counts are summed across sessions.
- **Day boundary:** 05:00 on the local clock, so working past midnight still counts as the same day.
- **Share of rep in the replay:** commits 44%, Bullseye 25%, Gold strike 18%, Showdown won 13%. 691 of 908 commits fell in the taper, so an agent committing 30 times a day gains little from it.

## Known gaps

- **Faked output.** `echo "3 passed"` inside a test command would fool the parser. With no competition and no leaderboard there is nobody to cheat; the taper limits the gain.
- **Editing the store.** Progress is plain JSON on your machine. It only changes your own pals.
- **Test runners with no summary line** never count as a pass; an error exit counts as a failure.

## Growth curve

Rep for the next level is `round(30 × level^0.9)`; level 50 needs 26,189 in total. Hours below divide by the replay's median rep per active hour (25.7).

| Level | Rank | Total rep | Hours |
|---|---|---|---|
| 1 | Greenhorn | 0 | 0 |
| 5 | Stable Hand | 271 | 11 |
| 10 | Trail Rider | 1,134 | 44 |
| 15 | Wrangler | 2,538 | 99 |
| 20 | Rodeo Rookie | 4,458 | 173 |
| 25 | Deputy | 6,881 | 268 |
| 30 | Ranger | 9,794 | 381 |
| 35 | Sheriff | 13,189 | 513 |
| 40 | Marshal | 17,057 | 664 |
| 45 | Frontier Hero | 21,392 | 832 |
| 50 | Legend of the West | 26,189 | 1,019 |

The first level comes within an hour, the first new rank on day one, level 10 within the first week. Because the exponent is below 1, later levels grow slowly instead of dragging.

At the slowest quarter of days (18.6 rep/h) level 50 takes about 1,410 hours; at the fastest quarter (36.0 rep/h) about 730.

## Gold and the wardrobes

Each character has ten items in six slots (eyes, mouth, head, hat, hand, stage), one item per slot. Prices are set so that each item is affordable soon after it unlocks. Both wardrobes together cost $18,920, about what the replay earns in 970 hours (19.6 gold per active hour). So dressing up one pal fully comes well before level 50, and finishing both comes near the end.

| Unlock | LOCKI | CAPPL | Price | Unlocks at |
|---|---|---|---|---|
| Lv1 | Aviator shades | Round specs | $50 | 0 h |
| Lv3 | Pink feather | Wheat straw | $60 | 3 h |
| Lv6 | Harmonica | Tin cup of coffee | $200 | 16 h |
| Lv10 | Heart shades | Outlaw bandana | $400 | 44 h |
| Lv14 | Lasso | Banjo | $650 | 86 h |
| Lv19 | Gold sheriff star | Sparrow friend | $900 | 157 h |
| Lv24 | Desert noon | Campfire | $1,100 | 247 h |
| Lv30 | White ten-gallon hat | Black hat | $1,500 | 381 h |
| Lv38 | Desert sunset | Starry night | $2,000 | 601 h |
| Lv46 | Starry night hat | Golden banjo | $2,600 | 868 h |

## Retuning

The baseline is one person who runs several sessions in parallel and whose agents commit often, so most people will be slower. Run `tools/extract_events.py` and `tools/sim.ts` on your own history (see the README) and change `LEVEL_BASE` in `mod/hooks/rules.ts`; prices follow the same scale.

## Left out on purpose

- Rewards for tokens, turns, prompts, tool calls or lines; usage leaderboards
- Streaks, pets that suffer when ignored, items you can lose
- Loot boxes, trading, paid currency
- Personal rankings and manager dashboards
- Lines written by a model at run time (they would spend your usage)
