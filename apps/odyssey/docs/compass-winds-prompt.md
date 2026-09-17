# Image prompts — the four winds of the compass

Four emblems, one per card on `/compass` (ארבע רוחות המצפון). They exist so the
four cards stop reading as one long form: a player scrolling back should know
which wind they are looking at before reading a word of it.

Deliverables drop into `apps/odyssey/public/assets/compass/` under these exact
names — the game loads them by filename:

| File | Wind | The question the card asks | Emblem |
|---|---|---|---|
| `wind-love.webp` | רוח האהבה | what is best here, and worth keeping and nurturing | an open keepsake chest |
| `wind-worry.webp` | רוח הדאגה | what you fear most in the years ahead | a storm gathering |
| `wind-listen.webp` | רוח ההקשבה | who is not listened to enough | a listening horn |
| `wind-decide.webp` | רוח ההכרעה | what should still guide you when no answer is good | a sextant sighting one star |

Each emblem has to answer its own question, not just look nautical. The test
is a player who glances at the picture and can guess which wind it belongs to
before reading the heading: a chest is what you keep, a storm is what is
coming, a horn is listening, a star is what you steer by when there is no good
course.

Generate as PNG with alpha; whoever integrates them converts to `.webp` (that
is one `cwebp -q 90` per file). Nothing breaks in the meantime: a missing
emblem removes itself and the card keeps its old headline-only header.

## Technical requirements

1. **Square**, 1024×1024, PNG **with alpha**. If the model cannot deliver
   transparency, deliver on flat `#0d2b43` and say so — the integrator masks.
2. **The emblem fills the frame** with a small even margin. It is displayed at
   **58 px** (44 px on a phone), so it has to survive that: one object, bold
   silhouette, no fine engraving, no thin outlines, no busy background.
3. **Four different silhouettes and four different dominant colours** — this is
   the whole point. Two round brass things are two cards a player cannot tell
   apart at thumbnail size.
4. **No text anywhere.** No letters, numbers, labels, plaques, engraved words,
   watermarks or UI. The game draws its own Hebrew headings.
5. **One shared world**: the same painterly semi-realistic hand, the same warm
   late-afternoon Mediterranean light from the upper right, as the islands in
   `public/assets/islands/` and `ship.png`. Generate `wind-love` first, then
   ask for the others "in the same style, light and palette as this one".

## Shared style block

Prepended to each of the four subject lines below (nano-banana takes it inline):

> Painterly semi-realistic digital illustration of a single object, centered,
> filling the frame with a small margin. Golden-age-of-sail adventure-map
> style, the look of an antique nautical keepsake. Warm late-afternoon
> Mediterranean light from the upper right, soft shadows. Palette of cream and
> sand stone, weathered brass and gold, deep blue-turquoise accents. Bold
> readable silhouette that still reads when shrunk to a 58-pixel icon: one
> object only, no scene, no horizon, no frame, no border, no vignette.
> Transparent background (if transparency is unsupported, flat #0d2b43).
> ABSOLUTELY NO text, letters, numbers, labels, plaques, engraved words,
> watermarks or UI elements.

## The four prompts

**1 — `wind-love.png` (רוח האהבה — what is worth keeping and nurturing)**

> [shared style block] The object: an open sea-chest of dark weathered wood
> with weathered brass corners and a brass lock plate, its lid raised, warm
> golden light spilling out of the inside so the chest reads as holding
> something precious. Resting across the open lid, one fresh olive sprig with
> green leaves — the one living thing in the picture. Not a pirate's hoard of
> coins: a household keepsake chest, the things a family carries and tends.
> Dominant colours: warm gold light, dark wood, olive green.

**2 — `wind-worry.png` (רוח הדאגה — what you fear is coming)**

> [shared style block] The object: a single dense, dark slate-blue
> thundercloud, sculpted and heavy, with one pale lightning fork breaking
> downward out of its underside and a cold rain-grey veil beneath it. The cloud
> alone, no land, no sea, no ship — the thing on the horizon that has not
> arrived yet. Coldest and darkest of the four emblems. Dominant colours: slate
> grey-blue and cold silver, with one thin amber gleam along the cloud's lit
> upper edge.

**3 — `wind-listen.png` (רוח ההקשבה — who is not heard)**

> [shared style block] The object: an antique brass ear trumpet — a listening
> horn, the wide bell turned toward the viewer as if held out to catch a quiet
> voice, its narrow end curving away. Warm polished brass with soft patina, a
> wrapped leather grip. It must read as an instrument for HEARING, not a
> megaphone for shouting: the bell is open to us, the small end points away.
> Dominant colours: warm polished brass and cream highlight — the brightest of
> the four emblems.

**4 — `wind-decide.png` (רוח ההכרעה — what guides you when no answer is good)**

> [shared style block] The object: an antique brass sextant, seen three-quarter
> on so its arc and sighting telescope read as a clear wedge, raised as if
> being sighted; above and beyond it a single bright silver-white star with a
> soft glow, the one fixed point in a deep midnight-blue field. The star is
> small but unmistakable. Dominant colours: deep midnight blue and silver-white
> star light, with brass warmth only on the instrument itself.

## QA checklist

- [ ] 4 files, exact names, square, alpha clean (no white halo)
- [ ] zero readable text or numbers anywhere
- [ ] shrink each to 58 px: still instantly distinguishable from the other three
- [ ] one visual family with the islands and the ship — same light, same hand
