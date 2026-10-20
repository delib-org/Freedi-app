# Clean Architecture, applied to Freedi

Robert C. Martin's *Clean Architecture* (2017) reduced to what decides where code goes in
this monorepo and which direction it may depend. Sections:

1. The dependency rule
2. Freedi's rings
3. SOLID in TypeScript
4. Component principles (packages and apps)
5. Boundaries and adapters
6. Decision guide: "where does this go?"
7. Architecture smells

---

## 1. The dependency rule

Source code dependencies point **inward**, toward policy, never outward toward detail.
Policy is the thing that would still be true if you swapped React for Svelte or Firestore
for Postgres: what a Statement is, who may evaluate it, how consensus is scored. Detail is
the framework, the database, the UI.

Why it matters here: Freedi has nine apps and a functions backend sharing one domain. The
only way that stays coherent is if the domain (types, schemas, rules) knows nothing about
any app, and each app depends on the domain rather than on each other.

```
          ┌──────────────────────────────────────────┐
          │ Frameworks & drivers: React, Vite, Firebase│  src/view, src/services, functions index
          │  ┌────────────────────────────────────┐  │
          │  │ Interface adapters: controllers,   │  │  src/controllers, src/redux, firebaseUtils
          │  │ redux, Firestore adapters          │  │
          │  │  ┌──────────────────────────────┐  │  │
          │  │  │ Use cases: deliberation rules,│  │  │  packages/*-core, functions domain folders,
          │  │  │ scoring, permissions         │  │  │  pure helpers
          │  │  │  ┌────────────────────────┐  │  │  │
          │  │  │  │ Entities: Statement,   │  │  │  │  packages/shared-types (@freedi/shared-types)
          │  │  │  │ User, Evaluation, ...  │  │  │  │
          │  │  │  └────────────────────────┘  │  │  │
          │  │  └──────────────────────────────┘  │  │
          │  └────────────────────────────────────┘  │
          └──────────────────────────────────────────┘
                     arrows point inward only
```

Crossing a boundary inward is an ordinary import. Crossing outward (a use case that needs
to persist something) goes through an interface the inner ring defines and the outer ring
implements: a controller function the view calls, a service adapter the controller calls.

## 2. Freedi's rings

| Ring | What belongs | Where | May import |
|---|---|---|---|
| **Entities** | Domain types, Valibot schemas, invariant helpers (`createStatementObject`) | `packages/shared-types` (`@freedi/shared-types`) | nothing app-specific |
| **Use cases** | Rules that make the product the product: consensus math, permission decisions, synthesis pipelines, stage logic | `packages/deliberation-brain`, `packages/event-core`, `packages/engagement-core`, `src/helpers`, `functions/src/<domain>/` | entities, utils |
| **Interface adapters** | Controllers (orchestrate use cases + persistence), Redux slices/selectors, Firestore ref builders, DTO mapping (`convertTimestampsToMillis`) | `src/controllers`, `src/redux`, `src/utils/firebaseUtils.ts` | use cases, entities, services |
| **Frameworks & drivers** | React components/pages, hooks that wire components to controllers, service SDK wrappers (FCM, Sentry, OpenAI), Cloud Function entry points (`fn_*.ts`) | `src/view`, `src/services`, `functions/src/index.ts` | everything inward |

The CLAUDE.md line "View → Controllers → Services, never import upward" is this table in
one sentence.

Practical consequences:

- A component never calls `getDoc`/`setDoc`. It calls a controller or a hook that calls a controller.
- A controller never imports from `src/view`. If it needs to notify the UI, it dispatches to Redux or returns a value.
- A reducer never does I/O. Async work happens in controllers (or thunks that call controllers), and the result is dispatched.
- A pure rule (is this evaluation allowed? what is the consensus score?) lives in a helper or a core package, with no Firebase import, so it can be unit-tested in milliseconds and reused by functions.
- Cloud Functions entry files (`fn_*.ts`) are thin: parse input, call the domain module, return. The domain module is where the tests go.

## 3. SOLID in TypeScript

**S - Single Responsibility.** A module has one reason to change, which means one
stakeholder: the UI designer, the data model owner, the rules owner. `StatementCard.tsx` that
also decides who may delete is serving two of them; move `canDeleteStatement` to a
permissions helper.

**O - Open/Closed.** Add behaviour by adding code, not by editing a growing switch. A
`switch (statement.statementType)` in six places means a new type touches six files. Prefer
a registry: `const renderers: Record<StatementType, FC<Props>>`, `const scorers: Record<Mode, Scorer>`.

**L - Liskov Substitution.** Anything typed as `Statement` must behave as a Statement.
Do not create a "statement-like" object missing required fields and cast it; use
`createStatementObject()` so the invariant holds everywhere the type is trusted.

**I - Interface Segregation.** Components take the props they use, not the whole
`Statement` when they only need `statementId` and `statement`. Controllers take typed
param objects, not `(statement, user, options, flags)`. Narrow props make a component
reusable and its tests short.

**D - Dependency Inversion.** High-level code depends on abstractions. A controller
depends on `createStatementRef` (your interface) rather than on `doc(FireStore, ...)`
(the vendor's). Use-case code in `packages/*-core` depends on an injected `persist` or
`now()` function rather than importing Firestore, so functions and apps can supply their
own.

## 4. Component principles (packages and apps)

*Component* here means a deployable/publishable unit: an app under `apps/`, a package
under `packages/`, `functions/`.

**Reuse/Release Equivalence.** What is reused together is released together: shared-types
is versioned and rebuilt as one unit (`npm run build` in `packages/shared-types`), and
functions consumes it as a packed `.tgz`, so a change there is a release, not a local edit.

**Common Closure.** Things that change together live together. If a feature always
touches a type in shared-types, a rule in deliberation-brain and a controller in the app,
ask whether the rule belongs next to the type.

**Common Reuse.** Do not force an app to depend on a package for one helper. If
`apps/sign` only needs `createStatementObject`, it should not pull in a package that also
drags in React.

**Acyclic Dependencies.** `packages/*` never import from `apps/*` or `functions/`.
`functions/` never imports from `apps/*`. Apps never import from each other; shared code is
promoted to a package. A cycle is fixed by extracting the shared piece downward.

**Stable Dependencies / Stable Abstractions.** `@freedi/shared-types` are the most
depended-upon, so they must change least and be the most abstract (types, schemas, pure
helpers). Volatile experiments start in an app and move down only once they are stable.

## 5. Boundaries and adapters

- **Humble object pattern.** Put the hard-to-test thing (a React component, a Firestore
  trigger) in a humble shell and the logic in a testable module beside it. A `useX` hook
  that calls a pure `computeX` helper is this pattern.
- **Presenters.** Mapping a `Statement` into what a card shows (`title`, `agreePercent`,
  `badgeVariant`) is a presenter function; keep it pure, test it, and let the component be
  markup.
- **Gateways.** `src/controllers/db/*` are gateways to Firestore. One gateway function
  per operation, typed in and out, converting Timestamps at the edge, logging with context.
- **Services as ports.** `src/services/*` expose what the app needs ("send push to user",
  "ask the model for a synthesis"), not what the vendor offers.
- **Don't let the database schema leak upward.** Components should not know a field is
  stored as a Firestore Timestamp; `convertTimestampsToMillis` happens in the gateway.

## 6. Decision guide: "where does this go?"

Ask in order:

1. **Is it a type or schema other apps will need?** → `packages/shared-types` (`@freedi/shared-types`).
2. **Is it a rule with no I/O?** (score, permission, validation, ordering) → helper in
   `src/helpers` or the relevant `packages/*-core`; test it directly.
3. **Does it read or write Firestore, or orchestrate several steps?** → controller under
   `src/controllers/<domain>/`, using `firebaseUtils`, logging with `logError`.
4. **Is it a vendor integration?** (push, AI, analytics, email) → `src/services/<vendor>/`
   behind a small function surface.
5. **Is it app state shared across screens?** → Redux slice + selectors via factories.
   Local to one component tree? → `useState`/`useReducer` in a hook.
6. **Is it what the user sees?** → `src/view/...` component with its `*.module.scss`,
   using atomic components and `useTranslation()`.
7. **Does it need to run on the server?** → `functions/src/<domain>/` module + thin
   `fn_*.ts` entry; same error and timestamp rules; region me-west1.

If the answer spans two rings, that is two files.

## 7. Architecture smells

| Smell | Why it hurts | Fix |
|---|---|---|
| `import ... from '@/view/...'` inside `controllers/` | Policy depends on detail; untestable without React | Return data or dispatch; let the view decide |
| `getDoc` inside a component or hook body | UI knows the database; impossible to reuse in functions | Controller gateway |
| Business rule duplicated in app and functions | They drift; users see one answer, server enforces another | Move the rule to shared-types or a core package |
| 900-line "manager" or "service" file | Many reasons to change, merge conflicts, fear | Split by responsibility (queries, mutations, permissions) |
| `switch(type)` repeated across files | Every new type is a repo-wide edit | Registry / map keyed by type |
| Local redeclaration of a shared-types type | Two truths | Import; extend with `&` or `Pick` if you need a subset |
| Component props = whole `Statement` + whole `User` | Re-renders, brittle tests, unclear contract | Pass the fields used |
| Reducer with `await` | Non-deterministic state; untestable | Controller does the work, dispatches the result |
| Package importing from an app | Cycle; package can no longer be published | Promote the shared piece to the package |
| Function entry point with 200 lines of logic | Cannot unit-test without the emulator | Thin entry, domain module beside it |
