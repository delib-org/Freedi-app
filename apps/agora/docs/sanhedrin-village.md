# Sanhedrin village — first connected playable slice

The village is an optional view of the existing Agora session, not a new data store or game engine for decisions. Enter a normal student session and choose “כניסה לכפר התלת־מימדי”, or keep `?world=village` before the hash route. The teacher continues using the existing stage-plan editor and progression controls.

The existing plan controls the actual route. A story question goes to the story garden; a needs question to the needs courtyard; ordinary questions and deliberation to the workshop; voting/results to the council. Framing goes to the study house. Multiple questions retain distinct item IDs even when they share one physical place. Omitted stages do not need to be visited. Past items retain existing read-only semantics, and future items cannot be entered before the teacher opens them.

## Actual integration

`VillageShell` shows the Three.js scene, validates same-origin messages against the exact iframe window, and opens the existing `GameController` stage view over the village. Those existing views continue to use Agora's authenticated session, listeners, confirmed writes, ratings, votes, progress and results. The scene cannot advance a session or write to Firestore. For active deliberation only, the controller sends the visible, non-hidden proposals to the physical board. The personal proposal is white. The physical board shows up to six papers; the full native activity retains access to all proposals.

The art is rendered by a second Vite HTML entry at `/prototypes/olive-hill/village.html`. Eight 2D villagers replace the rejected procedural Blender villagers, including the supplied silver-haired elder at the council, and the original demo guide at the workshop. `characters-2d.js` is the registry for additional user-supplied characters. Their textured planes turn around the vertical axis to face the camera, remaining upright and preserving image proportions and colors. Entering a station in the standalone tour opens a large portrait with its question; real sessions continue opening the existing activity. Six additional user-supplied characters now populate the story garden, needs courtyard and council. Shared stations offer portrait selection in the standalone encounter. Blender experiments remain archived but are not loaded by the village.

The standalone scene is explicitly a tour. It does not simulate saving student work or pretend to have a live class. The old olive-hill prototype and its local-only board remain separate.

## Current boundaries

- Native activity panels provide writing and rating over the 3D world. Direct five-face rating on 3D paper, a confirmed-write letter flight, richer character animation and a fully world-integrated writing surface remain future work.
- The teacher can shorten/reorder the route with the existing editor. A vote still requires a preceding source of proposals. A new teacher interface to preload candidates for a voting-only session has not been added.
- The dedicated village build (`VITE_DEFAULT_WORLD=village`) now includes the real Agora teacher dashboard, session creation, editable route, student join and session controls. The join URL preserves village mode and uses a hash route supported by static hosting. The canonical deployment is https://agora.wizcol.com (Firebase Hosting site agora-wizcol), using the existing wizcol-app backend and already authorized login domain. Open `https://agora.wizcol.com/?world=village` for the village entry; the normal root keeps the ordinary Agora interface. No authentication-domain changes or backend function deployments are needed. The private Sites preview is not the canonical sign-in entry.
- Build, TypeScript, lint and the 313 Agora tests pass, including five new route/entry guard tests. No GPU/visual or real-phone performance certification is implied.

## Local verification

Start the existing emulator stack and Agora dev server. Run `npm run preflight`, then `npm run fast` in `apps/agora`. Open the emitted student join URL, with `?world=village` before `#!/join/…`. Use the emitted teacher URL to open another stage. The village follows that stage while the existing server remains authoritative.

## Facilitator / student entry

Open `/?world=village` in separate browser profiles (not merely two tabs sharing authentication). The facilitator signs in with Google, creates a custom-question game and edits the route; in village mode the route editor is expanded before the create button. Share the code or join link with the second browser. Students join anonymously. The teacher starts and advances stages and sees saved contributions using the existing session controls. The standalone `/village` tour also links to this entry.

## Preserved pre-village version

`codex/agora-before-village` points to `f5c1088b3`, immediately before the first olive-hill demo commit (`20eec5386`). It is pushed to origin and preserves the entire repository at that point without rewriting the current development branch.

## Room interface and history

New sessions default to `world: village`. StartGame offers village/classic before creation; the server validates and stores the choice. Students resolve it from the shared session even with a bare join code, and an explicit session choice outranks a URL hint. Old sessions without this field retain their previous behavior. The teacher's join links also use the session choice.

Workbox must exclude `/prototypes/` from its SPA navigation fallback: the village iframe needs its own HTML, not index.html (which correctly refuses framing). Entry explicitly checks for a service-worker update.

Teacher history is a collapsed archive with cursor pagination, month grouping, a class filter and search within loaded lessons. It retains all session data and links to reports/solutions. Expired sessions are no longer live banners; legacy sessions without an expiry age out of the active list after a day. The reusable scenario shelf shows six entries initially with an expand control.

Live verification on 2026-09-10 used the signed-in teacher in the in-app browser and an anonymous student in Firefox, joining by code without a world query. Verified village rendering, synchronized station changes, story and proposal submission visible to the teacher, voting (1/1), matching final decision and lesson closure. Also verified monthly archive groups, title search and opening a previous report. The test lesson is retained under a title prefixed `בדיקת מערכת`.

## Local library preview

Run Vite in `apps/agora` and open `/prototypes/library-demo.html`. This separate development entry has no Firebase connection: all preview books are available from the shelf and its SceneStage/VideoScene content is copied from the existing French Revolution seed. It uses the same VillageShell as the real student controller. Learning stages map to the new library; personal story/needs questions retain their existing places. Future books are disabled and previous books use the existing stage navigation reducer. Verified local walking to the library, opening a book, advancing a scene and opening a previous book. Not deployed to production.

### Station boards and coins (local preview, September 10)

Open `/prototypes/community-demo.html?student=maya` and use its link to open
`?student=noam` in a second tab. This explicitly labelled, browser-local demo
uses shared localStorage for the two sample pupils; it never awards real points
or writes a Firebase session. Send an improvement on the other pupil's note,
open the upper-left feedback indicator as the recipient, and thank the helper.
The helper's upper-right gold-coin balance updates across tabs. A refresh keeps
the balance and cannot award the same thank-you again.

In an actual session, VillageCommunity reads the existing proposals and
question answers, reuses ThreadChat, submitThreadMessage and the server's
agoraResolveSuggestion flow, and displays myParticipant.points.total. It does
not maintain a second currency ledger. A sound plays only on a positive balance
change after the initial snapshot; the shared sound preference is respected.
Seen-thread watermarks use the existing participant persistence. Answer notes
can receive replies and thanks; their text is edited through their original
station form, not the proposal-specific thread editor.

Every village station has a clickable world-space board. Only plan items already
unlocked by the teacher can be opened. Multiple questions at the same location
have separate board tabs. Own notes are white; other notes use pastel paper.
Hidden notes are excluded. Local checks: two-tab comment → notification → thanks
→ one coin, balance persistence after refresh, thread/points/route tests, and
component tests for note isolation and one chime per positive balance change.
The actual authenticated two-participant Firebase flow still needs a staging
smoke test before production deployment. These changes have not been deployed.

The personal desk now completes the original demo's submit → curved paper flight
→ station board sequence. VillageShell observes a changed, confirmed own note
while writing, closes the paper, and waits for the world to report landing before
opening the community board. Pending Firestore writes do not launch a flight;
opening existing text or refreshing does not launch one either. The trajectory
starts at the station's writing desk, targets its board, and respects reduced
motion. The landed white note is highlighted. The local demo also restores saved
text when reopening the desk, and edits replace the existing note.
