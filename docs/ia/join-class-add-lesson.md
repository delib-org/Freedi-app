# join-class: Add lesson on the teacher home

Status: built, 2026-11-05. Card dr6ZNqxq. Extends `join-class-lesson-plan.md`.

**Audience:** teacher. Goal: start a lesson from `/t`.

**Objects (unchanged):** plan 1-n game 1-n lesson. A lesson is played from a game, not a plan, so "which plan" needs a game step when a plan has 2+ games.

## Labels

- Add lesson: `teacher.lesson.new` "+ שיעור עם כיתה" (reused; "הוספת שיעור" would be a synonym)
- Add plan: `teacher.new` "+ מערך שיעור חדש" (reused)
- New, all 7 locales:
  - `teacher.lesson.plan_label` "מאיזה מערך שיעור?" / From which lesson plan?
  - `teacher.lesson.game_label` "איזה משחק?" / Which game?
  - `teacher.home.open_now_empty` "אין עכשיו שיעורים פתוחים" / No lessons open right now
- Page title stays "מערכי השיעור שלי".

## Placement on `/t`

1. "פתוחים עכשיו" heading + Add lesson; always shown when plans exist, with the empty line.
2. "מערכי השיעור" heading + Add plan, replacing the top button.

Forms open inline under their heading, one at a time. Home with no plans: unchanged.

## Flow: existing plan (4 taps; 5 with 2+ games)

1. Add lesson: plan question, plans by last activity, then Add plan.
2. Pick a plan.
3. Only with 2+ games: pick a game.
4. `ClassForm` as before: class, "יצירה", console.

List only plans with a game doc. Show a filter above 10 plans. A plan whose game count could not be read stays listed; the error surfaces on pick.

## Flow: new plan (6 taps)

1. Add lesson.
2. Add plan.
3. Name, "יצירה". `createPlan` writes the plan and first game and opens the game screen. The plan is listed from here, which is how Tal's decision that it is saved for reuse is met.
4. Write questions.
5. The bar's "+ שיעור עם כיתה".
6. `ClassForm`, console.

No plans: the home's form is already open; start at step 3. Plans but none listable: step 1 goes straight to the name form.

## Back and cancel

- Plan list: closes, focus on Add lesson.
- Game list, name form: back to the plan list; typed name dropped.
- `ClassForm`: one step back.
- All of the above write nothing.
- Game screen: plan and game already exist. Back goes to the plan, house to `/t`, `leaveGuard` saves. A half-written plan stays listed and resumes from its row. Nothing can delete it.

## Screens touched

`TeacherHome`, `HomeCreate`, `ClassForm`, new `LessonPicker`. `.teacher-home__new` stays on Add plan; e2e scripts use it.

## Duplicate paths avoided

The new-plan branch calls `createPlan`; there is no second creator. Lessons go through `ClassForm` → `startLesson` → `classStartLesson`. The plan row's "+ שיעור עם כיתה" stays.

## Open

`ClassForm` accepts a game with no Proposals question. The lesson snapshots it, the console shows `ChallengeNeeded`, and later game edits miss that lesson. Left unchanged.
