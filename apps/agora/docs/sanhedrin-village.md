# Sanhedrin village — first connected playable slice

The village is an optional view of the existing Agora session, not a new data store or game engine for decisions. Enter a normal student session and choose “כניסה לכפר התלת־מימדי”, or keep `?world=village` before the hash route. The teacher continues using the existing stage-plan editor and progression controls.

The existing plan controls the actual route. A story question goes to the story garden; a needs question to the needs courtyard; ordinary questions and deliberation to the workshop; voting/results to the council. Framing goes to the study house. Multiple questions retain distinct item IDs even when they share one physical place. Omitted stages do not need to be visited. Past items retain existing read-only semantics, and future items cannot be entered before the teacher opens them.

## Actual integration

`VillageShell` shows the Three.js scene, validates same-origin messages against the exact iframe window, and opens the existing `GameController` stage view over the village. Those existing views continue to use Agora's authenticated session, listeners, confirmed writes, ratings, votes, progress and results. The scene cannot advance a session or write to Firestore. For active deliberation only, the controller sends the visible, non-hidden proposals to the physical board. The personal proposal is white. The physical board shows up to six papers; the full native activity retains access to all proposals.

The art is rendered by a second Vite HTML entry at `/prototypes/olive-hill/village.html`. Eight 2D villagers replace the rejected procedural Blender villagers, including the supplied silver-haired elder at the study house, and the original demo guide at the workshop. `characters-2d.js` is the registry for additional user-supplied characters. Their textured planes turn around the vertical axis to face the camera, remaining upright and preserving image proportions and colors. Entering a station in the standalone tour opens a large portrait with its question; real sessions continue opening the existing activity. Six additional user-supplied characters now populate the story garden, needs courtyard and council. Shared stations offer portrait selection in the standalone encounter. Blender experiments remain archived but are not loaded by the village.

The standalone scene is explicitly a tour. It does not simulate saving student work or pretend to have a live class. The old olive-hill prototype and its local-only board remain separate.

## Current boundaries

- Native activity panels provide writing and rating over the 3D world. Direct five-face rating on 3D paper, a confirmed-write letter flight, richer character animation and a fully world-integrated writing surface remain future work.
- The teacher can shorten/reorder the route with the existing editor. A vote still requires a preceding source of proposals. A new teacher interface to preload candidates for a voting-only session has not been added.
- No production Firebase deployment or authentication-domain changes have been made. The connected game runs against the local emulator session for this delivery. The private Sites link is only the scene tour.
- Build, TypeScript, lint and the 313 Agora tests pass, including five new route/entry guard tests. No GPU/visual or real-phone performance certification is implied.

## Local verification

Start the existing emulator stack and Agora dev server. Run `npm run preflight`, then `npm run fast` in `apps/agora`. Open the emitted student join URL, with `?world=village` before `#!/join/…`. Use the emitted teacher URL to open another stage. The village follows that stage while the existing server remains authoritative.
