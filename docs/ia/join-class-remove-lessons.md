# Class: Remove lessons, games and lesson plans — IA spec

Status: agreed (Tal, 2026-11-19) · Trello uTb5Z40z
Amends: join-class-lesson-plan.md §2 ("no delete in this batch" → removable, not deletable)

## 1. Audiences
| Audience | Goal | Must never see |
|---|---|---|
| Teacher | Clear old or unwanted plans, games, lessons from her lists; bring any back | The word "delete" for this (nothing is deleted) |
| Student | Unchanged | Any trace of removal |

## 2. Object model
| Object | Removable when | Flag | Written by |
|---|---|---|---|
| Lesson plan `classPlans/{planId}` | always | `removedAt?: number` (ms) | owner, client |
| Game `classPlans/{planId}/games/{gameId}` | always | `removedAt?: number` | owner, client |
| Lesson (statement with `classLesson`, or a legacy lesson) | `status === 'ended'`, or not started (status live/absent AND `stepIndex === 0`). Never when live, paused or `open` | `statementSettings.lessonRemovedAt?: number` | server only — new callable `classSetLessonRemoved({ mainId, removed })` |

- Flag present = removed. Restore deletes the field. Nothing else changes.
- Removing a plan hides the plan and its games (games are NOT flagged individually). Its lessons are NOT flagged.
- Removing a game hides only that game. Its lessons stay on the plan screen as an action-less section via the existing orphan-section path in `gameSections` (lib/planTree.ts).
- A legacy lesson's plan row (`doc === null`, `planId` = lesson id) has no plan doc: removing it removes the lesson itself.
- Reopening a removed lesson clears its flag (server, in `classSetLessonStatus` 'reopen'). A running lesson is never removed.
- Removal is per item, shared by all co-teachers (Tal confirmed).

## 3. Labels (one name per concept)
| Concept | EN | HE | i18n key | Code |
|---|---|---|---|---|
| Action | Remove | הסרה | NEW `teacher.row.remove` | `data-action="remove"` |
| Action a11y name | Remove: {{name}} | הסרה: {{name}} | `teacher.row.for` (exists) | — |
| Undo + restore (one word) | Restore | החזרה | NEW `teacher.row.restore` | `data-action="restore"` |
| Section | Removed ({{n}}) | הוסרו ({{n}}) | NEW `teacher.home.removed` | `.teacher-home__removed` |
| Done line | {{name}} was removed | {{name}} הוסר | NEW `teacher.row.removed_line` | — |
| Strip on removed plan screen | This lesson plan was removed | מערך השיעור הוסר | NEW `classPlan.removed` | — |
| Strip on removed game screen | This game was removed | המשחק הוסר | NEW `game.removed` | — |
| Group headings in Removed | Lesson plans / Games / Lessons | מערכי שיעור / משחקים / שיעורים | NEW `teacher.home.removed_plans`, `_games`, `_lessons` | — |
| Failure | reuse | — | `console.failed` + `console.retry` | — |

Add keys to all 7 locales (en, he, ar, de, es, fa, nl).
Forbidden: "מחיקה"/"Delete" (`plan.delete` is a real delete), "הסתרה"/"Hide" (= hide from students), "ביטול" as Undo (= Cancel), reusing `console.remove`/`console.restore` keys.

## 4. Hierarchy (Teacher)
```
0 /t  מערכי השיעור שלי
1   פתוחים עכשיו → lesson rows (Remove only on not-started rows)
1   מערכי השיעור → plan rows
1   הוסרו (N) — collapsed disclosure, shown only when N > 0
2     מערכי שיעור · משחקים · שיעורים → rows with החזרה
1   /t/plans/:planId plan screen: Remove beside "שינוי שם"
2     game section: Remove beside "תכנון השאלות"
2       lesson rows: Remove on ended and not-started rows
```

## 5. Navigation
- Removed has one home: an inline disclosure at the bottom of `/t`. No route of its own.
- A removed plan row in Removed links to its plan screen, which shows the `classPlan.removed` strip with החזרה; its lessons stay usable there (open, reopen). This is how ran lessons of a removed plan are reached (Tal confirmed — no new list).
- Removed game row shows "‹plan›" as context. Removed lesson row shows `teacher.lesson.row` plus "‹plan› · ‹game›".
- Deep links: `/t/plans/:planId` and the game route open with the removed strip; `/t/:mid` opens the console normally.
- Students: codes and links unchanged. An ended removed lesson still shows ended screen + results; a not-started removed lesson still waits.

## 6. Task flows
1. Remove ended lesson: plan screen → Remove on row → row becomes done line with החזרה until leaving the screen; Removed count goes up.
2. Remove game: plan screen → Remove on game section → done line with החזרה; ran lessons stay below as an action-less section.
3. Remove plan: plan screen → Remove → stays on screen, now with strip + החזרה. Back to `/t`: plan is gone from list.
4. Restore anything: `/t` → open הוסרו → החזרה on row → item returns; section disappears at N=0.
No confirm anywhere (HideControl principle: undoable).

## 7. Screen inventory delta
| Screen | Change |
|---|---|
| TeacherHome | New הוסרו section; Remove on not-started rows in פתוחים עכשיו; removed plans/games/lessons left out of lists and of `classPlan.counts` |
| PlanOverview | Remove on plan, each game section, removable lesson rows; removed strip; removed games left out |
| PlanScreen (game) | Removed strip only |
| LessonPicker | Leaves out removed plans and games |
| Student views | None |

Removed section states: empty → hidden; loading → home skeleton; error → row-level `console.failed` + Retry.

## 8. Findability
Removed rows: most recently removed first, inside fixed groups (plans, games, lessons). Above `PLAN_FILTER_FROM` rows, add the same name filter as home (`teacher.home.filter`).

## 9. Data and rules
- `ClassPlanSchema`, `ClassGameSchema`: add `removedAt: optional(number())`.
- `StatementSettings` (packages/shared-types): add `lessonRemovedAt: optional(number())` — number, not picklist (strict-parse trap).
- `firestore.rules`: add `'removedAt'` to both `hasOnly` lists in `isValidClassPlan()` / `isValidClassGame()`, plus `(!('removedAt' in d) || d.removedAt is number)`. Delete stays `false`.
- Lesson flag only via `classSetLessonRemoved`: caller must be the class's teacher (same check as `classSetLessonStatus`) and the lesson must be removable; refuse otherwise.
- Filter in `lib/planTree.ts` (`buildPlanRows`, `openNow`, `gameSections` input), not in subscriptions, so Removed reads the same library. `buildPlanRows` must not rebuild a removed plan as a `doc === null` row from its lessons.

## 10. Handoff to UX (implementer decides)
Icon/weight of Remove; look of done line and removed strip; disclosure open behaviour; `aria-live` announcement on remove/restore.
