# Agora — Image Brief (French Revolution journey)

Every image the game shows, the screen it belongs to, and a ready-to-paste
generation prompt. **All prompts share one style capsule** so the whole journey
reads as a single film. Paste a prompt as-is into your image model (Midjourney,
DALL·E, Ideogram, Firefly, etc.).

> Images are **data, not hardcoded** — each lives on a scene's `imageUrls`
> (or a character's `portraitUrl`) in the topic package, and teachers can
> replace any of them per screen in the Topic Editor. Filenames below are the
> bundled defaults in `apps/agora/public/scenes/`.

---

## 0 · Shared style capsule (the "same style" contract)

Copy this verbatim — it is already embedded at the top of every prompt below.
If you regenerate a single image, keep this block unchanged so it matches.

```
Cinematic, richly painterly digital illustration for a children's educational
time-travel game. Semi-realistic, hand-painted feel — like a high-end animated
feature concept painting, not a photograph and not cartoon-flat. Dramatic
volumetric lighting, soft depth of field, fine painterly brushwork. A recurring
warm gold "time-lantern" glow appears somewhere in every frame as the game's
signature accent. Cohesive color grade across the whole set: deep indigo
shadows, warm gold highlights, parchment-cream midtones. Wholesome, hopeful,
age 10–14 friendly — intense but never gory. No text, no words, no logos, no
watermarks, no UI, no modern objects in historical scenes. 16:9 landscape.
```

Two sub-moods live inside this one style (same finish, same grade, same gold accent):

- **Time-Lab mode** — the present / the machine. Luminous white-and-blue
  near-future lab, the "CHRONOS" portal, swirling light. Hopeful, clean.
- **Era mode** — Paris, 1789. Painterly historical realism, overcast dramatic
  sky, cobblestones, tricolor blue-white-red. Weighty, alive.

### Technical specs

| Use | Aspect | Suggested px | Format | Max size |
|---|---|---|---|---|
| Scene images | 16:9 landscape | 1536 × 864 | WebP (or PNG) | ≤ 1 MB |
| Home hero | 16:9 landscape | 1600 × 900 | WebP (or PNG) | ≤ 1 MB |
| Character portraits | 1:1 square | 1024 × 1024 | WebP (or PNG) | ≤ 400 KB |

Portraits render as small **circular** avatars — keep the head-and-shoulders
centered with headroom so nothing important is lost to the crop.

---

## 1 · App screens

### 1.1 Home hero — student landing `/`
- **File:** `public/time-machine.png` — ✅ **done**
- **Where:** `Home.ts` `.home-hero__image`, top of the join screen.
- **Prompt:**
```
[STYLE CAPSULE] Time-Lab mode. Hero shot of a friendly near-future time machine:
a large circular portal ("CHRONOS Series X-1") with a glowing blue spiral vortex
inside, mounted in a bright domed laboratory of white and pale blue, holographic
control panels floating beside it. Empty, inviting, awe-struck — an invitation to
step through. Warm gold light spills from the portal rim. 16:9.
```

---

## 2 · Framing scenes — Act I "Through the Tunnel"

### 2.1 Mission brief — scene `scene-intro` ("המשימה")
- **File:** `public/scenes/time-machine-briefing.png` — ✅ **done**
- **Where:** first scene students see; the briefing.
- **Prompt:**
```
[STYLE CAPSULE] Time-Lab mode. A warm female scientist in a white lab coat
briefs a small group of curious teenage students (backpacks, mixed genders and
skin tones, seen from behind) in front of the glowing blue CHRONOS time portal
in a bright white-and-blue lab. She gestures toward the swirling vortex; the
kids look up in wonder. Hopeful, cinematic, gold rim-light from the portal. 16:9.
```

### 2.2 Time tunnel — scene `scene-tunnel` ("מנהרת הזמן")
- **File:** `public/scenes/time-tunnel.png` — ⬜ **needed** *(can be a ≤20s video instead — `videoUrl`)*
- **Where:** pure spectacle between briefing and arrival.
- **Prompt:**
```
[STYLE CAPSULE] Time-Lab mode. First-person plunge THROUGH a time tunnel: a
swirling vortex of blue and gold light streaks rushing past, faint historical
imagery (clock faces, Roman numerals, Parisian rooftops) dissolving in the walls
of the tunnel, a bright warm-gold vanishing point ahead. Motion, speed, wonder.
No people. 16:9.
```

### 2.3 The world you must understand — scene `scene-period` ("פריז, 1789")
- **File:** `public/scenes/french-revolution-intro.png` — ✅ **done**
- **Where:** the period explainer; arrival in revolutionary Paris.
- **Prompt:**
```
[STYLE CAPSULE] Era mode. Paris, 1789: a crowd of ragged but determined
commoners surges through a cobbled street toward the stone towers of the
Bastille, tricolor blue-white-red flags raised high, drums, smoke and dramatic
overcast sky. Heroic and alive, not gory. A shaft of warm gold light breaks
through the clouds. 16:9.
```

---

## 3 · Perspective scenes — Act II "Two Sides, One Country"

### 3.1 The Count's position — scene `scene-royalist` ("בארמון")
- **File:** `public/scenes/perspective-royalist.png` — ⬜ **needed**
- **Where:** `perspectiveA`; the royalist noble presents his case.
- **Prompt:**
```
[STYLE CAPSULE] Era mode. Interior of a gilded 18th-century French palace salon:
an aristocratic nobleman in an embroidered silk coat and powdered wig stands
composed by a tall window, candlelight and gold ornament around him, portraits
and heavy drapes behind. Dignified, sympathetic, a man defending a world he
loves. Warm gold candle-glow. 16:9.
```

### 3.2 Camille's position — scene `scene-jacobin` ("בבית הקפה")
- **File:** `public/scenes/perspective-jacobin.png` — ⬜ **needed**
- **Where:** `perspectiveB`; the Jacobin lawyer presents his case.
- **Prompt:**
```
[STYLE CAPSULE] Era mode. A crowded, smoky 1789 Parisian café: a young idealistic
lawyer in a plain worn coat stands mid-speech among working people, pamphlets and
newspapers strewn on wooden tables, a single lantern lighting earnest faces. Fiery
but sympathetic, a man speaking for the hungry. Warm gold lantern-glow. 16:9.
```

---

## 4 · Needs scenes — Act III "What do you actually need?"

### 4.1 The question that changes everything — scene `scene-needs-q`
- **File:** `public/scenes/needs-question.png` — ⬜ **needed**
- **Where:** `needsQuestion`; the narrator turns to both sides.
- **Prompt:**
```
[STYLE CAPSULE] Era mode, symbolic. The Count (silk and powdered wig) and Camille
(plain worn coat) face each other across a plain wooden table in a neutral stone
room, tension softening into curiosity as they truly look at one another for the
first time. Between them on the table, a small warm gold lantern glows — the shared
question. Quiet, human, hopeful. 16:9.
```

### 4.2 The Count opens up — scene `scene-needs-a`
- **File:** `public/scenes/needs-royalist.png` — ⬜ **needed**
- **Where:** `needsA`; the noble drops his guard.
- **Prompt:**
```
[STYLE CAPSULE] Era mode, intimate. Close three-quarter portrait of the
aristocratic nobleman, powdered wig and silk coat, seated and leaning slightly
forward, guard down — a quieter, more vulnerable expression, worried for his
family. Soft candlelight, shallow depth of field, warm gold key-light. 16:9.
```

### 4.3 Camille opens up — scene `scene-needs-b`
- **File:** `public/scenes/needs-jacobin.png` — ⬜ **needed**
- **Where:** `needsB`; the lawyer stops performing and just speaks.
- **Prompt:**
```
[STYLE CAPSULE] Era mode, intimate. Close three-quarter portrait of the young
lawyer in a plain worn coat, pamphlet lowered in his hand, no longer declaiming —
an honest, tired, human expression, hoping for bread and to be heard. Soft single
lantern light, shallow depth of field, warm gold key-light. 16:9.
```

---

## 5 · Ending scenes

### 5.1 Success — scene `scene-success` ("הצלחתם!")
- **File:** `public/scenes/ending-success.png` — ⬜ **needed**
- **Where:** `successEnding`; both camps accepted the solution.
- **Prompt:**
```
[STYLE CAPSULE] Era mode, triumphant-gentle. A sunlit Paris square at dawn: former
opponents — nobles and commoners — stand together in reconciliation, tricolor flag
flying peacefully, no weapons raised, warm golden sunrise flooding the cobblestones.
Relief and hope. A radiant warm gold glow. 16:9.
```

### 5.2 Honest disagreement — scene `scene-honest-disagreement`
- **File:** `public/scenes/ending-honest-disagreement.png` — ⬜ **needed**
- **Where:** `honestDisagreementEnding`; a dignified ending, not a defeat.
- **Prompt:**
```
[STYLE CAPSULE] Era mode, dignified-quiet. The Count and Camille shake hands or
nod respectfully across the plain wooden table at dusk, still disagreeing but
clearly understanding one another, the time portal's soft gold glow open behind
them signaling "we can try again." Calm, respectful, bittersweet-hopeful. 16:9.
```

### 5.3 Failure (try again) — scene `scene-failure`
- **File:** `public/scenes/ending-failure.png` — ⬜ **needed**
- **Where:** `failureEnding`; the camps drifted apart — but time travel means retry.
- **Prompt:**
```
[STYLE CAPSULE] Era mode, somber-not-hopeless. A cold empty Paris square at grey
dusk, a dropped tricolor flag on wet cobblestones, distant smoke — but in the
foreground the warm gold time portal reopens, inviting another attempt. Melancholy
softened by a second chance. No violence on screen. 16:9.
```

---

## 6 · Character portraits (1:1 square)

Small circular avatars in the needs board and the deliberation feedback cards.
Head-and-shoulders, centered, plain painterly background.

### 6.1 The Count — `char-royalist` (`portraitUrl`)
- **File:** `public/scenes/char-royalist.png` — ⬜ **needed**
- **Prompt:**
```
[STYLE CAPSULE] Era mode, portrait. Square head-and-shoulders portrait of a
middle-aged French aristocrat, 1789: powdered white wig, embroidered silk coat,
composed dignified expression, softly lit against a muted indigo-and-gold painterly
background. Warm gold rim-light. Centered with headroom for a circular crop. 1:1.
```

### 6.2 Camille — `char-jacobin` (`portraitUrl`)
- **File:** `public/scenes/char-jacobin.png` — ⬜ **needed**
- **Prompt:**
```
[STYLE CAPSULE] Era mode, portrait. Square head-and-shoulders portrait of a young
French revolutionary lawyer, 1789: dark tousled hair, plain worn coat, earnest
determined expression, softly lit against a muted indigo-and-gold painterly
background. Warm gold rim-light. Centered with headroom for a circular crop. 1:1.
```

---

## 7 · Optional — EraMap 2.5D world (only if you replace the SVG map)

The journey map (`EraMap`) is currently hand-built **SVG**, so these are optional.
If you ever swap it for painted artwork, these are the `artwork` slots
(`mapBackdropUrl`, `locationVignetteUrls`). Same style capsule, **Era mode at
night** (this is the one place the "Era of Lanterns" night palette leads).

| Slot | Key | Prompt subject |
|---|---|---|
| Map backdrop | `mapBackdropUrl` | Panoramic painted night map of 1789 Paris — river, rooftops, lantern-lit streets, deep indigo sky, gold lanterns; empty stage for markers. 16:9. |
| Portal vignette | `portal` | The glowing gold-blue time portal on the map's edge. |
| Palace vignette | `palace` | The royal palace (left camp), blue-lit, ordered, grand. |
| Assembly vignette | `assembly` | The revolutionary assembly hall (right camp), red-lit, crowded. |
| Square vignette | `square` | The central town square (the agora) where idea-lanterns gather. |

---

## Summary checklist

| # | Image | File | Status |
|---|---|---|---|
| 1 | Home hero | `time-machine.png` | ✅ done |
| 2 | Mission brief | `scenes/time-machine-briefing.png` | ✅ done |
| 3 | Time tunnel | `scenes/time-tunnel.png` | ⬜ needed |
| 4 | Paris 1789 | `scenes/french-revolution-intro.png` | ✅ done |
| 5 | Count's position | `scenes/perspective-royalist.png` | ⬜ needed |
| 6 | Camille's position | `scenes/perspective-jacobin.png` | ⬜ needed |
| 7 | Needs question | `scenes/needs-question.png` | ⬜ needed |
| 8 | Count opens up | `scenes/needs-royalist.png` | ⬜ needed |
| 9 | Camille opens up | `scenes/needs-jacobin.png` | ⬜ needed |
| 10 | Success ending | `scenes/ending-success.png` | ⬜ needed |
| 11 | Honest-disagreement ending | `scenes/ending-honest-disagreement.png` | ⬜ needed |
| 12 | Failure ending | `scenes/ending-failure.png` | ⬜ needed |
| 13 | Count portrait | `scenes/char-royalist.png` | ⬜ needed |
| 14 | Camille portrait | `scenes/char-jacobin.png` | ⬜ needed |
| 15–19 | EraMap artwork (optional) | — | ⬜ optional |

**10 scene/portrait images + 1 optional map set to complete the set.** When you
have a file, drop it in `apps/agora/public/scenes/` under the name above and I'll
wire it into the default topic + seed (and the teacher can already swap any of
them per screen in the Topic Editor).
