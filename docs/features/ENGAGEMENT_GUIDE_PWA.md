# Engagement guide and PWA unread counts

The main app now offers a dismissible, context-based guide, contribution links,
and unread indicators across the notification center, conversation tab, and loaded
space hierarchy. The guide uses actual unread updates and unevaluated visible
proposals. It respects disabled evaluation and halted processes; it never posts,
votes or claims consensus on the user's behalf. Dismissal is stored per user on
this browser, with a Show guide control to restore it. All seven languages are included.

A single authenticated feed owns notification state on every route. It combines
the latest 100 history records with all records explicitly marked `read: false`.
Legacy records missing `read` are supported within recent history. Descendant
space indicators require their parent/ancestor metadata to be loaded; the global
counter includes all unread feed records regardless of loaded spaces.

Visiting a discussion no longer deletes its notifications. Chat contributions
become read after two visible seconds, with cancellation when scrolled away or
when the document is hidden. Notification links target the conversation and
contribution; older targets can load outside the initial chat page.

The page and Firebase worker share an atomic IndexedDB badge store. Background
pushes use the persisted baseline and deduplicate contribution IDs. A signed-in
feed replaces that baseline with its unread count. Opening one push never clears
unrelated unread counts. Confirmed sign-out clears the badge. Background counts
reflect delivered pushes until the next authenticated feed sync; silent in-app
updates and reads on another device reconcile on reopening this app.

Numeric launcher badges depend on browser, OS and launcher support. On iOS/iPadOS,
install to the Home Screen and allow notifications. Android launchers may display
a dot instead of a number. The in-app numeric counters work independently.

## Validation

- Focused Jest regression suites cover guide dismissal/restoration, next actions,
  account isolation, badge hydration/sign-out, visible-message read receipts,
  worker push handling and existing notification state/listener cleanup.
- Browser verification with actual IndexedDB covered the persisted baseline,
  duplicate pushes, concurrent increments, read sync, sign-out and account switch.
- Actual guide and inbox components were inspected in Hebrew at desktop and
  390px mobile widths. Preview fixtures were removed before building.
- TypeScript, changed-file ESLint and production/PWA builds passed.

Before a participant pilot, use two accounts on real devices: install the app,
allow notifications, send two replies while the other app is closed, open one,
read it, and confirm the remaining badge count. Repeat on iPhone and Android.
OS launcher badges and closed-app delivery cannot be fully verified in a desktop
browser preview. No new research tracking or participant telemetry was added.
