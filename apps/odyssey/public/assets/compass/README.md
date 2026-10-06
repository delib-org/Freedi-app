# The four wind emblems

`src/lib/compassArt.ts` loads exactly these four files, by name:

- `wind-love.webp` — רוח האהבה
- `wind-worry.webp` — רוח הדאגה
- `wind-listen.webp` — רוח ההקשבה
- `wind-decide.webp` — רוח ההכרעה (the values wind)

Square, alpha, displayed at 68 px (48 px on a phone). A file that is not here
yet removes itself from the card — the compass keeps its headline-only header
until the art lands. How to generate them: `docs/compass-winds-prompt.md`.
