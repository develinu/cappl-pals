# Reward design

cappl-pals pays for results a person can check, not for how much Claude did. Rep comes only from results; gold comes from results and from three bonuses on top of them (level chests, the day's bounties and lucky nuggets). A steady user reaches level 50 in about 830 active hours. The numbers below come from replaying 28 days of one heavy user's Claude Code history (189 active hours) through the same rule code the mod runs (`tools/sim.ts`).

## Principles

| Principle | Why |
|---|---|
| Currency only for checked results: passing tests, fixed failures, commits, merged PRs | Counting activity makes people produce activity (the removal of GitHub's streak counter, Hacktoberfest 2020's spam PRs). Intrinsic motivation drives quality; rewards drive quantity (Cerasoli et al., 2014). |
| Nothing for prompts, turns, tool calls, tokens or lines | That would reward burning through usage limits. |
| Diminishing returns within a day, not hard caps | Stops farming one kind of result without blocking a normal busy day. |
| No streaks, no penalties, no decay | A broken streak lowers later engagement (Silverman & Barasch, 2023). The pals never get sick or leave, like Finch or Neko Atsume. |
| Rest is rewarded | An hour of work followed by a 20-minute break earns "Campfire rest". |
| Small, frequent gold; rep stays slow | Gold is what people said they work for, so it now arrives every few results (chests, bounties, nuggets). Rep only paces ranks and tricks. |
| Playing with the pal costs nothing and earns no rep | Petting and tricks are free. A treat costs a little gold. Only the day's pal bounty pays, once. |
| Currency buys cosmetics and treats only; no loot boxes, no trading | No gambling mechanics, no power race between people. Lucky nuggets are free, small, and ride only on real results. |
| The rules are visible | `/cappl-rules` shows the table, today's counts and the current multiplier. |

## What the history showed

| Measure | Value |
|---|---|
| Active time (stretches with no gap over 10 minutes) | 188.8 h over 28 days, 6.7 h a day |
| Test runs judged | 1,017 passed, 518 failed |
| Type checks, lints and builds judged | 98 clean, 60 with errors |
| Commits / opened PRs / merged PRs | 948 / 84 / 78 |

Four findings shaped the rules:

1. **92% of failed test runs exited with code 0.** Agents pipe test output (`pytest | tail -5`), so the exit code says success. cappl-pals reads the runner's summary line instead (`3 failed, 9 passed`, `Some tests failed`, `--- FAIL`, `ℹ fail 1`).
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
| Clean shot | A type check, lint or build with no errors after editing files (`tsc`, `eslint`, `ruff check`, `cargo build`, `npm run build` and the like) | 2 | 2 | 15 |
| Poster up | `gh pr create` opened a pull request | 4 | 3 | 5 |
| Gold strike | `gh pr merge` merged (not an auto-merge request) | 15 | 10 | 4 |
| Trail mapped | A plan approved (ExitPlanMode) before any edit | 3 | 2 | 5 |
| Campfire rest | Back after 20 min to 4 h away, having worked 60+ min | 2 | 4 | stops at 4 |
| Saddled up | The first prompt of the day | 0 | 10 | stops at 1 |

- **Taper:** past the daily full value a reward is worth half; past twice that, a fifth. Counts are summed across sessions.
- **Day boundary:** 05:00 on the local clock, so working past midnight still counts as the same day.
- **Share of rep in the replay:** commits 41%, Bullseye 24%, Gold strike 16%, Showdown won 12%, Poster up 5%, Clean shot 2%. 721 of 948 commits fell in the taper, so an agent committing 30 times a day gains little from it.

## Bonus gold

| Bonus | When | Gold |
|---|---|---|
| Level chest | Each level reached (paid once per level, across sessions) | $5 + the level |
| Bounty | Three a day: one to do with the pal (pet three times, give a treat, or see two tricks) and two from the work (Bullseye ×3, two commits, Clean shot ×2, a Showdown, a merge, a new PR, a campfire rest or a mapped trail) | $5 for the pal's, $8–$15 for the work ones |
| All three bounties | The day's three are done | $15 |
| Lucky nugget | About one result in sixteen, at random | $5–$15 |

The day's bounties are the same in every session and are picked from the date, weighted toward the ones most days can finish. In the replay, with the pal's bounty done each day, gold came 66% from results, 19% from nuggets, 9% from bounties and 6% from chests: 34.2 gold per active hour, about $77 a day from the bonuses alone.

## Playing with the pal

| Action | Cost | What happens |
|---|---|---|
| Pet | Free | Heart eyes and floating hearts; three pets in a row start a wiggle. |
| Trick | Free | The newest learned trick, then the others in turn. Each pal learns ten, at Lv2, 4, 7, 12, 17, 23, 29, 35, 42 and 50. |
| Treat | $6 | The pal eats a star cookie or a maple biscuit, then blushes for 10 minutes and plays idle tricks twice as often. |

None of these earn rep. They count toward the pal's daily bounty, and learned tricks also turn up as idle actions.

## Known gaps

- **Faked output.** `echo "3 passed"` inside a test command would fool the parser. With no competition and no leaderboard there is nobody to cheat; the taper limits the gain.
- **Editing the store.** Progress is plain JSON on your machine. It only changes your own pals.
- **Test runners with no summary line** never count as a pass; an error exit counts as a failure.
- **Checks need the tool to be what runs.** `tsc`, `npm run lint` and the like count when they start the command or follow `&&`, `;`, `|` or `npx`; a check wrapped some other way (`bunx -p typescript tsc`, `timeout 60 tsc`) is missed.
- **Shared keys have no lock.** The wallet, the level chest and the day's bounties are shared by all sessions and each is read and written straight back. Two sessions finishing the same bounty within a few milliseconds could both pay it.

## Growth curve

Rep for the next level is `round(30 × level^0.9)`; level 50 needs 26,189 in total. Hours below divide by the replay's median rep per active hour (31.4).

| Level | Rank | Total rep | Hours |
|---|---|---|---|
| 1 | Greenhorn | 0 | 0 |
| 5 | Stable Hand | 271 | 9 |
| 10 | Trail Rider | 1,134 | 36 |
| 15 | Wrangler | 2,538 | 81 |
| 20 | Rodeo Rookie | 4,458 | 142 |
| 25 | Deputy | 6,881 | 219 |
| 30 | Ranger | 9,794 | 312 |
| 35 | Sheriff | 13,189 | 420 |
| 40 | Marshal | 17,057 | 543 |
| 45 | Frontier Hero | 21,392 | 681 |
| 50 | Legend of the West | 26,189 | 834 |

The first level comes within an hour, the first new rank on day one, level 10 within the first week. Because the exponent is below 1, later levels grow slowly instead of dragging. Every level also opens a chest, and a new trick comes every few levels, so a level-up always brings something to see.

At the slowest quarter of days (23.7 rep/h) level 50 takes about 1,100 hours; at the fastest quarter (39.6 rep/h) about 660.

Compared with 0.1, the curve is the same. Clean shot and Poster up add about 8% more rep, and the replayed history is a busier month, so level 50 comes sooner (834 hours instead of 1,019).

## Gold and the wardrobes

Each character has ten items in six slots (eyes, mouth, head, hat, hand, stage), one item per slot. Prices are set so that each item is affordable soon after it unlocks. Both wardrobes together cost $23,720, about what the replay earns in 690 hours (34.2 gold per active hour), around when the last items unlock. So dressing up one pal fully comes well before level 50, and finishing both comes near the end. Prices went up in 0.2 because gold per active hour rose from 19.6 to 34.2: the bonuses, the two new rewards and a busier month in the replay.

| Unlock | LOCKI | CAPPL | Price | Unlocks at |
|---|---|---|---|---|
| Lv1 | Aviator shades | Round specs | $50 | 0 h |
| Lv3 | Pink feather | Wheat straw | $60 | 3 h |
| Lv6 | Harmonica | Tin cup of coffee | $250 | 13 h |
| Lv10 | Heart shades | Outlaw bandana | $500 | 36 h |
| Lv14 | Lasso | Banjo | $800 | 71 h |
| Lv19 | Gold sheriff star | Sparrow friend | $1,100 | 128 h |
| Lv24 | Desert noon | Campfire | $1,400 | 202 h |
| Lv30 | White ten-gallon hat | Black hat | $1,900 | 312 h |
| Lv38 | Desert sunset | Starry night | $2,500 | 492 h |
| Lv46 | Starry night hat | Golden banjo | $3,300 | 711 h |

## Retuning

The baseline is one person who runs several sessions in parallel and whose agents commit often, so most people will be slower. Run `tools/extract_events.py` and `tools/sim.ts` on your own history (see the README) and change `LEVEL_BASE` in `mod/hooks/rules.ts`; prices follow the same scale.

## Left out on purpose

- Rewards for tokens, turns, prompts, tool calls or lines; usage leaderboards
- Streaks, pets that get hungry, sad or sick when ignored, items you can lose
- Loot boxes, trading, paid currency
- Personal rankings and manager dashboards
- Lines written by a model at run time (they would spend your usage)
