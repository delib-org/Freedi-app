# MC + Class: Stakeholder count (N) — IA spec

Status: agreed with Tal 2026-11-02
Labels follow `docs/ia/main-people-settings.md`.

Evidence level of the spec's author: read the code and rules, ran `calcAgreement` from the built shared-types for the numbers below. Rules were NOT run on the emulator and nothing was tested in a browser.

## TAL'S DECISIONS (these override anything below that disagrees)

1. **Class default N = 40.** In Class, if the teacher leaves the number empty, the lesson uses N = 40. Written as an explicit `evaluationSettings.targetPopulation: 40` on the lesson and its questions, from one named constant. So every new Class lesson has an N, and the goal stays at 0.6 (`DEFAULT_GATE` unchanged). Lessons that already exist are not touched and stay open-population.
   Consequence for the label table: the Class helper must not say the field stays unset. It says the number counts the whole class including absentees, and that an empty field counts as 40. The input shows 40 as its placeholder. Empty, 0, negative or not a number all mean 40 in Class. MC keeps "empty means absent".
2. **Class stores N per lesson** (section 2). The plan, game and home never hold it.
3. **The teacher CAN correct N after the lesson started**, as a row in lesson settings (`ConsoleSettings`). This replaces "Class: no, in this batch" in section 5. Saving it updates the lesson and all its questions and recalculates scores automatically with no extra step for the teacher, in plain language, using the existing `recalculateIndices` callable once per question that has ratings. Emptying the row means 40. A failed save or recalculation is shown to the teacher plainly.
4. **`recalculateIndices` allows admins, not only the creator.** A separate lane changes the function. The MC and Class UI simply call it, and still show a plain error if it refuses.
5. **MC is an optional field**, with no "I don't know" option and no blocking.

Not doing: suggesting `agoraClasses.memberCount` in ClassForm. Other apps (Sign, Agora, etc.) wait for a later batch.

## 0. Findings

1. **Class does use N, and it changes results.** Rating → `functions/src/evaluation/statementEvaluationUpdater.ts` → `statement.consensus` → the Class goal (`enteredGoal`, `apps/join-class/src/lib/classroom/voteScope.ts`, `DEFAULT_GATE = 0.6`), the vote ballot and the rank order.
   - Same ratings, 25 of 28 students, mean 0.70: 0.437 with no N, 0.614 with N = 28.
   - 28 of 28, mean 0.714: 0.463 becomes 0.714.
   - At large scale the effect is small. In MC, 50 of 500 goes from 0.368 to 0.377.
2. **Class shows no N or confidence anywhere.** The field changes who passes the goal and the order. It adds no number for teachers or students to read apart from the field itself.
3. **The obvious places to store it do not work.**
   - The lesson is skipped: the walk is self → parent → top, and a proposal's parent is the question, its top is the home.
   - The home is server-only: `homeWriteBlocked()` in `firestore.rules:1166`. A client write to it is rejected.
   - Plan or game would be wrong too, since those are reused across classes and are not statements.

**Is the student count already known?** Only partly. `agoraClasses.memberCount` is a server-kept count of the Agora roster. join-class never reads it, and its students enter by lesson code. Not reliable for N.

Side defect, by reading the rules (do NOT fix here, report it): the main app's People > Stakeholders should fail on a class home, because of the same `homeWriteBlocked()` rule.

## 1. Audiences
| Audience | One-line goal | Must never see |
|---|---|---|
| Survey admin or co-admin (MC) | Say how many people the survey concerns, if known | "N", "targetPopulation", "P_c" |
| Teacher (Class, Hebrew first) | Say how many students are in the class | "stakeholders", "confidence", any formula |
| Student, participant | Nothing changes | The field |

## 2. Object model

**N** is `evaluationSettings.targetPopulation`: a positive whole number, or absent (open population). `evaluation.stakeholderCount` is derived by the trigger and floored at the voter count. Neither app writes it.

### MC: N belongs on each question
- A survey is a doc in `surveys`, not a statement, so the scoring walk never reads it.
- Questions sit under a group the admin picks (`app/api/questions/create/route.ts`), and the picker can reuse any accessible question. Writing to the top group would leak N to other questions under it.
- `survey.parentStatementId` exists only for surveys seeded from Studio.
- Consensus is per question, and the question is the `parent` of every option, so all of these reach it: `resolveStakeholderCount`, `resolveQuestionPopulation`, `recalculateIndicesForQuestion`, `resolveClusterPopulation`.

**Model:** the survey keeps the typed value in `survey.settings.targetPopulation`, and a cascade copies it onto its questions. Same pattern as `apps/mass-consensus/src/lib/firebase/surveys/cascadeAutoAiHandling.ts`. Only the statements affect scoring.

| Event | Cascade does |
|---|---|
| Survey value changes to a number | Writes it on every question in the survey, overwriting a different value |
| Survey value cleared | Deletes the field only where it equals the previous survey value |
| Question added to a survey with a value | Writes it only if the question declares none |
| Any other save | Nothing, so a per-question change made in the main app survives autosave |

A question shared by two surveys has one N, and the last change wins. An empty survey field stores nothing, but a question still inherits any N declared on a group above it.

### Class: the number describes the class, but it is stored per lesson
Tree: home (top) → lesson → question → proposal.

- Proposals carry `topParentId = home` and `parentId = question` (`c3Data.ts`, `classGameSnapshot.ts`).
- The lesson statement holds the declared value, and each of its questions carries a copy. The copy is what scoring reads.
- A question added later through `createSubQuestion` copies the value from the lesson.
- The plan and game never hold N, and the snapshot code does not touch `evaluationSettings`. So it does not spread when a plan is reused, and a copied lesson starts without a typed N (it gets the value from its own ClassForm, or 40).
- This works for "No class" too. Writing to a teacher home would apply N to all of that teacher's lessons.

## 3. Labels
| Concept | EN label | HE label | i18n key | Code type | Synonyms to retire |
|---|---|---|---|---|---|
| MC field | Number of stakeholders | מספר בעלי העניין | `Number of stakeholders` (exists in all 7) | `settings.targetPopulation` → `evaluationSettings.targetPopulation` | "N", "target population" in UI |
| MC optional tag | Optional | אופציונלי | `Optional` (exists in all 7) | — | — |
| MC helper | How many people this survey concerns, including people it may not reach. Leave empty if you don't know. | כמה אנשים הסקר נוגע להם, כולל מי שאולי לא יגיע אליהם. אם לא יודעים, משאירים ריק. | NEW `survey.stakeholders.hint` | — | — |
| MC stale note | Scores already given keep the old number until you recalculate. | ציונים שכבר חושבו נשארים לפי המספר הקודם עד שמחשבים מחדש. | NEW `survey.stakeholders.stale` | — | — |
| MC action | Recalculate scores | חישוב מחדש של הציונים | NEW `survey.stakeholders.recalculate` | `recalculateIndices` | — |
| Class field | How many students are in the class? | כמה תלמידים בכיתה? | NEW `teacher.lesson.students_label` | `evaluationSettings.targetPopulation` | "בעלי עניין" in Class |
| Class helper | Count the whole class, including anyone absent today. If you leave this empty, we count 40. | סופרים את כל הכיתה, גם מי שלא הגיע היום. אם משאירים ריק, נחשב 40. | NEW `teacher.lesson.students_hint` | — | — |

Class saying "students" is a deliberate audience wording for one concept. The code name stays the same in both apps.

The MC stale note and action, and the settings-row and failure strings in Class, still need the other languages: write them yourself and list them in your report for a native read. Keys must exist in every language file of that app.

**Translations** (`shared-i18n` for MC, `apps/join-class/src/lib/locales/*.ts` for Class). Non-Hebrew text needs a native read; the Spanish uses "grupo" to match that locale.

`students_hint` below is the wording before Tal's default of 40: keep the first sentence and replace the "you can leave it empty" sentence with the equivalent of "If you leave this empty, we count 40."

| Lang | `survey.stakeholders.hint` | `students_label` | `students_hint` |
|---|---|---|---|
| ar | كم عدد الأشخاص الذين يخصهم هذا الاستبيان، بمن فيهم من قد لا يصل إليهم. اتركوه فارغًا إذا لم تعرفوا. | كم عدد الطلاب في الصف؟ | احسبوا الصف كله، حتى الغائبين اليوم. يمكن ترك الحقل فارغًا. |
| de | Wie viele Menschen diese Umfrage betrifft, auch solche, die sie vielleicht nicht erreicht. Leer lassen, wenn Sie es nicht wissen. | Wie viele Schüler sind in der Klasse? | Zählen Sie die ganze Klasse, auch wer heute fehlt. Sie können das Feld leer lassen. |
| es | A cuántas personas afecta esta encuesta, incluidas aquellas a las que quizá no llegue. Déjalo vacío si no lo sabes. | ¿Cuántos estudiantes hay en el grupo? | Cuenta a todo el grupo, también a quienes faltan hoy. Puedes dejarlo vacío. |
| fa | این نظرسنجی به چند نفر مربوط است، حتی کسانی که شاید به آن‌ها نرسد. اگر نمی‌دانید، خالی بگذارید. | چند دانش‌آموز در کلاس هستند؟ | همهٔ کلاس را بشمارید، حتی غایبان امروز. می‌توانید خالی بگذارید. |
| nl | Hoeveel mensen deze enquête raakt, ook wie je misschien niet bereikt. Laat leeg als je het niet weet. | Hoeveel leerlingen zitten in de klas? | Tel de hele klas, ook wie vandaag afwezig is. Je mag dit leeg laten. |

## 4. Hierarchy
No new nodes.

Role: Survey admin
```
0 /admin/surveys
1   /admin/surveys/new and /admin/surveys/:id (SurveyForm)
2     Basic info: title, description, Number of stakeholders (new, last)
```

Role: Teacher
```
0 /t
1   /t/plans/:planId
2     ClassForm (inline): lesson name, Which class?, How many students are in the class? (new)
3 /t/:mid → ConsoleSettings popover: How many students are in the class? (new row)
```

The MC field goes in Basic info, not Survey Settings: it describes who the survey is for, and the card asks for it before the survey. The Class field comes after the class choice and also shows on the no-classes path.

## 5. Navigation and editing after creation
No change to global, local, back or deep-link paths. Both fields are inline.

- **MC:** editable. `SurveyEditView` uses the same form and autosave. Once any selected question has ratings and the value changes, show the stale note and Recalculate scores. It calls the existing callable once per question. Otherwise an edit leaves options under one question scored with different N values, and a closed survey never corrects itself.
- **Class:** editable in `ConsoleSettings` (decision 3).

## 6. Task flows
Survey admin: SurveyForm title → optionally type the number → continue as today. No added required step.
Teacher: ClassForm lesson name and class as today → optionally type the number → Create → lands on the console. No added required step.

## 7. Screen inventory
| Screen | Route | Single job | Empty | Error | No permission | Done |
|---|---|---|---|---|---|---|
| SurveyForm field | `/admin/surveys/new`, `/:id` | Declare N for the survey | No N stored | Existing save and autosave error | Existing `denySurveyPermission` | Autosaved; `ResultCard` switches from "Voted" to "n / N" under "Of stakeholders" after the next vote or a recalculation |
| ClassForm field | inline on `/t/plans/:planId` | Declare N for this lesson | 40 stored | Lesson still opens; console shows plainly that the number was not saved | Form already refuses via `not_yours` / `not_approved` | Lands on console |
| ConsoleSettings row | `/t/:mid` popover | Correct N for this lesson | 40 stored | Plain message | Teacher screens' existing check | Scores recalculated |

## 9. Validation, permissions, deploy

**Validation (same as main app `parseCount` and `setConfidenceIndexSettings`):**
- `type=number`, `min=1`, numeric keyboard, `parseInt`.
- MC: empty, 0, negative or not a number means absent. Never store 0 or null, because null fails `optional(number())` and would shadow inheritance.
- Class: those same values mean 40.
- No maximum, as in the main app.
- MC needs an explicit clear signal because JSON drops `undefined`: the form sends `0`, and the server removes the key from `settings` and runs the clear cascade.
- A number smaller than the voters is accepted. The trigger floors it to the voter count.

**Writing:**
| | MC | Class |
|---|---|---|
| Path | `/api/surveys` POST and PUT, Admin SDK cascade | Client write after `startLesson` returns: lesson and its questions, in one batch |
| Who | Survey owner or co-admin with `edit`; same reach as the existing cascades | The teacher who started the lesson, as creator; other teachers as copied admins |
| Rule change | No; Admin SDK bypasses rules | No, by reading: lesson and questions are not homes, and `evaluationSettings` is not protected |
| New callable | No | No |
| Function deploy | No (the recalculate change is a separate lane) | No (same) |
| Ships by | Vercel, `main-mc` | Class hosting |
| Shared types | Add optional `targetPopulation` to `SurveySettingsSchema`; functions do not read it | None |

Class is not atomic: the lesson is created first, then N is written. The lesson is still at Waiting, so no rating should exist yet. If the write fails, the lesson stays open-population.

The Class plan rests on a reading of the rules: **add a rules test or an emulator check that a teacher can write this field on the lesson and its questions.**

## 10. Assumptions
- A1: Survey admins usually have one stakeholder group per survey, so there is no per-question field in the form. A different number per question stays in the main app.
- A2: The latest value typed in a survey beats an older per-question value on its questions.

## 11. UX notes for the implementer
Fixed by this spec: field position, labels and keys, empty behaviour, no blocking, the cascade rules, and where the Class value is stored.
Yours to decide within the existing form patterns: layout of the optional tag and helper, how the stale note and the recalculate action appear, the wording of failures. Check RTL at 360 px. `SurveyForm.tsx` is 1,148 lines, so the MC field must be its own component.
