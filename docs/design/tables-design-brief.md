# WizCol Tables: design and UX brief

Status: written 2026-11-10 from the live product and its code. It describes what exists, what must stay true, and what the redesign has to achieve. Sections 9 and 10 are starting points for the designer. They are not decisions.

## 1. The product in one paragraph

WizCol Tables (tables.wizcol.com) splits a crowd into discussion tables of up to seven people, each table on one topic. A host writes or imports the topics and shares a link or QR code. People register with their full name and either pick a table themselves or rank three topics. In ranking mode the system seats everyone so that **each table looks like a small copy of the whole room**, and only then gives people the topics they asked for. The host checks the result and publishes it. Each person then sees one thing: their table number and topic.

## 2. What this redesign is for

Tal has used the working system and asked for two large changes:

1. **The WizCol look.** Tables must look like part of WizCol. Today it borrows the warm paper palette of the classroom app and reads like a plain form.
2. **A much easier experience, for both sides.** Planning a table assignment must feel short and guided for the host, and registering must feel almost effortless for participants.

Screens, order, navigation and wording are all open to change. The rules in section 7 are not.

## 3. The idea that makes this product different

Most table tools either let people choose, which produces tables of like-minded friends, or shuffle at random, which ignores what people want. Tables does something else.

**The mirror table.** If people state where they stand on a question, on a scale between two poles, each table should hold the same mix as the room: the same average and the same spread. If the room is split, every table is split in the same way. If the room leans to the centre, so does every table.

**The order of priorities in ranking mode:**

1. Everyone gets a seat, and no table goes over its size.
2. Every table mirrors the room, within a tolerance.
3. Inside that limit, as many people as possible get a topic they ranked.
4. Equal outcomes are settled by a saved lottery seed, so a result can be reproduced and explained.

**The real trade-off.** When a person's position predicts the topic they want, a mixed table must include some people who did not ask for its topic. This is the price of the method, and the interface has to make it feel fair. These are measured results for 100 people split into two camps:

| Situation | First choice | Outside all three choices | Worst table's distance from the room |
|---|---|---|---|
| Topic wishes unrelated to position | about 84% | 0% | 0.18 |
| Each camp wants different topics, normal tolerance (0.3) | 64% | 36% | 0.20 |
| Each camp wants different topics, very strict (0.02) | 52% | 46% | 0.02 |

The 36% and 46% rows are a deliberately harsh test in which all three of a person's choices come from their own camp. Distance is measured in standard deviations of the room, and 0 is a perfect mirror.

## 4. Who uses it, where, and when

| Person | Device and moment | What they need |
|---|---|---|
| **Host**: facilitator, community organiser, teacher, consultant. Signs in with Google. | Plans on a laptop days or minutes before the event. Runs it from a phone or laptop in a noisy room. | To finish setup without learning the theory, to know what happens next, and to trust the result before publishing. |
| **Participant**: any adult or teenager at the event. Full name only, no account, no password. | Their own phone, standing in a room, after scanning a QR code. Attention span under a minute. Often Hebrew or Arabic. | To be done quickly, to understand why they are being asked, and to know exactly where to sit. |
| **The room** (not built yet) | A projector or a printed sheet. | A QR code to join, then who sits where. |

Tables has two entry points that share one service: standalone by link, and as a short step that another WizCol app opens and returns from. Only standalone exists in the interface today. Design so the participant flow still makes sense when it opens from another app with a "back to…" path.

Typical size is 30 to 300 people and 3 to 10 topics. The result for 300 people computes in about one second.

## 5. Vocabulary

One name per concept across all text and code. A designer can propose better words, but one concept must keep one word.

| Concept | English | Hebrew | Note |
|---|---|---|---|
| The product | Tables | שולחנות | |
| One event's process | Table assignment | חלוקה לשולחנות | Never "rooms" or "session" in the interface |
| Person who runs it | Host | מארח/ת | |
| What is discussed | Topic | נושא | A topic can have several tables |
| Where people sit | Table | שולחן | One topic per table, 2 to 20 seats, default 7 |
| People who signed up | Registered participants | נרשמים | |
| Free choice mode | Choose a table | בחירת שולחן | |
| Algorithm mode | Rank topics | דירוג נושאים | Not a vote and not support for the topic |
| Stance on the question | My position | העמדה שלי | One axis, 0 to 100, between two labelled poles |
| No stance given | Not specified | לא צוין | A real state. Never the middle, never 50 |
| Unpublished result | Assignment preview | תצוגה מקדימה של השיבוץ | Participants never see it |
| Final result | Published assignment | השיבוץ שפורסם | |
| Personal result | My table | השולחן שלי | |
| Agreement score of an imported proposal | Consensus (C_p) | קונצנזוס | Describes the proposal, not a person |

## 6. How it works today

### The two modes

| | Choose a table | Rank topics |
|---|---|---|
| Participant does | Picks a table with free seats. The seat is held at once. | Ranks up to 3 topics, and optionally gives a position. |
| Tables come from | Each topic opens one table, or its set maximum | The system: as few tables as seat everyone, shared between topics by first-choice demand |
| Mirror balancing | None | Yes, when positions were given |
| Host checks a preview | No, tables fill live | Yes, then publishes |
| Result appears | Immediately | After the host publishes |

The mode is chosen when the assignment is created and cannot be changed later. In ranking mode, a topic that nobody ranked first gets no table. Table sizes are spread evenly, so 22 people at size 7 become tables of 6, 6, 5 and 5.

### Life cycle

| Status | Host can | Participant sees |
|---|---|---|
| Draft | Edit topics and settings | "Registration has not opened yet" |
| Registration open | Share the link, watch counts, close registration. Topics are now locked. | Registers, ranks or picks a table, and can edit |
| Registration closed | Compute a preview, compute again, publish | "Waiting for the assignment" |
| Assignment published | View, print, recompute and publish a new version, end | My table |
| Ended | View only | "This table assignment has ended" |

Status only moves forward. Registration cannot be reopened. In choose-a-table mode there is no publish step: seats are live, and the host goes from closed to ended.

### Host journey today

1. `/host` Sign in with Google, then see the list of assignments.
2. Create: name and mode, on one form.
3. Host home: status, counts, one "next step" card, the link and QR code, and a list of five sub-screens.
4. Topics screen: add each topic (title, explanation, optional maximum tables), reorder with up and down buttons, or import by pasting a question id. Press save. Go back.
5. Settings screen: seats per table, tolerance (a number, default 0.3), optional position question with two pole labels. Press save. Go back.
6. Host home: open registration, copy the link or show the QR code.
7. Participants screen or host home: watch the count, then close registration.
8. Preview screen: press Compute. See table cards with names, then numbers on how choices were met and how far tables are from the room. Press Publish.
9. Published assignment screen: tables and names, print button.

### Participant journey today

1. Scan the QR code. The page shows the title of the assignment and a full-name form.
2. Register. The page changes to a card with a "Rank topics" or "Choose a table" button.
3. Open the preferences screen: a warning that you may be seated outside your choices, a list of topics with explanations, tap to add, a separate "My order" list with up, down and remove, then the position slider if the host asked for one, then Save.
4. Waiting screen.
5. After publishing, go to My table: a large table number, the topic, and the version date. If the person was seated outside their choices, a short note explains why.

### Screens that exist

| Who | Route | Job |
|---|---|---|
| Host | `/host` | Find or create a table assignment |
| Host | `/host/sessions/:id` | See status and the next step, share the link |
| Host | `…/topics` | Manage topics, import chosen proposals |
| Host | `…/settings` | Table size, tolerance, position question |
| Host | `…/participants` | Counts, names, search, status controls |
| Host | `…/preview` | Compute, inspect, publish. In direct mode, live tables |
| Host | `…/assignment` | Published tables, print |
| Participant | `/sessions/:id` | Register, then the current step |
| Participant | `/sessions/:id/topics`, `…/topics/:topicId` | Read topics |
| Participant | `/sessions/:id/preferences` | Rank and give a position, or pick a table |
| Participant | `/sessions/:id/my-table` | My table |

Every screen also has loading, empty, error and no-permission states.

## 7. Rules the design must keep

**Privacy**

- A participant never sees another person's position or preferences.
- The host sees names and counts only. Positions and preferences are never shown person by person, including in the preview and on printouts.
- Per-table position statistics are hidden when fewer than three people at that table gave a position.
- A participant never sees a draft. Only a published assignment appears.

**Fairness and honesty**

- "Not specified" must always be a visible, easy option, and must never be drawn as the midpoint.
- People are told before they rank that they may be seated outside their choices.
- The host sees the cost of balancing before publishing: how many got each choice and how many got none.
- A preview that no longer matches the registrations cannot be published without computing again. Publishing is never silent or automatic.
- Ranking is not a vote. Avoid language or visuals that suggest a topic won.

**Platform**

- Hebrew first, right to left. Also English and Arabic. Every word goes through translation files.
- Phone first for participants, phone and laptop for hosts.
- WCAG AA contrast, at least 48px tap targets, full keyboard use, and no meaning carried by colour alone.
- User-written text can be in any language and any length, up to 200 characters for titles and 2,000 for explanations.
- The app is built with Mithril and SCSS using BEM class names and design tokens. There is no React component library to reuse here.

## 8. The WizCol look

The target is the `wizcol` brand used by the main app, defined in `packages/shared-styles/src/tokens/_brand-wizcol.scss`, with light, dark and high-contrast versions. In short: warm paper, navy ink, soft lilac, mint and yellow tones, and one violet accent.

| Role | Token | Value (light) |
|---|---|---|
| Page | `--bg-page` | #fbfaf7 |
| Card | `--space-surface` | #ffffff |
| Sunken area | `--bg-sunken` | #f4f2ee |
| Hairline | `--border-subtle` | #e7e3db |
| Ink | `--space-ink` | #263854 |
| Secondary text | `--text-meta` | #65718a |
| Accent | `--accent-violet` | #7a5af5 |
| Lilac tone, tint and ink | `--tone-lilac`, `--tone-lilac-ink` | #e8e2ff, #3a2a78 |
| Mint tone, tint and ink | `--tone-mint`, `--tone-mint-ink` | #cdefdf, #12503a |
| Yellow tone, tint and ink | `--tone-yellow`, `--tone-yellow-ink` | #fce9a8, #5a4200 |
| Floating navigation | `--nav-floating-bg` | #263854 |
| Interface and display fonts | `--font-ui`, `--font-display` | Open Sans and Rubik; Roboto |

Patterns the main app already has: rounded white cards on paper, tint-and-ink tone pairs instead of saturated fills, a floating navy bottom bar on the phone, and bottom sheets over a soft navy scrim.

Today Tables differs in these ways: it uses the classroom app's cream paper (#faf6ef), a blue primary (#1f5895), the Assistant font, a plain text header with no logo, and terracotta and indigo for the two poles of the position slider. All of these should move to the WizCol system. The older blue palette in `docs/guides/design-guide.md` is out of date for this purpose. Its principles still apply: simplicity, progressive disclosure, and an emotionally calm tone.

## 9. Where the experience is hard today

These come from reading the code and the screens. They have not been tested with users, and Tal may add others from real use.

**Host, while planning**

- **Setup is scattered.** The home screen is a hub for five sub-screens. Topics and settings each have their own save button and a trip back.
- **The first question is the hardest one.** Mode is asked on the first form, before the host understands it, and it can never be changed.
- **Tolerance is a raw number.** A host must decide what 0.3 means.
- **Importing needs a technical id.** The host has to find and paste the id of a question from another app.
- **The same field means two things.** "Most tables for this topic" is a cap on the algorithm in one mode and the exact number of tables in the other.
- **No sense of the outcome while planning.** Nothing says "42 people will make about 6 tables" or warns that in choose-a-table mode there are fewer seats than people.
- **Decisions cannot be undone.** A typo in a topic cannot be fixed once registration opens, and registration cannot be reopened.

**Host, during the event**

- **The results speak in statistics.** "Largest deviation of a table from the crowd" does not tell a facilitator whether the tables are good.
- **No manual adjustment.** The host cannot move one person or keep two people apart, although the engine supports locked seats.
- **Latecomers have no path.** Once registration closes, a late arrival sees "Registration is closed" and cannot get in, and the host has no way to add them.
- **No room view.** There is no projector mode for the QR code or for who sits where, and the name search lives only on the participants screen.
- **Table numbers are abstract.** A table cannot be given a location or a name.

**Participant**

- **Too many steps for a phone in a crowd.** Name, then a card with one button, then a long screen, then save, then a waiting page.
- **The first message is a warning.** The note about being seated outside your choices comes before any explanation of why mixed tables are good.
- **Ranking is doubled.** A topic list and a separate order list with arrow buttons say the same thing twice.
- **The position question arrives unexplained**, at the bottom of a long page.
- **Waiting is a dead end.** There is no reassurance about what happens next, and no alert when tables are published. The person has to keep the page open or come back through the link.
- **Identity lives in the browser.** Opening the link on another device or browser creates a new registration, and nothing catches the duplicate.
- **My table is thin.** It shows a number and a topic. It has no tablemates, no directions, and no moment of arrival.

## 10. Questions for the design

- Can host setup become one guided flow, with a live summary of what will happen, and a way to correct mistakes after registration opens?
- Can the mode choice be asked in the host's own words, such as "Should people mix, or sit where they like?"
- Can tolerance become three plain choices, with the number kept for experts?
- Can the preview answer one question first, "Are these tables good?", and leave the statistics as a second layer?
- How should a balanced table be shown visually, while keeping each person's position private?
- What is the shortest honest participant path? Could name, ranking and position fit into one continuous flow?
- How do we explain mixed tables so that people feel it is good for the conversation, and being seated outside their choices feels fair?
- What should the moment of receiving your table feel like?
- What does the room see on a projector, before and after publishing?

The following would need small server additions and are welcome if they earn their place: reopening registration, editing topic text after opening, seating latecomers, moving a person by hand, showing tablemates' names, table names or locations, importing by choosing a question from a list, and a way to return on another device.

## 11. Sample content for mockups

This is invented content for layouts only.

- Assignment: "Our neighbourhood in ten years", ranking mode, 42 registered, 6 tables of 7.
- Position question: "How much should the neighbourhood change?" Poles: "Keep it as it is" and "Change it boldly".
- Topics: Public transport; Green spaces; Young families; Older residents; Local business; Community culture.
- Result: 29 first choice, 6 second choice, 4 third choice, 3 outside their choices. Worst table's distance from the room: 0.21, limit 0.30.
- Long-text cases to test: a 200-character topic title, a two-paragraph explanation, a full name in Arabic, and mixed Hebrew and English in one line.
