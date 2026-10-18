# Agora: Student screens clarity (less text, more icons) — IA spec

Status: draft
Date: 2026-10-18
Supersedes: none (Trello card qn9rjI1s). Label style follows agora-teacher-home.md.

Scope: every screen a student sees in a game: join, waiting, intro, story/needs/vision rounds, question stage, positioning, deliberation (write, read-and-rate, help), voting, challenge round, re-rate, results, village/places, HUD, inbox, toasts, celebrations. Out of scope: teacher console. Never touched: student-written text, teacher-written scenario text, AI character replies (AI never writes for students).

Method: read `apps/agora/src` (routes `index.ts`, stage switch `views/GameController.ts`, `components/*`) and the Hebrew block of `lib/i18n.ts`. Word counts are Hebrew words in the current string. ALL Agora strings live in one file, `apps/agora/src/lib/i18n.ts`, in six blocks (he, en, ar, es, de, nl); `shared-i18n` is not used by Agora. Every key change below must be made in all six blocks. EN is given here; ar/es/de/nl follow the EN meaning.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Student, grades 7-9, Hebrew, phone | Write my note, read and react to classmates, see how the class did | Teacher-only data, peers' real names, AI text presented as theirs |
| Student, ar/en/es/de/nl | Same | Hebrew-only jargon that cannot translate |
| Team of 2-3 on one device | Same, as one player | Another team's drafts |

Least expert reader on every screen: a 12-year-old on a phone, in a hurry, in a classroom.

## 2. Object model (what the student meets)
- Game (`AgoraSession`), one lesson; stage = a step the teacher moves the class through. Not a Statement.
- Station / question item (story, needs, vision, open question, solutions): QUESTION-type Statement.
- My written item: option/suggestion Statement, `parentId` = the question. A classmate's: same type, other creator.
- Improvement idea: child Statement of someone's item, with a thread. Outcomes: open, woven in, declined, thanked.
- Rating = evaluation on an item. Vote = one pick on the ballot. Class bridge and my points = derived, shown in the HUD.
This spec adds no object. It renames and re-skins; the mapping onto the Statement tree is unchanged.

## 3. Labels: the concept audit (one name per concept)
Today one thing has up to six names. Canonical choice per concept (HE primary).

| Concept | Canonical HE (EN) | Where used today | Synonyms to retire | Why |
|---|---|---|---|---|
| Anything I wrote at a station | פתק (note) | `village.nav.*`, `village.note.*` | טקסט (`round.*`), תשובה as the NAME of the item | One container word for story, need, vision, answer |
| A solution note (solutions stage) | הצעה (proposal) | `delib.*`, `voting.*`, `results.*` | פתרון for the item; "הצעה" and "פתק" for the SAME item on one screen | Proposal is a kind of note; used only in solutions, voting, results |
| Idea a classmate sends to improve my note | רעיון לשיפור (idea) | `delib.thread_suggestion_tag` | הצעת שיפור (`delib.send_suggestion`, `delib.suggestions_received`, `delib.dock_new_ideas`) | "הצעת שיפור" reads as a second proposal |
| One pass of the loop | סבב (round) | `delib.cycle_round`, `delib.next_lap` | סיבוב (`round.splash_title`), הקפה (`round.intention_ask`, `results.reflection_prompt`) | Three words, one loop |
| The two sides | צד / שני הצדדים (side) | `picture.camp_*`, `transition.*` | מחנה / מחנות (`delib.*`, `hud.*`) | "מחנה" is military/political to a 12-year-old; "צד" already used in `picture.*` |
| Class meter | גשר הכיתה (class bridge) | `hud.class_label` | כוח הגישור (`thread.score_bridge`) vs כוח הגשר (`delib.bridge_power`), ציון הכיתה, הסכמת הכיתה | One name, one spelling |
| How much the class agrees with a note | הסכמה, as a % | `board.*`, `village.standing.*` | תמיכה ממוצעת, הסכמה נטו, ציון ההסכמה, הציון הזהיר, הציון האמיתי, דיוק | One number, one word on the surface; rest behind the ⓘ |
| The shared list | כל הפתקים (village) / כל ההצעות (solutions) | `village.nav.board`, `chart.title` | הכיכר and הלוח for the same list; מפת הכיתה | "הכיכר" = a place name only; "הלוח" = the ballot of top proposals only |
| My workspace | הפתק שלי | `village.nav.note` | בית המלאכה (`delib.step_mine`, `place.mine_title`), הסדנה | Three furniture names for one door |
| Helping a classmate | לעזור | `delib.step_help` | הדוכן / הדוכנים (`delib.step_help`, `place.help_title`, `toast.suggestion_declined`) | One verb, no stalls |
| Taking an idea | לשלב (weave in) | `delib.implemented`, `chat.mark_woven` | קבלה, אימוץ, אשלב (`delib.accept`, `delib.will_implement`) | One verb |
| The frame | מסע, in titles only | `home.*`, `join.*`, `lobby.*` | משחק and שיעור on student screens; נוסעים בזמן; מנהרת הזמן x4 | |
| Address | plural, gender-neutral (כתבו) | most of app | singular פגשת/כתבת/שלך/קוראים לך (`round.*`, `question.*`, `join.*`, `call.typing_hint`); slashes הוספ/י, חבר/ה, קורא/ת, ששלח/ה | Mixed address; slashes break screen readers |

Route segments and code types: unchanged (student routes are only `/`, `/join/:code`, `/play/:id`). Renamed i18n keys are listed in section 11.

## 4. Hierarchy (student)
Role: student. Home = `/play/:id` (the stage the teacher is on). Max depth 2.
0 `/` enter code
1   `/join/:code` name and team size
2     lobby (waiting)
0 `/play/:id`, one stage at a time
1   opening film and intro
1   round stages: story, needs, vision (write, then read, then react)
1   question stage (write, then read and rate)
1   positioning on the bridge
1   deliberation, three places: my note, all notes, help (via the one bar)
2     thread with a classmate; detail sheets (numbers behind a score, helpers board)
1   voting, then challenge round
1   re-rate, then results [class, helpers, my journey]
1   village shell: the one bar wraps stages that run in the village
Chrome on every stage: HUD (class bridge, my score, help), inbox, toast stack, settings.

## 5. Navigation model
- Global: the PlaceBar, four doors, already icon + one word (home, edit, proposal, trophy). Keep as is. A locked door is drawn locked and says why (`village.nav.hint_*`); hints use the same noun as the door.
- Local: write, read, react are one scroll per stage, not tabs.
- Contextual: toast and inbox rows deep-link with `requestFocus(target)`; the teacher "call" opens a one-line action.
- Back: sheets close with a labelled close; a thread returns to "my note" (`thread.back_to_mine`).
- Deep links: `/join/:code`, `/play/:id`. Unknown stage: `game.refresh_*` screen.

## 6. Task flows (steps)
Role: student.
1. Join and be ready (5 steps, unchanged): `/` code -> join (name + team size on one screen) -> lobby -> intro (3 cards) -> first stage. Copy cut about 60%.
2. Write my note (3): stage opens -> one field with a hint of at most 7 words -> "שליחה".
3. Read and react (3): "כל הפתקים" -> read -> heart or rate. The write-first gate shows `lock` + 6 words.
4. Help a classmate (4): help place -> pick a note -> write one idea -> "שליחה". One rule chip replaces three sentences.
5. Vote (2): voting stage -> tap one proposal. Four instruction lines become one.
6. See how we did (2): results door -> headline + "my journey". Details are depth 2.

## 7. Screen inventory
| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Home | / | enter code | n/a | n/a | invalid code | n/a | n/a |
| Join | /join/:code | name, team size | n/a | joining | ended / removed | removed (`game.removed_*`) | n/a |
| Lobby | /play/:id | wait | n/a | skeleton | n/a | no seat (`game.no_seat_*`) | n/a |
| Film + intro | /play/:id | three rules | n/a | tap to play | n/a | n/a | skip |
| Round stage | /play/:id | write, read, react | no notes yet | loading | `round.rate_failed` | closed | goal met |
| Question stage | /play/:id | answer, rate | no answers yet | saving | `rate_failed` | closed | saved |
| Positioning / re-rate | /play/:id | mark my view | n/a | sending | `submit_failed` | n/a | confirmed |
| Deliberation | /play/:id | write / rate / help | `delib.nothing_to_rate` | saving | `save_stuck`, `send_failed` | write-first gate | `cycle_done` |
| Voting | /play/:id | one vote | waiting | saving | `save_failed` + retry | closed | voted |
| Challenge | /play/:id | write for the board | `waiting_*` | saving | `too_short` | not my turn | `outcome_*` |
| Results | /play/:id | how we did | `picture.empty` | computing | n/a | n/a | outcomes |
| Village + bar | /play/:id | move between doors | `board.empty` | world loading | `village.unavailable` | locked-door hints | n/a |
| Inbox | sheet | what is new | `inbox.empty` | n/a | n/a | n/a | n/a |
| Thread | sheet | talk about a note | `chat_empty` | n/a | `send_failed` | n/a | `round_trip` |
| Toasts / celebrations | overlay | one-line news | n/a | n/a | n/a | n/a | n/a |
Every state already has a string; none needs a new place. Weakest: results "computing" and the village-unavailable fallback (no icon).

## 8. Findability
Lists that outgrow a phone: classmates' notes, helpers board, ballot. Today: scroll plus "N more below" (`village.board.more_below`). Classes are about 35 or fewer, so no search is needed. Keep. Add the `new` icon to the existing "new" chip so unread items are findable by scan. P2: if a class passes about 35 notes, group "mine, new, rest".

## 9. Open questions and assumptions
- Assumption: "פתק" is the container word, "הצעה" the solution kind (section 3). If Tal prefers "הצעה" everywhere, flip about 25 village keys instead; the rest holds.
- Assumption: "צד" replaces "מחנה" on student screens; teacher text may keep "מחנה".
- Hebrew marked (?) needs a native read; test the shortened text with two 7th-8th graders.
- Existing tests or e2e may assert Hebrew strings; update them with the keys.
- The ⓘ body: read by screen reader on activation, not on focus (assumed).

## 10. Handoff to UX
Fixed by this spec: canonical names; new HE/EN text; which existing icon goes where; one instruction per region; the ⓘ rule; locked gates show `lock` + short text; toast shows its trigger icon; accessibility rules in section 12.
Yours to decide: icon size and placement inside a 44px hit area; ⓘ popover vs inline; RTL layout of the 3 intro cards; face + word stacked or inline; the drawing of the new `info`, `play`, `close` icons in the stroke family.

## 11. Change list per screen
P1 = must do, P2 = nice. Format: `key`: today (Nw) -> HE / EN. IC = icon from `components/Icon.ts`. Pair with `iconLabel(name, label)` or `m(Icon,{name,size,label})`. Same edit in all six language blocks.

### 11.1 Home (views/Home.ts). Job: type the class code. Icons today: none.
- P1 `home.explanation` (18w, repeats the tagline): hide from first view, put behind ⓘ -> "הכיתה יוצאת למסע בזמן, שומעת את כל הצדדים ומוצאת פתרון שכולם יכולים לחיות איתו" (14w) / "Your class travels in time, hears every side, finds a solution everyone can live with."
- P1 `home.tagline` (7w) -> "מסע בזמן: להציל את התקופה" / "A time journey: save the era".
- P1 `home.have_code` (4w) -> "יש קוד מהמורה?" / "Got a code from your teacher?" IC `qr` decorative.
- P2 `home.join` -> "כניסה" / "Join".

### 11.2 Join (views/JoinSession.ts). Job: name and team size. Icons: none.
- P1 `join.team_question` (5w) + `join.team_hint` (5w) -> one line "כמה אתם ליד המכשיר?" / "How many of you are at this device?" IC `people`. Delete `join.team_hint`.
- P1 `join.your_name_hint` (12w) -> "השם יופיע ליד מה שתכתבו" (5w) / "Your name shows next to what you write."
- P1 `join.real_name_hint` (18w) -> "רק המורה רואה. נמחק אחרי 30 יום" (6w) / "Only your teacher sees this. Deleted after 30 days." IC `lock`, label "רק המורה רואה". Meaning kept (teacher-only, 30 days).
- P1 `join.your_name`, `join.real_name` "איך קוראים לך?" -> "איך קוראים לכם?" / "What do we call you?"
- Errors (`join.invalid_code`, `join.session_ended`, `join.removed`): keep as text; an error needs words.

### 11.3 Lobby (views/Lobby.ts). Job: wait. Icons: 4.
- P1 `lobby.waiting` (6w) -> "ממתינים למורה" / "Waiting for the teacher"; IC `watch`.
- P1 `lobby.joined` -> "הצטרפו" / "joined" with a count and IC `people`.
- P1 `lobby.you_are` -> "השם שלכם:" / "Your name:" (one word: שם, not "שם הקוד").
- P1 `lobby.get_ready` (4w) -> "מתחילים עוד רגע" / "Starting soon".
- P2 `look.lobby_prompt` (11w) -> "בינתיים: בחרו סגנון" (3w) / "Meanwhile, pick a style". IC `spark` on the button; `look.open` stays "סגנון".

### 11.4 Intro and transitions (OpeningFilm, `intro.*`, `transition.*`)
- P1 `intro.title` (7w, abstract) -> "איך הכיתה מצליחה ביחד" (?) / "How the class wins together".
- P1 Render the three paragraphs as three icon rows. `intro.goal_title` IC `target`; `intro.listen_title` IC `talk`; `intro.end_title` IC `flag`.
  - `intro.goal_text` (18w) -> "לא לנצח בוויכוח. למצוא פתרון שרוב הכיתה יכולה לחיות איתו" (10w) / "Not to win the argument. To find a solution most of the class can live with."
  - `intro.listen_text` (23w) -> "קוראים מה כולם כתבו לפני שמציעים. שומעים כל אחד" (8w) / "Read what everyone wrote before you propose. Hear everyone."
  - `intro.end_text` (23w) -> "כולם מדרגים, וההצעות המובילות עולות להצבעה" (6w) / "Everyone rates; the leaders go to a vote."
- P1 `film.skip_in` (6w) -> button "דילוג ({{n}})" / "Skip ({{n}})", IC `arrow`.
- P2 `transition.*` (4-9w, shown 2-3 s) to 4 words or fewer: `transition.question` -> "שאלה לכולם"; `transition.needs` -> "מה באמת חשוב?"; `transition.positioning` -> "איפה אתם עומדים?" (keep); `transition.voting` -> "עכשיו מצביעים"; `transition.framing` -> "יוצאים לדרך".

### 11.5 Round stages: story, needs, vision (views/RoundStage.ts). Icons: 2.
- P1 Hints become one line; the example moves behind ⓘ:
  - `round.story.hint` (15w) -> "מה קרה ומה הרגשתם. סיפור, לא פתרון" (7w) / "What happened and how it felt. A story, not a solution."
  - `round.needs.hint` (31w) -> "מה חשוב לכם בנושא. לא פתרון, רק מה חשוב" (8w) / "What matters to you. Not a solution." Example to NEW `round.needs.example` (ⓘ): "חשוב לי שילדים יגיעו בבטחה. זה צורך. מעבר חצייה הוא פתרון" (11w) / "'Kids get there safely' is a need. 'A crossing' is a solution."
  - `round.vision.hint` (15w) -> "כמה משפטים, לבד, לפני שקוראים אחרים" (6w) / "A few sentences, alone, before you read others." Drop the "system will merge" sentence (system behaviour, not an instruction).
- P1 Address and noun: `round.story.prompt` "פגשת" -> "פגשתם"; `round.your_text` -> "הפתק שלכם" / "Your note"; `round.no_text_given` "לא כתבת" -> "לא כתבתם"; `round.text_number` -> "פתק {{n}}" / "Note {{n}}".
- P1 `round.answer_first` (10w) -> "כתבו קודם, ואז תקראו את האחרים" (6w) / "Write first, then read the others." IC `lock`, label.
- P1 `round.waiting` (9w) and `round.no_texts` -> "עוד אין פתקים" (3w) / "No notes yet." IC `watch`.
- P1 `round.goal_met` (9w) -> "קראתם את כולם. תודה!" (4w) / "You read them all. Thanks!" IC `check`.
- P1 Saved state of `round.saved`: add IC `check` (label "נשלח").
- P1 Two words for one reaction: `round.appreciated_n` "{{n}} הוקירו" -> "{{n}} לבבות" (same as `round.likes_n`); `round.mean_n` "{{n}} שקלו" -> "{{n}} דירגו" (one verb for rating everywhere).
- P2 `round.unit_0..4` words stay; pair each with the matching `face-*` icon (the faces already exist), word visible under each.

### 11.6 Question stage (views/QuestionStage.ts)
- P1 `question.answer_first` (10w) -> "שלחו קודם, ואז תראו את התשובות" (6w) / "Send yours first, then see the answers." IC `lock`.
- P1 `question.waiting_for_answers` (9w) -> "עוד אין תשובות" (3w) / "No answers yet."
- P1 `question.others_title` "העריכו הצעות של אחרים" (the item here is an answer) -> "דרגו את האחרים" / "Rate the others".
- P1 `question.net_agreement` -> "הסכמה {{value}} · {{n}} דירגו" (drop "נטו").
- P2 `question.closed` (8w): keep; IC `lock`.

### 11.7 Positioning and re-rate (views/Positioning.ts, ReRate.ts)
- P1 `positioning.hint` (12w) -> "הזיזו את הסמן לצד הקרוב אליכם" (6w) / "Move the marker toward the side closest to you." The two side labels (`picture.camp_left/right`) are the cue.
- P1 `positioning.catch_up` (20w) -> "סמנו איפה אתם עומדים לפני שנכנסים" (6w) / "Mark where you stand before you go in." Reason to NEW `positioning.why` (ⓘ): "כך רואים אילו הצעות מקרבות בין הצדדים" / "It shows which proposals bring the sides closer."
- P1 `rerate.lead` (19w) -> "סמנו שוב את הדעה שלכם. אין תשובה נכונה" (8w) / "Mark your view again. No right answer." "No points for changing" goes behind ⓘ.
- P2 `rerate.note` mentions Odyssey: hide from students. IC `scales` beside `convergence.title`.

### 11.8 Deliberation: three places (views/Deliberation.ts, 2942 lines). Main student screen.
Jobs: my note = write and improve; all notes = read and rate; help = send an idea.
- P1 Place names to match the bar: `delib.step_mine`/`place.mine_title` "בית המלאכה" -> "הפתק שלי" (IC `edit`); `delib.step_rate`/`place.rate_title` "הכיכר"/"סיור בכיכר" -> "כל הפתקים" (IC `proposal`); `delib.step_help`/`place.help_title` "הדוכן"/"הדוכנים של הכיתה" -> "לעזור" (IC `helped`).
- P1 Subtitles: `place.mine_sub` (7w) delete (title + icon say it); `place.rate_sub` (8w) -> "דרגו הצעות של אחרים" (4w); `place.help_sub` (4w) -> "שלחו רעיון" (2w).
- P1 Write: `delib.propose_hint` (10w) -> "כתבו הצעה ששני הצדדים יכולים לחיות איתה" (7w) / "Write a proposal both sides can live with." Drop "מה צריך לעשות?" (repeats the question). `delib.propose_hint_open` -> "...שרוב הכיתה יכולה לחיות איתה". Keep one of `delib.mission_label` / `delib.write_label` (drop `mission_label`).
- P1 `delib.submit_proposal` "הוספ/י תשובתך" (wrong noun, slash) -> "שליחה" / "Send"; IC `check` once sent. Rename key to `delib.send_proposal` (P2).
- P1 `delib.dock_hint` (12w) -> "ההצעה שלכם למטה. הקישו לעריכה" (5w) / "Your proposal is below. Tap to edit." IC `edit`.
- P1 `delib.rate_hint` (11w) -> "אפשר לחיות עם ההצעה הזו?" (5w) / "Could you live with this proposal?" `delib.rate_progress` (10w) -> "{{n}} מתוך {{total}} דורגו" (4w) / "{{n}} of {{total}} rated", IC `check`.
- P1 Help: keep ONE instruction and ONE rule. `delib.help_question` (10w) -> "איך להפוך אותה לטובה לשני הצדדים?" (6w) / "How could it work better for both sides?". Rule chip stays `delib.gap_rule_build` "לחזק, לא לתקוף" with IC `helped`. Delete `delib.help_dont_attack` (13w) and `delib.gap_rule_both/open` (they restate the question).
- P1 `delib.accept_hint` (11w) -> ⓘ only: "שילוב הרעיון בהצעה. הכותב מקבל נקודות" (6w) / "Weave the idea in. The sender earns points." Buttons: `delib.accept` "קבלת ההצעה" -> "לשלב" / "Weave in"; `delib.thank` "תודה" + IC `thanks`; `delib.no_thanks` keep. `delib.will_implement` -> "אשלב" -> "משלבים".
- P1 `delib.thank_hint` (8w) -> "תודה נותנת נקודות לשולח" (4w) / "A thanks gives the sender points."
- P1 `delib.selfcheck_ask` (12w) -> "ההצעה עונה על מה ששני הצדדים צריכים?" (7w) / "Does it meet what both sides need?"
- P1 `delib.gap_chip` (11w) -> "ראיתם פער? אמרו לכותב איך לחזק" (6w) / "Spot a gap? Tell the writer how to strengthen it."
- P1 `delib.cycle_done_hint` (15w) -> "אפשר להמשיך לעזור עד שהמורה סוגר" (6w) / "Keep helping until the teacher closes." `delib.no_feedback_reciprocity` (13w) -> "בזמן שמחכים: דרגו 3 והציעו רעיון" (6w) / "While you wait: rate 3, send an idea." Delete "עזרה חוזרת." `delib.no_raters_yet` (13w) -> "עוד לא דירגו. בדקו בסבב הבא" (6w) / "Not rated yet. Check next round."
- P1 Bridge number: three explanations stacked on one number (`delib.bridge_power`, `delib.bridge_meaning` 6w, `delib.tier_distance`/`_full` 7w each with "(70)", "(80)"). Show number + IC `bridge` + label "גשר". Thresholds and "הושטת יד למחנה השני" go behind ⓘ.
- P2 Four sentences for one event (the text changed since you rated): `delib.reinvite_improved`, `delib.reinvite_prompt`, `delib.helped_improved_marker`, `thread.reweigh_title*`. Canonical "עודכן. דרגו שוב" (3w) / "Updated. Rate again." IC `again`. Keep `thread.reweigh_prompt` (10w); delete `thread.reweigh_free` (13w). `delib.stale_review` (12w) -> "ההצעה השתנתה. הציגו שוב" (4w).
- P2 Chips `delib.chip_new/chip_edited/improved_chip/helped_chip`: keep the word, add IC `new`/`edit`/`improve`/`helped`.
- P2 Rating words `rate.*` keep, each with its `face-*` icon so colour is never the only cue.

### 11.9 HUD (components/DelibHud.ts). Icons: 8.
- P1 One hint visible at a time (already chosen by place); each at most 5 words: `hud.class_hint_empty` (7w) -> "הגשר עולה כששני הצדדים תומכים" / "The bridge rises when both sides back it."; `hud.class_hint_rate` -> "כל דירוג מרים את הגשר"; `hud.goal_reached` (7w) -> "הגשר עומד! המשיכו לחזק"; `hud.class_hint_mine/help/done` to 5 words in the same style.
- P1 Keep all `hud.*_aria` strings (they carry the full meaning for screen readers).
- P2 `hud.expand/collapse`: chevron (`arrow`) with `label`.

### 11.10 Voting and challenge (views/Voting.ts, ChallengeCards.ts). Voting.ts has no icons.
- P1 Four instructions for one vote (`voting.instruction` 20w, `voting.task`, `voting.task_sub` 13w, `voting.change_hint` 16w). Keep `voting.task` "בחרו הצעה אחת" as the title and ONE line `voting.task_sub` -> "אפשר לשנות עד שהמורה סוגר. הקשה נוספת מבטלת" (8w) / "Change until the teacher closes. Tap again to undo." Hide `voting.instruction` and `voting.change_hint` on the student view.
- P1 `voting.results_hidden` (14w) -> "התוצאות יתגלו בסוף. הצביעו לפי דעתכם" (6w) / "Results show at the end. Vote your own view." IC `hide`, label.
- P1 `voting.status.*`: IC `check` (voted), `again` (failed, next to the retry text), `lock` (closed).
- P1 `voting.for`/`voting.against`: keep words, add `face-for` / `face-against` so the buttons differ by more than colour.
- P1 `challenge.rule` (13w) -> "ניצחתם את ההצעה החלשה בלוח? אתם נכנסים במקומה" (8w) / "Beat the weakest proposal on the board and take its seat." IC `scales`. `challenge.blind` (18w) -> "הספירה סודית עד שהמורה סוגר" (5w) / "The count stays hidden until the teacher closes." IC `hide`. `challenge.your_turn_hint` (13w) -> "עוד רגע התור שלכם. חשבו מה חסר בלוח" (7w) / "Your turn soon. What is the board missing?" IC `megaphone`. `challenge.too_short` (12w) -> "קצר מדי, הוסיפו עוד קצת" (4w).
- P2 `challenge.outcome_survived` IC `trophy`; `_failed` IC `again`.

### 11.11 Results (views/Results.ts, ResultsBoard, Chart). Jargon-heaviest.
- P1 Number sheet (`board.detail_*`, 9 labels): show agreement %, who rated, rank. Move `detail_caution` (7w), `detail_ceiling` (9w), `detail_why` (22w), `detail_split/spread/camps` behind one ⓘ "איך מחשבים?" with: "הציון זהיר: הוא מחשיב גם מי שלא דירג" (7w) / "The score is careful: it counts classmates who did not rate."
- P1 `board.help_*` legend (6 lines) -> icon legend: goal `target`, size `people`, mine `proposal`, leader `crown`. Delete `board.help_tap` ("נקודה ← כרטיס ← כל המספרים"; arrow glyphs break in RTL) -> "הקישו על נקודה" / "Tap a dot".
- P1 `picture.band_gap` (18w) -> "{{n}} עוד לא דירגו. המרווח ייסגר כשידרגו" (7w) / "{{n}} haven't rated yet. The gap closes as they do." `picture.band_settled` (11w) -> "כולם דירגו" / "Everyone rated."
- P1 `results.my_contribution_note` (11w): delete (the points block says it). `results.reflection_prompt` "הקפה" -> "אם היה עוד סבב, מה הייתם משנים?" / "If there were another round, what would you change?" Keep the private-reflection line.
- P1 `results.recognition_*` (9w each): name + icon; long text to a tap-open line `*_why`. "בונה הגשרים" IC `bridge`; "אומני הנוסח" IC `weave`; "המושיטים ראשונים" IC `helped`; "המנוע השקט" IC `trend`.
- P1 `results.outcome_*`: add IC `trophy` (success), `scales` (honest disagreement), `again` (no collapse red-only).
- P2 `results.computing` (7w) -> "מחשבים תוצאות" / "Calculating". `results.plausibility` "דיוק היסטורי", `results.health_title` "מצב הממלכה": show only if the topic uses them.
- P2 `board.helpers_sub` (has 🙏) -> "כל תודה היא חבר שעזרתם לו" / "Each thanks is a classmate you helped" with IC `thanks`. `board.helpers_empty_finale` -> "הפעם אין תודות. בפעם הבאה?" / "No thanks this time. Next time?"

### 11.12 Village and places (VillageShell, PlaceBar, VillageMoreSheet)
- P1 Keep the four doors (icon + one word). Shorten `village.nav.hint_*` (5-7w) to 4 words: "אין פתק בתחנה הזאת", "הלוח בביתנים", "מחכים למקום", "הפתק בדרך".
- P1 `village.board.gate` (14w) and `village.note.rate_gate` (8w) are one message: merge into `village.note.rate_gate` -> "כתבו קודם פתק משלכם כדי לדרג" (6w) / "Write your note first, then rate." IC `lock`.
- P1 `village.board.empty` (11w) -> "עוד אין פתקים. כתבו את שלכם בתחנה" (7w) / "No notes yet. Write yours at the station."
- P1 `village.library.intro_free` (10w) + `intro_led` (16w) -> one line "בחרו ספר מהמדף" (3w) / "Pick a book"; the teacher-led state is the badge on the current book (`village.library.book_current`). IC `idea`.
- P1 `village.more.open` "הגדרות": ensure the cog button has a `label` (verify in code; if icon-only, add).
- P2 Three titles for one list (`village.nav.board`, `board.map_title` "מפת הכיתה", `chart.title` "הכיכר — כל ההצעות"): one title per stage per section 3.
- P2 `village.scoreboard.goal_only` has "⚽": remove, IC `ball`.

### 11.13 Inbox and thread (Inbox.ts, ThreadChat.ts)
- P1 `inbox.title` "מה קרה להצעה שלי" -> "מה חדש" / "What's new". `inbox.empty` (11w) -> "עוד אין חדשות" (3w) / "Nothing new yet." Close button has a `label`.
- P1 `delib.chat_with_author` (6w), `village.thread.with_author` -> "שיחה עם הכותב" (3w) / "Chat with the writer". Keep `delib.chat_open`; delete duplicate `delib.chat_start`. IC `talk`.
- P1 Placeholder must not repeat the label: `delib.thread_write_label` (7w) and `delib.thread_placeholder` (7w) are the same sentence; empty the placeholder.
- P2 `thread.score_*` one line each, number first; `thread.score_fell` (8w) -> "עדיין לא עלה. נסו עוד סבב" (5w) / "Not up yet. Try another round."

### 11.14 Toasts and celebrations (Toast.ts, Celebration.ts, notificationCopy.ts)
- P1 `Toast.ts` shows glow + text only, but `notificationCopy.LOOKS` already gives each trigger an icon and the inbox uses it. Render `look.icon` (size 20, aria-hidden) before `toast__text`. Highest value for least work.
- P1 Remove emoji from strings: `toast.class_record` (✨), `toast.climbed` (📈), `toast.thread_message` (💬), `village.scoreboard.goal_only` (⚽), `board.helpers_sub` (🙏). The icon replaces them (Icon.ts header explains why).
- P1 Toasts at most 7 words (they vanish):
  - `toast.suggestion_declined` (17w) -> "בחרו כיוון אחר. הרעיון נקרא" (5w) / "They went another way. Your idea was read."
  - `toast.climbed` (10w) -> "ההצעה שלכם עקפה אחרת!" / "Your proposal moved up!"
  - `toast.class_record` (9w) -> "שיא כיתתי חדש!" / "New class record!"
  - `toast.revision_credited` (11w) -> "‎+1: עדכנתם אחרי שהקשבתם" / "+1: you revised after listening."
  - `toast.thread_message` (6w) -> "הודעה חדשה בשיחה" / "New message."
  - `toast.called_to` (8w) -> "המורה קורא לכולם. הקישו" / "Teacher calls everyone. Tap."
  - `toast.language_flagged` (7w) -> "לא נשמר. כתבו בשפה מכבדת" / "Not saved. Please use respectful words."
- P1 Celebrations: headline + "+N" only. Delete the hint lines `celebrate.accepted_hint` (13w), `celebrate.bridge_zone_hint` (12w), `celebrate.bridging_hint` (12w), `celebrate.revision_first_hint`. `celebrate.revision_first` (11w) -> "עדכנתם אחרי ששמעתם! ‎+{{n}}" (4w) / "You updated after listening! +{{n}}". Points use IC `spark`.

### 11.15 Teacher call, removed, no seat (CallBanner, RemovedScreen, `game.*`, `call.*`)
- P1 `call.typing_hint` (13w) -> "אפשר לסיים את המשפט. הטקסט נשמר" (6w) / "Finish your sentence. Your text is saved." Countdown is a number.
- P1 `game.no_seat_body` (22w) -> "המקום שלכם לא נמצא במכשיר הזה. הצטרפו שוב עם הקוד" (10w) / "Your seat isn't on this device. Join again with the code." The cause (cleared browser, private window) goes behind ⓘ. IC `lock`.
- P1 `game.removed_body` (14w) -> "המורה הוציא אתכם. אפשר לבקש לחזור" (6w); `game.rejoin_waiting_body` (14w) -> "הבקשה אצל המורה. המסע ייפתח לבד" (6w). IC `watch` (waiting), `lock` (removed).
- P1 Slash forms to neutral: `call.card_kicker`/`call.typing_title` "קורא/ת" -> "קריאה מהמורה"; `delib.chat_with_classmate` "חבר/ה" -> "חבר בכיתה" (?); `delib.thank_hint` "ששלח/ה" -> "לשולח"; `toast.suggestion_received` -> "קיבלתם רעיון לשיפור"; `lobby.*`, `village.thread.with_author` "כתב/ה" -> "הכותב".

### 11.16 Writing rules while editing
At most 7 words per hint; one instruction per region; a heading never repeats the line under it; a placeholder never repeats its label; no sentence about why the game exists on a working screen (intro or ⓘ only); numbers before words ("3/5 דורגו"); no emoji, no slashes, no arrow glyphs in strings.

## 12. Icon policy (use the repo's set, invent none)
- Source: `components/Icon.ts` (stroke, `currentColor`, 24 grid, mirrors under RTL), `iconLabel(name,label)` for icon + text, `HeroIcon` only at 24px or more where a render exists (proposal, helped, thanks, bridge, square, talk, era).
- Reuse: proposal, helped, thanks, bridge, square, talk, era, spark, trophy, ball, flag, scales, improve, edit, again, weave, idea, check, new, people, trend, crown, megaphone, watch, target, mail, qr, cog, arrow, home, lock, hide, face-*.
- One icon per concept everywhere: my note `edit`, all notes `proposal`, help `helped`, thanks `thanks`, class bridge `bridge`, results `trophy`, waiting or locked `lock`, hidden `hide`, saved `check`, retry or updated `again`, new `new`.
- P2 add in the same stroke family: `info` (the ⓘ), `play`, `close` (none exist today; confirm against `ICON_NAMES`).
- Accessibility (WCAG AA): decorative icon beside text has no `label` (aria-hidden); standalone icon needs `label` via `t()`. Never icon-only for send, weave in, vote, accept, join, close with unsaved text. Hit area 44px. Colour is never the only cue. Contrast AA in both themes (candy, civic). Respect `prefers-reduced-motion`.
- The ⓘ pattern (P1, one shared component): icon button "הסבר" / "Explain" toggling a body of 15 words or fewer, via the existing `Collapsible`. Used for: home explanation, needs example, positioning reason, weave-in explanation, bridge thresholds, results "איך מחשבים?", no-seat cause. A body never holds a step the student must take to proceed.

## 13. Priorities
P1 first (mostly strings plus one Toast change): section 3 names; 11.1-11.3 join path; 11.5-11.6 gates and hints; 11.8 place names and single-instruction help; 11.10 vote to one instruction; 11.11 jargon behind ⓘ; 11.14 toast icon, no emoji, short lines; 11.15 slashes; section 12 accessibility and the ⓘ component.
P2: new icons info/play/close; 11.4 splash lines; 11.12 titles; chip icons; large-class grouping.
