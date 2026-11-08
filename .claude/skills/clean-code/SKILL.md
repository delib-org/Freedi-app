---
name: clean-code
description: How to write, refactor and review code in the Freedi monorepo the way Tal wants it - Robert C. Martin's ("Uncle Bob") Clean Code and Clean Architecture, applied through the project's own rules in CLAUDE.md (@freedi/shared-types types, logError, firebaseUtils, constants, selector factories, atomic SCSS, tests). Use this skill every time you are about to write or change TypeScript, React, SCSS or Cloud Functions code in this repo - a new feature, a bug fix, a refactor, a "clean this up", a code review, or "is this good code?" - even when the request is small and even when nobody says "clean code". Also use it when a file feels too long, a function does too much, a name is vague, or a controller imports from view.
---

# Clean code in Freedi

The goal is code that a reader understands on the first pass and a teammate can change
without fear. Uncle Bob's rules are the method; CLAUDE.md is the local dialect. When they
seem to conflict, CLAUDE.md wins (it encodes decisions already made for this codebase).

Work in three passes: **understand → write → prove**. Skipping the first pass is how
duplicate types, parallel utilities and wrong-layer code get in. Skipping the third is how
"it compiles" ships.

Deep material lives in `references/`. Read the one you need at the moment you need it:

- `references/clean-code.md` - naming, functions, comments, error handling, boundaries, smells.
- `references/clean-architecture.md` - SOLID, the dependency rule, and how Freedi's layers map to it.
- `references/review-checklist.md` - the self-review gate and the output format for code reviews.

## Pass 1: Understand before writing

A clean change starts by learning what already exists. Spend a few tool calls here; it is
cheaper than a reviewer sending the work back.

1. **Find the type first.** Search `packages/shared-types` (imported as
   `@freedi/shared-types`; CLAUDE.md still calls it by its old npm name `delib-npm`) before
   declaring an interface. Statement, User, Role, Collections, StatementType, Access and
   their Valibot schemas already exist. A locally-declared `Statement` is a defect, not a
   convenience. A field the schema lacks (say `archivedBy`) is added to the schema in
   shared-types as an optional field, not patched in with a local interface.
2. **Find the utility second.** `src/utils/errorHandling.ts`, `src/utils/firebaseUtils.ts`,
   `src/constants/common.ts`, `src/redux/utils/selectorFactories.ts`, and
   `createStatementObject()` in shared-types. If you are about to write a doc ref, a
   timestamp, a retry loop, a parent-filter selector or a `console.error`, one of these
   already does it.
3. **Locate the layer.** Decide where the change belongs before touching a file
   (table below). A Firestore call in a component or a React import in a controller is the
   first thing to fix, not the last.
4. **Read the neighbours.** Open two sibling files in the target folder and copy their
   shape: import order, export style, test location, SCSS module naming. Consistency is a
   clean-code value in its own right.

### Where things live

| Concern | Lives in | Reach for |
|---|---|---|
| Presentation, user events | `src/view/**` (components, pages) | atomic components, `*.module.scss`, `useTranslation()` |
| Business rules, Firestore reads/writes | `src/controllers/**` | `createStatementRef`, `createDocRef`, `executeBatchUpdates`, `createTimestamps` |
| External services (FCM, analytics, AI) | `src/services/**` | thin adapters, no business rules |
| App state | `src/redux/**` | Redux Toolkit slices, selector factories |
| Pure functions, no I/O | `src/helpers/**`, `src/utils/**` | easiest code to test; keep it pure |
| Shared types and schemas | `packages/shared-types` (`@freedi/shared-types`) | never redeclare; add missing fields there |
| Server logic | `functions/src/**` (`fn_*.ts`, domain folders) | `Date.now()`, me-west1, typed inputs |
| Styles | `src/view/style/{atoms,molecules}/_*.scss`, component `*.module.scss` | design tokens (`var(--btn-primary)`), BEM |

Dependencies point **inward**: view → controllers → services, and everything may use
utils/helpers/types. Nothing points back out. Apps under `apps/*` follow the same shape with
their own folders; check the sibling files there too.

## Pass 2: Write it clean

These are the rules that most often decide whether a Freedi change is accepted. The
reasoning behind each is in the references; the short form is here so you can keep it in
view while typing.

**Names say what, not how.**
`statementsByParent`, `isTeacherOfClass`, `handleSubmitVote`. Avoid `data`, `info`, `item`,
`tmp`, `flag`, `doStuff`. Booleans read as questions (`isOpen`, `hasVoted`, `canEdit`).
Functions are verbs; components, classes and types are nouns. One name per concept across
UI text, i18n keys, routes and types; a second name for the same thing is a bug.

**Functions do one thing, at one level of abstraction.**
A function that fetches, validates, transforms and dispatches is four functions. Aim for
under ~20 lines and at most three parameters; more than three means an options object with
a named type. Extract until each function reads like a sentence of calls to well-named
helpers ("step-down rule": high-level first, details below). No boolean flag arguments -
split into two functions. No hidden side effects: a function named `getX` never writes.

**Types are precise and borrowed.**
No `any` (ESLint errors on it). Function parameters and return types are explicit. Import
from `@freedi/shared-types`; new cross-app types and fields go into that package, not a
local `types/` file. Data that crosses a boundary is `unknown` until a schema says
otherwise, so a Firestore read is parsed, not cast:

```typescript
const snapshot = await getDoc(createStatementRef(statementId));
if (!snapshot.exists()) throw new DatabaseError('Statement not found', { operation, statementId });
const statement = parse(StatementSchema, convertTimestampsToMillis(snapshot.data()));
// not: snapshot.data() as Statement  (a cast hides a schema drift until it crashes a screen)
```

**Errors are handled where they can be acted on, with context.**
Every `catch` calls `logError(error, { operation: 'module.fn', userId, statementId, metadata })`.
Declare the operation name once per module (`const OPERATION = 'statements.archiveStatement'`)
and pass it to every thrown error and log in that module, so Sentry groups them together.
Throw the specific class (`DatabaseError`, `ValidationError`, `AuthenticationError`,
`AuthorizationError`, `NetworkError`). Wrap reusable async controllers in
`withErrorHandling` and critical operations in `withRetry`. Never swallow silently, never
`console.log`, never return `null` to mean "it failed" when a thrown error is the honest
answer.

**No magic values.**
Numbers and strings that mean something come from `@/constants/common` (`TIME`, `FIREBASE`,
`VALIDATION`, `UI`, `ROUTES`, ...). If the right constant does not exist, add it there with
a name that explains it. Timestamps are milliseconds from `getCurrentTimestamp()` /
`createTimestamps()` / `Date.now()`, never `serverTimestamp()` or `Timestamp.now()`.

**Comments explain why, not what.**
Good code needs few comments. Delete commented-out code (git remembers). Keep a comment only
when it carries intent the code cannot: a workaround for a Firestore limit, a security
reason, a link to the IA spec. No TODOs without an owner and a ticket.

**React stays declarative and small.**
Functional components only, hooks at the top, early returns for empty/loading states, event
handlers named `handleX`, logic lifted into custom hooks (`useX`) or controllers. A
component over ~150 lines or with more than one `useEffect` doing unrelated work is asking
to be split. New UI goes through the atomic components and `useTranslation()`; styling lives
in SCSS with tokens, never inline, never a global import in a component.

**Redux is thin.**
Slices hold normalized data and reducers; derived data comes from selectors built with the
factories (`createStatementsByParentSelector`, `createFilteredStatementsSelector`, sort
helpers). No async work inside reducers; controllers dispatch results.

**Files stay under 300 lines (500 is the hard ceiling).**
A file is a module with one reason to change. When it grows past that, split by
responsibility, not by line count: `statementQueries.ts` + `statementMutations.ts`, not
`statements1.ts` + `statements2.ts`.

**Boundaries are wrapped.**
Third-party APIs (Firebase SDK, OpenAI, Sentry) are called through one adapter you own, so
the rest of the code depends on your interface, not theirs. That is what makes the
`firebaseUtils` rule more than a style preference.

### Refactoring an existing file

Boy-scout rule, scoped: leave the file you touched cleaner than you found it, but only
within the responsibility you came for. Do not reformat or rename across the repo in a
feature change; that hides the real diff. Replace `any` and raw `console.error` where you
pass by. If a structural refactor is needed to do the task honestly, do it as its own
commit before the feature commit so each diff tells one story.

## Pass 3: Prove it

Clean code is tested code. Treat tests as the specification a future reader will trust more
than the prose.

- Put tests in `__tests__/` next to the file, named `file.test.ts(x)`. Root and
  mass-consensus/sign use Jest; the other apps use Vitest; functions use Jest. Copy a
  sibling test's setup.
- Test behaviour through the public surface: one happy path, each error path, the edge
  that motivated the change. Utilities and helpers: 80%+ coverage. Reducers and selectors:
  every branch. Controllers: success and each thrown error class. Components: what the
  user does and sees, not implementation details.
- A test name is a sentence: `it('throws AuthorizationError when the user is not the teacher')`.
- Run the real gate before reporting done and paste the result, not a summary:

```bash
npm run lint && npm run typecheck && npm run test   # or npm run check-all
```

Then go through `references/review-checklist.md` once on your own diff. Report anything you
left out and why; a smaller honest change beats a large unproven one.

## When reviewing someone else's code

Read `references/review-checklist.md` for the output format. Name the smell, the principle
it breaks, and the concrete fix, ordered by severity (correctness → architecture → clarity →
style). Say what is good too, briefly, so the author knows what to keep.
