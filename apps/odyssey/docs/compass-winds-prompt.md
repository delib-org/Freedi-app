# Image prompts — the four winds of the compass

Four emblems, one per card on `/compass` (ארבע רוחות המצפון). They exist so the
four cards stop reading as one long form: a player scrolling back should know
which wind they are looking at before reading a word of it.

They live in `apps/odyssey/public/assets/compass/` under these exact names —
the game loads them by filename.

| File | Wind | The question the card asks | Emblem | State |
|---|---|---|---|---|
| `wind-love.webp` | רוח האהבה | what is best here, and worth keeping and nurturing | a brass heart locket: compass rose, wave, sail | ✅ landed |
| `wind-worry.webp` | רוח הדאגה | what you fear most in the years ahead | — | ⬜ open |
| `wind-listen.webp` | רוח ההקשבה | who is not listened to enough | a conch shell on a brass stand | ✅ landed |
| `wind-decide.webp` | רוח ההכרעה | what should still guide you when no answer is good | a ship's helm | ✅ landed |

Each emblem has to answer its own question, not just look nautical. The test
is a player who glances at the picture and can guess which wind it belongs to
before reading the heading: a heart is what you love, a shell held to the ear
is listening, a helm is the hand that has to decide anyway.

Generate as PNG with alpha; integration is
`cwebp -q 90 -resize 256 256 -alpha_q 100 <in>.png -o wind-<slug>.webp`.
Nothing breaks in the meantime: a missing emblem removes itself and the card
keeps its headline-only header.

## Technical requirements

1. **Square**, ~1024² or larger, PNG **with alpha**. If the model cannot
   deliver transparency, deliver on flat `#0d2b43` and say so — the integrator
   masks.
2. **The object fills the frame** with a small even margin. It is displayed at
   **68 px** (48 px on a phone), so it has to survive that: one object, bold
   silhouette, no fine engraving, no thin outlines, no busy background.
3. **Four different silhouettes and four different dominant colours.** This is
   the whole point, and the three that landed have spent three of them:
   heart-shaped warm gold, wide pearl-and-rose teardrop, dark-wood spoked
   circle. The fourth must not be another circle and must not be another warm
   brass — see below.
4. **No text anywhere.** No letters, numbers, labels, plaques, engraved words,
   watermarks or UI. The game draws its own Hebrew headings.

## The style the delivered three set

Not the "single object floating in space" this doc first asked for. What
actually works, and what the fourth has to match: **one antique nautical
object, rendered semi-photoreally as if catalogued on a museum shelf** —
crisp, three-quarter or straight-on, warm light from the upper right, real
weathered material (cast brass with patina, seasoned oak, sea-polished shell),
clean alpha, no ground, no shadow plate, no scene.

## Still open — `wind-worry.png` (רוח הדאגה)

The card asks *ממה את/ה הכי חושש/ת בשנים הקרובות?* — what do you fear in the
years ahead. The emblem has to say **warning**, not merely weather, and it has
to stay legible beside a heart, a shell and a wheel. Recommended: a ship's
bell. Its silhouette is unlike the other three, and a bell is the sound a ship
makes when something is wrong.

> Painterly semi-realistic digital illustration of a single antique nautical
> object, catalogued as if on a museum shelf. Centered, filling the frame with
> a small margin. Warm light from the upper right, soft shadows, crisp
> material detail. Transparent background, no ground, no shadow plate, no
> scene, no frame, no border. Bold readable silhouette that still reads when
> shrunk to a 68-pixel icon. ABSOLUTELY NO text, letters, numbers, labels,
> plaques, engraved words, watermarks or UI elements.
>
> The object: an old ship's alarm bell hanging from a weathered iron bracket,
> its rope pull swinging, caught mid-strike. The metal is dark storm-grey
> bronze gone cold and green-black with salt patina — NOT warm polished brass;
> this is the coldest and darkest of four emblems that otherwise glow. One
> pale steel highlight down the bell's lip. Dominant colours: storm grey, cold
> green-black patina, one thin steel gleam.

Alternative, if the bell reads too much like a church: **a storm lantern** — a
square-sided brass ship's lantern with smoke-darkened glass and a low,
guttering flame inside, the metal blackened and salt-eaten. Silhouette is a
box with a small warm core; dominant colours soot black and dim amber.

## QA checklist

- [ ] exact filename, square, alpha clean (no white or dark halo)
- [ ] zero readable text or numbers anywhere
- [ ] shrink to 68 px: still instantly distinguishable from the other three
- [ ] one visual family with the three that landed, and with the islands and
      `ship.png` — same light, same hand
