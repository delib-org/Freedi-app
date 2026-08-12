# Agora — Icon Brief (3D UI icons)

Every icon the interface shows, the emoji it replaces, and a ready-to-paste
generation prompt. **All prompts share one style capsule** so the whole set
reads as a single family. Paste a prompt as-is into Gemini (AI Studio or the
Gemini app), Midjourney, or any image model.

> **This is the UI layer, not the world layer.** `image-brief.md` covers the
> painterly indigo-and-gold *scenes* — the era you travel to. Icons are the
> opposite register: they belong to the app chrome, they are purple glass, and
> they must never look like they were painted in 1789. Two families, on purpose.

---

## 0 · Shared style capsule (the "same style" contract)

Copy this verbatim — it is already embedded at the top of every prompt below.
If you regenerate a single icon, keep this block **unchanged** or it will drift
out of the family.

```
A single 3D-rendered app icon for a children's educational game, in a soft
"glass-clay" style: a chunky rounded soft-body form with generously filleted
edges, made of semi-translucent frosted glass over an opaque matte-clay core,
with a faint inner glow. Glossy but not mirror-like — soft specular highlights,
no sharp reflections, no environment reflections.

Camera: straight-on front view with a slight 10-degree downward tilt,
near-orthographic, no perspective distortion, no dramatic angle.
Lighting: one soft broad key light from the upper left, wide gentle fill, a
faint cool rim light on the lower right edge. Consistent across every icon.

Palette — use ONLY these colors:
  violet light  #a98cf7   violet mid  #8b6bf0
  violet strong #7350e3   violet deep #5b39c9
  mint accent   #56dfc0   pink accent #f56aa8   gold accent #ffd23f
Gradients run violet-light at the top to violet-deep at the bottom.
Accents are for a single small detail only, never the main body.

Composition: one object, centered, filling about 78% of the frame with even
padding on all sides, nothing cropped. Flat pure white #FFFFFF background,
completely plain — no floor, no cast shadow, no gradient, no vignette.
Square 1:1, 1024x1024.

No text, no letters, no numbers, no logos, no watermark, no UI frame, no
border, no drop shadow, no photorealism, no cartoon outlines.
```

### The one rule that outranks the palette

From `src/styles/tokens.scss`: **MINE is purple. A CLASSMATE'S is white.**

This is load-bearing game semantics, not decoration — a student must never have
to read a label to know whose object they are looking at. So:

| Ownership | Icon treatment |
|---|---|
| **Mine** (my proposal, my score, my edits) | saturated violet gradient body, lit, glowing |
| **A classmate's** (their proposal, their thread) | clear/frosted **white** glass, colorless, with only a thin `#6f6795` hairline edge and a faint violet shadow inside |
| **Neutral chrome** (settings, sound, close) | violet, but desaturated toward `#8b6bf0` flat, no glow |

An icon that breaks this rule is wrong even if it's beautiful.

### RTL

The app runs Hebrew-first. Prefer **direction-neutral** compositions
(symmetrical, or facing the viewer). Anything with an implied left→right
reading (arrows, a hand offering, a progress trail) gets flipped by CSS in RTL,
so it must still read correctly mirrored — or be redesigned symmetric.

### Technical specs

| Use | Aspect | Render px | Ship as | Max size |
|---|---|---|---|---|
| Standard UI icon | 1:1 | 1024 × 1024 | WebP @ 256px | ≤ 25 KB |
| Hero icon (celebration, score, results) | 1:1 | 1024 × 1024 | WebP @ 512px | ≤ 60 KB |

Ship to `apps/agora/public/icons/<name>.webp`. Budget the whole set at
**≤ 600 KB** — this runs on school wifi and student phones.

Gemini renders an **opaque** background, so the flat `#FFFFFF` in the capsule is
deliberate: most icons sit on white cards (`--bg-card-solid`) and can ship
un-keyed. For the ones that sit on the lavender page (`--bg-page #f2eefd`),
background-remove first.

---

## 1 · How to keep 30 icons in one style

Three levers, in order of effect:

**1. Contact sheet (strongest).** Ask for a 3×3 grid of nine icons in a *single*
image. They then share one lighting rig, one material, one camera by
construction — drift is impossible within a sheet. Slice afterwards. Use
§2 below. Keep sheet 1 as the anchor for everything later.

**2. Reference chaining.** Once one icon is right, attach it to every
subsequent prompt with:
> *"Match the material, lighting, camera angle, proportions and palette of the
> attached reference exactly. Change only the object itself."*

**3. Never edit the capsule.** Not one word. Change only the SUBJECT line.
Most "why do these look different?" cases are a quietly reworded capsule.

---

## 2 · Sheet 1 — the nine core icons (start here)

Paste this whole block. This is the anchor sheet; everything else matches it.

```
[STYLE CAPSULE — paste §0 verbatim here, but replace the last Composition
paragraph with the following:]

Composition: a 3x3 grid of NINE separate icons on one canvas, evenly spaced with
generous even gutters, each icon centered in its own cell at identical optical
size, all nine sharing exactly the same material, lighting, camera angle and
finish. Flat pure white #FFFFFF background across the whole canvas. Square 1:1,
2048x2048.

The nine icons, in reading order:
1. A closed book standing upright, in saturated violet gradient glass, with a
   small warm gold lantern-glow escaping from between its pages. (my proposal)
2. The same closed upright book, but made of clear colorless frosted white
   glass with a thin cool grey #6f6795 edge and no glow at all. (a classmate's
   proposal)
3. Two rounded soft-body hands clasped in a handshake, symmetrical, violet
   gradient, a small mint #56dfc0 spark where they meet. (proposals I helped)
4. Two open hands cupped together facing the viewer, symmetrical, violet
   gradient, holding a small floating gold #ffd23f spark. (thank you)
5. A small arched bridge seen straight on, symmetrical, violet gradient, its
   two banks in amber #e0873c and teal #14a08f. (bridging two camps)
6. A classical temple front with four columns and a triangular pediment,
   symmetrical, violet gradient. (the town square)
7. A rounded speech bubble, plain, violet gradient, with a small pink #f56aa8
   dot in its center. (conversation)
8. A theatre mask pair, symmetrical, violet gradient. (people of the era)
9. A four-pointed sparkle star, symmetrical, gold #ffd23f gradient with a
   violet core. (class record / celebration)
```

---

## 3 · Sheet 2 — score, results, progress

```
[STYLE CAPSULE + the 3x3 grid Composition paragraph from §2]

The nine icons, in reading order:
1. A bar chart of three ascending rounded bars, violet gradient, tallest bar
   tipped in mint #56dfc0. (results)
2. A trophy cup with two handles, symmetrical, gold #ffd23f gradient with a
   violet base. (winning proposal)
3. A checkered flag furled around a rounded pole, violet gradient. (lap done)
4. A balance scale, perfectly symmetrical and level, violet gradient with one
   amber #e0873c pan and one teal #14a08f pan. (weighing the camps)
5. A rounded wrench and screwdriver crossed symmetrically, violet gradient.
   (improve a proposal)
6. A pencil standing upright at a slight tilt, violet gradient, mint #56dfc0
   tip. (edit)
7. A circular arrow loop, symmetrical, violet gradient. (rate again)
8. A three-step podium seen straight on, symmetrical, violet gradient, the
   center step topped in gold #ffd23f. (podium)
9. A spiral vortex tunnel seen head-on, symmetrical, violet gradient
   deepening toward the center with a small gold #ffd23f point of light at the
   vanishing point. (time tunnel)
```

---

## 4 · Sheet 3 — the five rating faces

These must be **one sheet, never separate renders** — a rating scale reads as a
scale only if the five faces are visibly the same face. Note the row is
horizontal, not a grid.

```
[STYLE CAPSULE, but replace the Composition paragraph with:]

Composition: a single horizontal row of FIVE separate round face icons on one
canvas, evenly spaced, identical size, identical head shape, identical
material and lighting — the same character with five different expressions.
Flat pure white #FFFFFF background. Wide canvas, 2560x512.

Simple rounded soft-body glass-clay spheres with minimal features: two small
oval eyes and one mouth line, no nose, no ears, no hair. Left to right:
1. Strongly disapproving — deep frown, angled brows. Body in muted rose #d13d4e.
2. Mildly disapproving — small frown, flat brows. Body in soft warm grey.
3. Neutral — straight mouth line, relaxed brows. Body in plain violet #8b6bf0.
4. Mildly approving — small smile. Body in light violet #a98cf7.
5. Strongly approving — wide smile, bright eyes. Body in mint #56dfc0.

Keep the five heads at identical scale and identical eye placement so the row
reads as one scale. No text, no numbers, no emoji styling.
```

---

## 5 · Icon inventory

The emoji currently hardcoded in `src/`, and what replaces each. Counts are
occurrences at time of writing.

| Emoji | Uses | Meaning | Sheet | Ownership |
|---|---|---|---|---|
| 📘 | 60 | my proposal | 1.1 | **mine — purple** |
| 📙 | 30 | a classmate's proposal | 1.2 | **theirs — white** |
| 🤝 | 17 | proposals I helped | 1.3 | mine |
| 🙏 | 9 | thanks (the attestation) | 1.4 | neutral |
| 🌉 | — | bridging | 1.5 | neutral |
| 🏛️ | 3 | the square / agora | 1.6 | neutral |
| 💬 | 9 | conversation | 1.7 | neutral |
| 🎭 | 9 | people of the era | 1.8 | neutral |
| ✨ | 14 | class record / celebration | 1.9 | neutral |
| 📊 📈 📉 | 8 | results | 2.1 | neutral |
| 🏆 🏅 | 4 | winning proposal | 2.2 | neutral |
| 🏁 | 3 | lap done | 2.3 | neutral |
| ⚖️ | — | weighing the camps | 2.4 | neutral |
| 🛠️ | 2 | improve | 2.5 | mine |
| ✏️ | 6 | edit | 2.6 | mine |
| 🔁 | 2 | rate again | 2.7 | neutral |
| 🥇🥈🥉 | 6 | podium | 2.8 | neutral |
| 🌀 | — | time tunnel | 2.9 | neutral |
| 😠🙁😐🙂😍 | 15 | rating scale | 3 | — |
| 💡 💭 | 7 | idea / thought | *sheet 4* | mine |
| 🙌 | 6 | weave the idea in | *sheet 4* | mine |
| 🔇 🔊 | 2 | sound toggle | *sheet 4* | chrome |

Sheet 4 (the remainder) follows the same recipe once sheets 1–3 are approved —
no point writing it until the anchor style is locked.

---

## 6 · After generation

Drop the render at `mock/icons-sheet.png` and run:

```bash
node scripts/icon-slice.mjs      # → public/icons/*.webp
npx tsx scripts/icon-proof.ts    # → mock/icon-svg-proof.html (both registers)
```

The script slices the 3×3, keys out the ground, crops each object to a common
optical size and encodes WebP at 256 — sheet 1 lands at **83 KB for nine**,
well inside the 600 KB budget.

One thing in it is worth knowing before you generate sheet 2. The key that
finds background — *bright, near-neutral, and connected to the border* — walks
straight through cell 2, because a classmate's proposal IS white and the fill
cannot tell frosted glass from the paper behind it. That cell is keyed on
neutrality instead: the ground is pure grey, the glass carries a faint violet
cast, and that cast is the whole margin. **Any future white-glass object needs
the same treatment** — add it to `CELLS` with `key: 'neutral'`, or it will
dissolve and you will get a silhouette of its own edges back.

## 7 · Where the renders are actually used

`src/components/HeroIcon.ts` is the entry point, and it enforces one rule:
**below 40px it does not use a render at all**, it draws (`Icon.ts`). So a slot
asks for a hero and gets whichever register survives at that size. Wired now:

| Slot | Size | Gets a render? |
|---|---|---|
| Stage-transition card | 88 | for `era`, `bridge`, `square` — the other three stages want sheet 2/4 |
| My proposal, workshop header | 40 | yes — the violet book |
| A classmate's proposal, rate card | 40 | yes — the white book |

The ownership pair is the reason those last two moved together. A violet render
for mine and a drawing for theirs would read as a hierarchy, and ownership is
the one thing in this app that must never imply rank.

Everything else in the app is 14–32px and stays drawn — which is most of it.
Generating sheets 2–4 does **not** change that; it only unlocks the three
remaining stage-transition cards (`tunnel`, `thought`, `flag`) and any future
hero slot. That is the honest size of the gap.

## Summary checklist

| # | Sheet | Icons | Status |
|---|---|---|---|
| 1 | Core objects | 9 | ✅ generated, sliced, shipped to `public/icons/` |
| 2 | Score & progress | 9 | ⬜ needed — unlocks `tunnel` + `flag` on the transition card |
| 3 | Rating faces | 5 | ⬜ optional — the scale renders at 26px, below the floor |
| 4 | Remainder | ~6 | ⬜ needed for `thought` on the transition card |
