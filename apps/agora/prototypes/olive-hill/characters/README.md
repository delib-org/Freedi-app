# Village cast — Blender source and web models

Six fictional adult villagers, three women and three men, with individually blended age/anatomy, a range of skin tones, and secular and traditional costume choices. Clothing is a design choice, not an inference about a real person's beliefs or intelligence.

- Ezra: older man, silver hair and beard, knitted kippah, pale linen.
- Miriam: older woman, ochre headscarf, teal linen.
- Naama: younger woman, dark gathered hair, terracotta linen.
- Amir: younger man, dark skin, short curls, blue linen.
- Ruth: older woman, dark skin, short silver hair, plum linen.
- Noam: younger adult man, light skin, brown beard and kippah.

`source/village-cast.blend` is the editable Blender 5.0 master. `source/build_characters.py` recreates it, exports the six GLBs, and renders the previews. Run the script with Blender's background Python runner. The source anatomy and age targets are retained for reproducibility. There are no external textures or network requirements at runtime.

The models contain actual 3D anatomical faces, eyes, hands, clothing and hair. They are static mesh characters with a subtle scene-level idle turn, not skeleton-rigged walking or lip-sync characters. The art is an anatomy-based game prototype, not photorealistic scanned humans. The companion renders are offline Blender inspection images; browser and physical-phone performance have not been visually certified.

## Provenance

MakeHuman Community `makehuman/data/3dobjs/base.obj` and twelve `makehuman/data/targets/macrodetails/*.target` data assets were obtained from the official repository on 2026-09-10. Repository tree at retrieval: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. These data assets are CC0 1.0, as described in the retained `source/MAKEHUMAN-LICENSE.md`, section C. No MakeHuman application source code was copied. The new build script, clothes and styling were authored for this project.

Primary license: https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md
Base asset: https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj

The vendored GLTFLoader and BufferGeometryUtils are from Three.js r170, matching the scene's Three.js version, under the existing `vendor/LICENSE.three.txt` MIT license.
