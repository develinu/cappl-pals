# Adding a character

A character is four things: pixels, a definition, a voice and a type entry. Nothing else in the mod names RIKI, CARO or NUMO.

A character's `id` is what saved progress and file names use; its `name` is what people see. RIKI and CARO keep the ids they had before they were renamed, `locki` and `cappl`, so existing progress and wardrobes carry over. NUMO's id is `numo`. `/cappl-pick` takes either the id or the name.

## 1. Pixels: `tools/draw_art.py`

Each character has two sizes. The big sprite is 32 × 28 pixels, which the terminal draws as 32 × 14 cells. The small one is 16 × 14 pixels, or 16 × 7 cells. Write two functions, `<id>32()` and `<id>16()`, that return:

| Key | What |
|---|---|
| `ears` | A full-canvas layer drawn first. A look can perk it up or droop it (`ears: 1` or `-1`). |
| `head` | The face and head. Draw a dome under the hat too, so lifting the hat shows a head, not a hole. |
| `hat` | Drawn over the head. Hat items can recolour it. |
| `paws` | Two full-canvas layers, left and right. Looks move them into poses: tapping, cheering, waving, a paw on the chin, holding a cup or a treat. |
| `eyes` | `at` (top-left of each eye) and the `open` stamp, for the items' layout |
| `nose` | `at` and `art` |

Then write the face, `face32(who)` and `face16(who)` (each stamp is art plus an offset from where it is placed):

| Key | What |
|---|---|
| `eyeAt`, `eyes` | Where each eye goes, and ten eye stamps: `open`, `blink`, `closed`, `happy`, `shiny`, `heart`, `star`, `wide`, `x`, `sleepy` |
| `brows` | `worried` and `determined`, a stamp per eye |
| `mouthAt`, `mouths` | `open`, `w`, `o`, `tongue`, `chomp`, `yawn`, `smile` |
| `blush`, `sweat` | Where the cheeks and the drop of sweat go, and their art |
| `bubbleAt`, `treatAt` | Where speech bubbles and the held treat go |

Speech bubbles (`BUBBLE_SYMBOLS`) are shared. Add the character's treat to `TREATS`.

Then write the items: `<id>_items32()` and `<id>_items16()` return `{ item_id: item(layer, frame, ...) }`. The layer decides where an item is drawn:

| Layer | Drawn | For |
|---|---|---|
| `back` | Behind everything, on empty cells only | Backdrops (sparkles still show over them) |
| `face` | Over the eyes and nose | Glasses, bandanas, straws |
| `hat` | Over the hat, lifting with it; `recolor={...}` repaints the hat | Feathers, badges, birds, other hats |
| `hand` | Under the paws, so the paws hold it; put down while the paws are busy | Instruments, cups, ropes |
| `front` | Over everything | Things in front of the ledge |

Pass several frames to animate an item (one frame every 500 ms). Colours are one-letter keys in `PALETTE`; add new ones there.

Add the character to the dictionaries in `__main__`, then run:

```sh
python3 tools/draw_art.py --png /tmp/draft.png   # writes mod/hooks/characters/art.ts and a draft sheet
bun tools/preview.ts /tmp/sheet.png              # the same frames through the mod's own composer
bun tools/preview.ts /tmp/looks.png --looks      # every activity, act and trick
bun tools/preview.ts /tmp/acts.png --acts=wave,treat   # every tick of some acts
```

## 2. Definition: `mod/hooks/characters/index.ts`

Add an entry to `CHARACTERS` with:

- `name`, `color` (the pane's accent), `blurb` and `hello`, in English and Korean
- `sparkle`: `twinkle` or `note`
- `fxColors`: palette keys for each celebration
- `items`: ten items with rising levels and prices
- `tricks`: ten tricks, each an act in `mod/hooks/animations.ts` with the level it is learned at (write new acts there)
- `treat`: the treat's name and price

`IDLE_GAP` in `animations.ts` sets how often an idle pal does something (RIKI every 10 seconds, CARO every 16, NUMO every 18).

Keep the wardrobes' combined price near the economy in [reward-design.md](reward-design.md). When a character's wardrobe is added, lower the prices so that all wardrobes together still cost about the same (as NUMO's arrival did), or decide on purpose that collecting a new character is extra.

## 3. Type: `mod/types/index.d.ts`

Add the id to `CharacterId`.

## 4. Voice: `tools/make_sfx.py`

Write a function that returns the eighteen sounds (`coin`, `comeback`, `fanfare`, `levelup`, `stage`, `buy`, `equip`, `error`, `open`, `close`, `hello`, `pet`, `treat`, `trick`, `fail`, `lucky`, `quest`, `chest`). Add it to the list at the bottom, then run `python3 tools/make_sfx.py`. Loudness is levelled for you.

## Check

```sh
claude plugin test ./mod   # every item of every character must change both sprite sizes
claude plugin validate ./mod
```
