# Deliberation stage — 3D prototype

A standalone HTML/CSS/JS simulation (Three.js via CDN) of a possible 3D
deliberation stage: a lantern-lit 1789 Paris night square (the agora) where
every proposal is a pavilion ("room"). It explores the interaction model
before any real-game implementation:

- **First-person look-around** — drag to look, WASD/arrows to walk the square.
- **Rooms** — 6 pavilions around the plaza, each showing a proposal board
  (owner, text, support bar). Your own pavilion has a gold roof + trim.
- **Travel between rooms** — click a pavilion (or a notification) and the
  camera flies there cinematically; a bottom sheet opens with room details
  and mock actions (suggest improvement / support / watch / back).
- **Notifications** — floating gold badge counters above rooms, a bell HUD
  with a drawer listing events ("new suggestion to improve your proposal",
  "a proposal you watch changed", "your improvement was accepted",
  "3 new proposals"). Entering a room clears its badge. A simulated live
  event lands ~14s in to show the loop.
- **Atmosphere** — matches the game's style capsule: deep indigo night, warm
  gold time-lantern glow, cobblestones, Paris skyline with lit windows,
  fireflies, rising idea-lanterns, the blue CHRONOS portal, bloom
  post-processing.

## Run

Needs internet (Three.js + Heebo font from CDN):

```bash
cd apps/agora/prototypes/deliberation-3d
python3 -m http.server 8765
# open http://localhost:8765
```

All geometry/textures are procedural (canvas) — no image assets. Everything
(rooms, notifications) is mock data at the top of `index.html`, shaped like
what the real game would feed it.
