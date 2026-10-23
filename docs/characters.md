# Adding a character

A character is four things: pixels, a definition, a voice and a type entry. Nothing else in the mod names LOCKI or CAPPL.

## 1. Pixels: `tools/draw_art.py`

Each character has two sizes. The big sprite is 32 × 28 pixels, which the terminal draws as 32 × 14 cells. The small one is 16 × 14 pixels, or 16 × 7 cells. Write two functions, `<id>32()` and `<id>16()`, that return:

| Key | What |
|---|---|
| `ears` | A full-canvas layer drawn first. While happy it can rise (see `happy.ears`). |
| `head` | The face and head. Draw a dome under the hat too, so lifting the hat shows a head, not a hole. |
| `hat` | Drawn over the head. Hat items can recolour it. |
| `paws` | Two full-canvas layers, left and right. While Claude works they tap in turn. |
| `eyes` | `at` (top-left of each eye), `open`, `blink`, `happy` and `happyAt` stamps |
| `nose` | `at` and `art` |

Then write the items: `<id>_items32()` and `<id>_items16()` return `{ item_id: item(layer, frame, ...) }`. The layer decides where an item is drawn:

| Layer | Drawn | For |
|---|---|---|
| `back` | Behind everything, on empty cells only | Backdrops (sparkles still show over them) |
| `face` | Over the eyes and nose | Glasses, bandanas, straws |
| `hat` | Over the hat, lifting with it; `recolor={...}` repaints the hat | Feathers, badges, birds, other hats |
| `hand` | Under the paws, so the paws hold it; hidden while working | Instruments, cups, ropes |
| `front` | Over everything | Things in front of the ledge |

Pass several frames to animate an item (one frame every 500 ms). Colours are one-letter keys in `PALETTE`; add new ones there.

Add the character to the dictionaries in `__main__`, then run:

```sh
python3 tools/draw_art.py --png /tmp/draft.png   # writes mod/hooks/characters/art.ts and a draft sheet
bun tools/preview.ts /tmp/sheet.png              # the same frames through the mod's own composer
```

## 2. Definition: `mod/hooks/characters/index.ts`

Add an entry to `CHARACTERS` with:

- `name`, `color` (the pane's accent), `blurb` and `hello`, in English and Korean
- `sparkle`: `twinkle` or `note`
- `fxColors`: palette keys for each celebration
- `happy`: how far the hat and ears rise on each tick while happy
- `items`: ten items with rising levels and prices

Keep the two wardrobes' combined price near the economy in [reward-design.md](reward-design.md). When a third character's wardrobe is added, lower the prices so that all wardrobes together still cost about the same, or decide on purpose that collecting a new character is extra.

## 3. Type: `mod/types/index.d.ts`

Add the id to `CharacterId`.

## 4. Voice: `tools/make_sfx.py`

Write a function that returns the eleven sounds (`coin`, `comeback`, `fanfare`, `levelup`, `stage`, `buy`, `equip`, `error`, `open`, `close`, `hello`). Add it to the list at the bottom, then run `python3 tools/make_sfx.py`. Loudness is levelled for you.

## Check

```sh
claude plugin test ./mod   # every item of every character must change both sprite sizes
claude plugin validate ./mod
```
