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

Village notifications now mount the classic Inbox itself and use the existing
requestFocus dispatcher through a presentation navigator. Teacher destinations
continue to use their existing route. The classic ThreadChat is also used in the
local demo, with a local transport adapter for messages, resolutions and seen
watermarks; the hand-written demo chat was removed. Demo events enter the same
Inbox storage/deduplication/rendering pipeline. Real sessions keep the existing
Firebase notification detectors/callables. The detector now includes owners of
question-answer notes, not only owners of challenge proposals.

Two-tab verification: sent a message from Maya, opened Noam's notification to the
right thread, replied as Noam, thanked an open suggestion, and checked Maya's
reply notification, thank-you notification, award line and balance increment.
Inbox navigation stays inside the village; the conversation is constrained to
its panel rather than the classic full-screen shell.

## Booths, the council scoreboard and the goal (September 14)

The village now holds **one booth per question of the plan** (`villageBooths` in
`lib/flows/villageRoute.ts`; place id `booth:<itemId>`), the deliberation
included. The library, the study house (lobby) and the council stay fixed;
the booths stand on a ring around the square (`boothLayout` in
`prototypes/olive-hill/village.js`), spaced at least a pavilion apart, each
with its writing desk in front and its board on the back wall **facing the
square**. A booth ahead of the room is built closed (grey sign, "ייפתח
בהמשך"); the room's booth flies a pennant. The 3D station list is visible in
sessions too: walking to another booth and pressing its desk or "לגשת לביתן"
sends `agora-village-select`, which puts that item on screen and opens its
paper. The old story/needs/solution places no longer exist.

**Points parity.** The booth board (`VillageCommunity`) now carries the same
rating control the classic screen for that item shows — the five faces for
proposals and open questions, the heart for stories, the 0…1 steps for needs
and vision — gated exactly as there (write your own note first, only while the
item is live). Every credit is therefore paid in the village as in the classic
game: first draft, rating credit, round appreciation, thanks, revision, weave,
bridging. The simulation asserts these on the participant documents.

**The council scoreboard.** The council's wooden board paints the class map
(`councilPitch` in `lib/flows/villageCouncil.ts`: the field, the goal box,
every rated proposal with its rank, mine in white, a ball on scored ones) and,
once the vote is open, the ballot with its bars (`councilBallot`, hidden
until the teacher reveals them). Pressing it — or the toolbar's "לוח התוצאות"
— opens the live `ResultsBoard`/`HelpersBoard` over the village; at the vote
and the recap it opens the ballot/recap itself.

**The goal as the ballot.** `VotingStageSettings.goalZoneOnly` (teacher
console → "איך נפתחת ההצבעה") narrows every scoreboard (village board, class
map, projector) to the proposals standing in the goal and makes
`prepareVotingStage` draw the ballot from exactly those (`inBridgeZone`, now
in shared-types `agoraGoal.ts` so the server and the board agree). The
default is unchanged: the shared consensus selector.

Verification: `npx tsx scripts/village-sim.mjs` (or via `solo.sh`) — three
browser students, four booths, ratings, an improvement and a thank-you, the
teacher's goal switch, the vote with bars, the recap; screenshots in
`output/village-sim/`.

## Who moves the class: teacher-led or free (September 14)

`AgoraSession.villageNavigation` (`teacher` | `free`, absent = teacher) is set on
the start screen under the village choice and switched live in the console's
settings sheet ("מי מזיז את התלמידים בין התחנות בכפר?").

- **Teacher leads.** Every advance closes whatever the student had open (a
  board left open used to keep its frame, swap its content to the next item
  and pause the walk, so the student stood at the old booth facing an empty
  board with no paper). The shell sends `agora-village-go`; the world walks
  there and answers `agora-village-arrived`; the shell then opens the paper,
  or the board once the student has written, or the ballot/recap at the
  council. The village map stays open, so students roam freely between advances. A
  refreshed page walks the student back to the class.
- **Students navigate.** The map lists every station with its state (● the
  class is here, ✓ open, 🔒 later) and a press walks there; arriving at the
  room's booth with nothing written opens the paper. An advance is announced
  on a line across the top with a "ללכת לשם" button; nobody is moved.
- **Calling the class.** `AgoraSession.villageCall` `{ place, at }`: the
  console's "כולם לתחנה של עכשיו" / "כולם למועצת הכפר · לוח התוצאות". Each
  client acts once per `at`, in either mode; a call met on first render older
  than two minutes is ignored.

The map folds away on phones (≤650px) behind a "🗺 מפת הכפר" toggle.

### Conversations on paper, and the goal switch during the vote (September 14)

A conversation opened from a booth board (improvement ideas, replies) writes
on the same lined village paper as every desk, with a visible label
("כתבו כאן את ההודעה או את הרעיון לשיפור" / "כתבו כאן את התשובה שלכם").
ThreadChat takes an optional `paperLabel`; the classic full-screen chat is
unchanged.

The teacher's live voting card carries the goal switch too ("בקלפי רק ההצעות
שנכנסו לשער"). Flipping it during the vote calls `agoraSetBallotGoalOnly`,
which stores `votingSettings.goalZoneOnly`, redraws `session.voting` through
`prepareVotingStage`, and withdraws (writes `none`) every vote for a proposal
that left the ballot, so the tally and the recap's winner stay consistent;
those students vote again. It refuses while a challenge turn is being judged,
and refuses to empty the ballot when nothing is in the goal yet.

## The booth's two sides: the table and the board (September 14)

At a booth the student moves between two sides, never a screen over the
world:

- **The table.** The camera frames the writing desk with the note on it and
  the booth's guide (`agora-village-view` `{place, view: 'table'}`; the world
  eases there even while paused). The paper opens as the guide's **speech
  bubble**: the world reports the guide's head and the paper's screen position
  (`agora-village-anchor` `{x, y, avoidX, speaker}`), and
  `lib/flows/villageBubble.ts` hangs the bubble on the guide's side away from
  the desk, with a tail pointing at them (centred, tail-less on phones). The
  bubble shows the guide's name, the item's label and prompt, and the stage's
  own writing form — every write, confirmation and payout is unchanged.
- **The board.** Sending flies the paper to the board and the board opens
  (as before). The camera now faces the board (`view: 'board'`) whenever it
  opens — the switch, the floating board button, pressing the 3D board, or
  a teacher advance for a student who has written.
- **Back and forth.** `.village-booth-switch` ("📝 השולחן · הפתק שלי" /
  "📋 הלוח · הפתקים של הכיתה") sits over every booth whose item has a desk.
  On the board, my own note carries "עריכת הפתק שלי · חזרה לשולחן", which goes
  back to the table with the paper open for editing; classmates' notes keep
  their rating control and "קריאה והצעת שיפור".

A stage's fixed room wash (`.shell--place-*::after`) and mode strip used to
escape the paper inside the village and paint the viewport over the world on
the first write; they are hidden inside `.village-shell__activity`.

Verification: `bash ../../scripts/solo.sh npx tsx scripts/village-desk-board.mjs`
(arrive → bubble at the table → write → board → table → board → rate →
edit from the board); screenshots in `output/village-desk-board/`. Inside
the bubble the send row stays pinned to the bottom edge; scroll padding keeps
the writing box above it, so focusing and typing never put text under it.

### Arriving in front of the station (September 14, later)

Tal's rule: a station never opens anything by itself. Every arrival — the
teacher's advance or "everyone to …", a refresh, the map, "go there" — ends
with the student **standing in front of the station**: the camera frames the
guide, the writing table with the note, and the board behind. The guide's
speech bubble (in the world, `#desk-bubble`) shows who speaks, the question,
the instruction, and one button — "✍️ לכתוב את זה על הפתק שלי" (after writing:
"✍️ לערוך את הפתק שלי"). **Only that button opens the paper**, which then
opens as the guide's writing bubble described above.

- `VillageShell.showStation()` is the one way to a station: arrivals
  (`ArrivalAction` `station` | `look`), the switch's "📝 השולחן", the toolbar
  button, and pressing a booth's 3D desk (the world frames the table itself).
  Walking up to another opened booth puts its question on screen and stands
  there. "עריכת הפתק שלי" on the board still opens the paper directly.
- In a lesson the guide's bubble appears only once the camera has settled at
  the table (`viewKind === 'table'`), so it does not show on the way in,
  vanish while the camera turns, and show again. It stays below the shell's
  top controls; the world's "go to" and footer buttons hide at the station.
- The simulation expects this: `expectLedToDesk` checks the student stands at
  the station with nothing open, and `writeAtDesk` presses the guide's button.
- A station far from where the student stands (roaming in "students navigate
  themselves", then pressing "הפתק שלי על השולחן" or "📝 השולחן") is walked
  to first, never flown to. On arrival the shell stands the student there and
  the guide's bubble appears. The world marks that station as the one the
  student stands at, so the guide's bubble belongs to the right booth. A far
  board only opens the board; the camera stays put. The paper, the board and
  the bubble hide the world's own bottom buttons while they are open.
