# Deliberation stage — 3D prototype ("House of Deliberation")

A standalone HTML/CSS/JS simulation (Three.js via CDN) of a possible 3D
deliberation stage: a bright, hopeful sci-fi council hall (the game's
"Time-Lab mode" — luminous white-and-blue CHRONOS aesthetic with the warm
gold signature accent). It explores the interaction model before any
real-game implementation:

- **First-person look-around** — drag to look, WASD/arrows to walk the hall.
- **Rooms = deliberation pods** — 6 pods ringed around a central holo-core,
  each with a floating holographic screen (owner, proposal text, support
  bar). Your own pod is gold-trimmed; others are cyan.
- **Travel between rooms** — click a pod (or a notification) and the camera
  flies there cinematically; a bottom sheet opens with room details and mock
  actions (suggest improvement / support / watch / back).
- **Notifications** — pulsing gold badge counters float above pods, a bell
  HUD with a drawer lists events ("new suggestion to improve your proposal",
  "a proposal you watch changed", "your improvement was accepted",
  "3 new proposals"). Entering a pod clears its badge. A simulated live
  event lands ~14s in to show the loop.
- **Realism / atmosphere** — PBR materials with image-based lighting
  (RoomEnvironment), a real-time mirror floor (Reflector) under a brushed
  overlay, domed shell with glowing rib rings, warm sun-shaft through the
  oculus, holographic core column with orbiting rings and rising particles,
  dust motes, starfield + aurora seen through the glass band, CHRONOS
  portal, bloom post-processing.

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
