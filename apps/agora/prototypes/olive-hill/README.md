# Agora — Olive Hill station demo

A standalone Hebrew-first Three.js prototype. It does not connect to Agora's live sessions or database.

Run `python3 -m http.server 8766` from this directory, then visit http://localhost:8766.

Walk with WASD/arrows, drag to look, or use the guided-walk button. Touch devices also have directional controls. Approach the cottage, meet the elder, open the writing desk and submit a proposal. Empty/whitespace proposals are rejected. The answer is stored only in this browser's localStorage; storage failure is shown without claiming success. The elder thanks the player. Escape closes the writing dialog.

Enable sound using the music button. Wind, birds and a soft plucked musical accompaniment are original Web Audio synthesis, not recorded nature or a recorded soundtrack. Audio pauses in hidden tabs. High quality uses up to 2× device pixel ratio, shadows and dense vegetation; the economy toggle reduces rendering load.

## Proposal board

Click the physical wooden board near the cottage, or use “לוח ההצעות” in the top toolbar, to read four clearly labeled sample proposals on pastel papers. Each has five radio-button feelings from loving to hating. Ratings are device-local, replaceable and restored on reload, including the neutral value. Storage failure restores the previous selection and shows an error.

Submitting your proposal flies a white sheet from the writing desk to its place on the 3D board, with the camera following it. The enlarged board then opens and highlights your white paper. Reduced-motion preferences skip the flight. Existing proposals load from the original answer storage key; editing replaces the same white note instead of duplicating it. User text is rendered with textContent, not interpreted as HTML. No live participant data or server-side rating aggregation is connected.

## Art and scope

The rolling terrain, stone cottage, tiled roof, olive trees, individual leaves, wind-animated grass, path and writing desk are real 3D geometry authored procedurally in JavaScript. Selective ink contours and Hebrew comic speech bubbles provide the manga direction. No Blender assets were used in this iteration.

The elder is a high-resolution transparent **2D camera-facing cutout**, not an animated 3D human model. It provides detailed realistic anatomy and face rendering for this first interaction prototype, but cannot be viewed from behind. Replacing it with a rigged GLB character is the principal remaining fidelity step.

`assets/wise-greek-elder.png` was generated with the built-in ImageGen tool, 1024×1536 RGBA. Prompt: “One wise elderly Greek woman, age 75, realistic human anatomy and naturally wrinkled face, silver braided hair in a bun, ivory linen dress, muted teal shawl, leather sandals. Gentle welcoming expression, one open welcoming hand. Sophisticated Japanese manga painted realism, very fine ink lines, detailed natural adult proportions. Entire standing body visible head to feet, facing camera slightly turned. Warm late-afternoon illumination from upper left. High-resolution isolated character cutout with genuinely transparent alpha background. No scenery, furniture, ground plane, cast ground shadow, text, logo, or watermark.”

Three.js 0.170.0 is vendored locally under its MIT license. No runtime CDN or API is required. HTTP is needed for JavaScript modules. WebGL is required.

## Verification

JavaScript syntax, local imports/assets and DOM element references are checked; the local HTTP entrypoint returns 200. Interactive browser testing and device performance profiling have not yet been performed.

The board's behavior was additionally checked in jsdom with canvas drawing stubbed: 20 rating options, neutral and negative values, persistence, failed-save rollback, flight completion, literal user-text rendering, reloading, editing without duplication, reduced motion and malformed storage recovery. These checks do not validate visual rendering or GPU performance.
