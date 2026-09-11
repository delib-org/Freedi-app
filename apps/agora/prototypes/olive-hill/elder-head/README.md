# Elder head expression study

A separate Blender-authored head study at `../head.html`. It does not replace any villagers or alter Agora logic.

The viewer supports orbit by dragging, wheel zoom, a 0–100% smile control, an eased smile cycle, a separate blink, and a front-view reset. The GLB has actual vertex morph targets named `Smile` and `Blink`, not image swaps or video. A neutral mesh and both morph targets are exported with zero starting weights.

## Authoring and scope

Run Blender 5 in background mode with `source/build_head.py`. It reads the retained MakeHuman anatomical base and age targets in `../characters/source`, builds and subdivides a head, transfers facial expression displacements, bakes a 2048px skin atlas in Blender, builds individual silver hair fibers, eyes and an upper tooth arch, saves the editable `source/elder-head.blend`, and exports `elder-head.glb`. Neutral, smiling and three-quarter offline previews are saved in `previews`.

The skin starts from the neutral frontal reference supplied by the user in this conversation. It is projected onto anatomical geometry and blended into a skin atlas. This is an approximation: it does not reconstruct the exact face from multiple views, remove all photographic lighting, or supply scanned pore geometry. Side likeness, the hairline, eye materials and expression anatomy require further artistic refinement. This is a reviewable experiment, not a finished photoreal character. The reference image is retained solely to reproduce this user-requested asset.

The base mesh, age targets and seven expression target data files are CC0 assets from MakeHuman Community. See `../characters/source/MAKEHUMAN-LICENSE.md`, section C. Expression data came from the official `makehuman/data/targets/expression/units/caucasian` directory on 2026-09-10. MakeHuman's internal target category names describe its asset organization and are not identity claims about the depicted person. No MakeHuman application source code is incorporated.

Validation includes offline Blender renders and GLB structure/morph checks. Browser interaction and performance on physical phones are not certified by those checks.
