# Codex prompt — generate the Odyssey island sprites

Paste everything below the line into Codex (or any image-capable agent).
Deliverables drop into `apps/odyssey/public/assets/islands/` and replace the
current poster-cropped PNGs. The game loads them by filename — keep the names.

---

## Mission

Generate 12 game sprites of tiny Mediterranean islets for a civic voyage
game ("Israeli Odyssey"). Each sprite is one small rocky island carrying one
symbolic monument. If you can run an image-generation model (gpt-image-1 or
similar), write a script that generates each island with the shared style
block + its subject line, then post-process. If you can only produce prompts,
output the 12 final prompts ready for manual generation.

## Shared style block (prepend to every island prompt)

> A tiny rocky Mediterranean islet in open water, carrying {SUBJECT}.
> Painterly semi-realistic digital illustration, golden-age-of-sail
> adventure-map style. Warm late-afternoon Mediterranean light from the
> upper right, cream and sand stone, weathered gold accents, a few dark
> green cypress trees, deep blue-turquoise sea with gentle white foam
> lapping the rocks. Camera: three-quarter aerial view, about 30 degrees
> elevation, the whole islet fits in frame with water margin on all sides.
> Miniature-diorama feel, crisp detail, no people close-up (distant tiny
> figures allowed where specified). ABSOLUTELY NO text, letters, numbers,
> labels, plaques, banners with writing, watermarks, or UI elements.
> Transparent background outside the islet and its immediate water foam
> ring (if transparency unsupported: plain flat #06182c background).

## The 12 islands ({SUBJECT} per file)

| File | Island (Hebrew) | Subject |
|---|---|---|
| island-01.png | האחריות | a tall weathered stone lighthouse with a lit lantern room, waves breaking on the rocks below |
| island-02.png | שלטון החוק | a classical Greek temple courthouse with columns and wide stone steps |
| island-03.png | ניקיון הכפיים | a giant polished brass scale of justice standing on a grassy knoll |
| island-04.png | הבית המדיני | a large weathered canvas negotiation tent with guy ropes, cypress trees around |
| island-05.png | הסערה הביטחונית | a round medieval stone watchtower fortress with a dark flag, storm-worn |
| island-06.png | השותפות הערבית | an old stone arch bridge spanning a channel between two rocky banks |
| island-07.png | השוויון האזרחי | one ancient broad olive tree beside a small stone civic house |
| island-08.png | החוזה האזרחי | a tall stone monument of two engraved tablets (blank surface texture, NO readable letters) with steps |
| island-09.png | השבת והרבנות | an ornate domed synagogue with a deep blue dome and arched windows |
| island-10.png | הלחם והבית | a rustic stone market house with a striped awning, bread loaves and produce baskets outside |
| island-11.png | הדמוקרטיה עצמה | a circular open-air stone amphitheater assembly with a central flag pole and tiny distant figures gathered |
| island-12.png | יחסי החוץ | a brass telescope on a stone pedestal next to an antique globe |

## Technical requirements

1. **Format**: PNG with alpha, 1024×640 minimum per island (wider than tall).
2. **Isolation**: islet + its foam ring only; fully transparent beyond. If
   the model can't do alpha, deliver on flat #06182c and note it — the
   integrator will mask.
3. **Consistency**: same camera angle, light direction, palette and scale
   across all 12 — they sit on one map together. Generate island-01 first,
   then reference it ("same style/angle/palette as the first") for the rest.
4. **No text anywhere** — the game draws its own Hebrew labels. This
   includes engraved letters, flags with writing, and number badges.
5. **Composition**: monument centered, islet base occupying the lower ~40%,
   nothing cropped at the edges.

## Stretch goal (optional, only if a video/animation model is available)

For each island also produce a **seamless-loop animation**, 8–12 frames,
2–3 seconds, static camera, transparent or flat background: water lapping,
foliage swaying, flag fluttering, lighthouse lamp glowing — subtle idle
motion only, no camera movement, first and last frame identical. Deliver as
a horizontal sprite-sheet PNG (`island-01-sheet.png`, equal-width frames,
frame count in the filename or a JSON sidecar). The game engine (Phaser)
will play them as looping sprite animations.

## QA checklist before delivering

- [ ] 12 files, exact names island-01.png … island-12.png
- [ ] zero readable text/numbers in any image
- [ ] alpha edge clean (no white halo)
- [ ] consistent horizon-free background (transparent, not painted sea beyond the foam ring)
- [ ] side-by-side contact sheet included for review
