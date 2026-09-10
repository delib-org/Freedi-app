# Approved 2D direction

The village now uses two women; the other four await user references. Rejected Blender models remain source experiments and are no longer imported by the village.

- `../assets/elder-woman-cutout.png`: 1024×1536 RGBA, produced with built-in image generation editing from the user's full-body reference, Screenshot 2026-09-10 at 09.53.50.png. Final extraction prompt: “Extract this exact elderly woman as a full-body game sprite PNG with TRUE ALPHA TRANSPARENCY. Remove the background only. Output must have transparent pixels, NOT a picture of a checkerboard. Preserve the supplied face, warm smile, hair, dress, pose and hat exactly. Do not generate a replacement person. No checkerboard and no solid background; actual transparent RGBA PNG.” An earlier result had no alpha and was rejected. The accepted result was inspected offline and confirmed to have an alpha channel. AI extraction can introduce small differences from the source; it is not a pixel-identical mask.
- `../assets/wise-greek-elder.png`: original demo artwork, reused unchanged.

The planes use image aspect ratios and unlit sRGB colors to avoid skin-tone distortion. They remain fixed in the world and hide at reverse/edge angles. The encounter portrait retains the whole image and original expression; no synthetic face deformation or claim of facial animation. The registry is `../characters-2d.js`.

## Original-pixel extraction: Amir

`../assets/village-boy.png` comes from the user's white-background `Gemini_Generated_Image_kgyg84kgyg84kgyg.jpeg`. Extracted locally with macOS Vision foreground masking, then white-matte edge cleanup. No image regeneration was used. Confirmed real alpha and inspected against an olive background. Amir is at the needs courtyard. The remaining supplied characters are still pending extraction and are not live.
