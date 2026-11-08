# Clean Code, applied to Freedi

Robert C. Martin's *Clean Code* (2008) distilled into the rules that matter in a
TypeScript / React / Firebase codebase, each with a Freedi-flavoured example. Read the
section you need; the table of contents is the index.

1. Meaningful names
2. Functions
3. Comments
4. Formatting
5. Objects, data and types
6. Error handling
7. Boundaries
8. Unit tests
9. Classes and modules
10. Smells and heuristics (quick lookup)

---

## 1. Meaningful names

The reader should not need to open a definition to know what a name holds.

- **Intention-revealing.** `elapsedMs` not `d`; `statementsAwaitingApproval` not `list2`.
- **Avoid disinformation.** Do not call a Map a `List`; do not call a Statement array `statement`.
- **Make distinctions meaningful.** `getStatement` vs `getStatementData` vs `getStatementInfo` is noise. If two things differ, the names say how: `getStatementById`, `getStatementsByParent`.
- **Pronounceable, searchable.** `MAX_TITLE_LENGTH` can be grepped; `3` cannot. That is the real reason behind the constants rule.
- **Nouns for things, verbs for actions, questions for booleans.** `Statement`, `createStatement`, `isAdmin`. Event handlers: `handleClick`, `handleSubmit`. Hooks: `useStatementSubscription`.
- **One word per concept.** Pick `fetch` or `get` or `load` and stick to it across a module. Across the product, one label per object: if the UI says "suggestion", the type, the route and the i18n key say suggestion too (Information Architecture rule in CLAUDE.md).
- **No encodings, no mental mapping.** No Hungarian prefixes, no `IStatement`, no single-letter loop variables beyond a two-line `map`.

```typescript
// before
const d = stmts.filter(s => s.parentId === p && !s.hide);
// after
const visibleChildren = statements.filter(
  (statement) => statement.parentId === parentId && !statement.hide
);
```

## 2. Functions

**Small, and then smaller.** Twenty lines is a comfortable ceiling. Blocks inside `if`,
`for` and `while` should be one line, usually a call to a function whose name explains the
block.

**Do one thing.** The test: can you extract another function from it with a name that is
not merely a restatement of the body? If yes, it does more than one thing.

**One level of abstraction per function.** Mixing `statement.statement.trim()` with
`await runSynthesisPipeline()` in the same body forces the reader to switch altitudes. Keep
the high-level narrative in one function and the details one call away.

**Step-down rule.** Order a file so it reads top to bottom like a newspaper: public entry
point first, its helpers below it, their helpers below them.

**Arguments.** Zero is ideal, one or two is normal, three needs justification, more than
three means an options object with a named type. Flag arguments (`render(true)`) are a
confession that the function does two things; split it. Output arguments (mutating a passed
object) surprise readers; return a new value.

**No side effects.** `checkPassword()` that also starts a session is lying. `getX` reads;
`setX`/`saveX`/`updateX` writes. Command-query separation: a function either does
something or answers something, not both.

**Prefer exceptions to error codes.** Returning `null`/`false`/`-1` on failure pushes an
`if` onto every caller and gets forgotten. Throw a typed error (section 6).

**Don't repeat yourself.** Two similar blocks are a function waiting to be named. Three
similar modules are a factory (see `selectorFactories.ts`, which exists for exactly this
reason).

```typescript
// before: one function, four jobs
async function submit(statementId: string, text: string, user: User) {
  if (text.length < 3) { console.error('too short'); return false; }
  const ref = doc(FireStore, Collections.statements, statementId);
  const now = Date.now();
  await updateDoc(ref, { statement: text, lastUpdate: now });
  store.dispatch(updateStatement({ statementId, statement: text, lastUpdate: now }));
  return true;
}

// after: a narrative of named steps
export async function updateStatementText(
  { statementId, text, user }: UpdateStatementTextParams
): Promise<void> {
  assertValidStatementText(text);
  const { lastUpdate } = updateTimestamp();
  await writeStatementText(statementId, text, lastUpdate);
  store.dispatch(updateStatement({ statementId, statement: text, lastUpdate }));
}

function assertValidStatementText(text: string): void {
  if (text.trim().length < VALIDATION.MIN_STATEMENT_LENGTH) {
    throw new ValidationError('Statement too short', {
      length: text.length, minLength: VALIDATION.MIN_STATEMENT_LENGTH,
    });
  }
}

async function writeStatementText(statementId: string, text: string, lastUpdate: number): Promise<void> {
  await updateDoc(createStatementRef(statementId), { statement: text, lastUpdate });
}
```

## 3. Comments

A comment is a failure to express yourself in code; sometimes a necessary one.

**Keep:** legal headers, explanation of intent ("we read the parent first because the
rules deny the child until the parent subscription exists"), warnings of consequences
("this deletes prod indexes if run with --force"), TODO with owner + ticket, amplification
of something that looks unimportant but is not, links to specs (`docs/ia/...`).

**Delete:** restating the code (`// increment i`), journals and bylines (git has them),
commented-out code, closing-brace comments, noise (`// default constructor`), position
markers (`//////// Actions ////////`), anything that is wrong or out of date.

**Instead of a comment, rename.** `// check if the user may edit` above an `if` becomes
`if (canUserEdit(user, statement))`.

JSDoc on exported functions is welcome when it adds a contract (units, thrown errors,
nullability), not when it repeats the signature.

## 4. Formatting

The project's Prettier/ESLint config is the authority; do not fight it. Beyond that:

- **Vertical density:** related lines together, blank line between concepts. A blank line
  before `return` (project rule). No multiple blank lines.
- **Vertical distance:** declare variables close to their use; callers above callees.
- **Imports:** external packages, then `@/` aliases, then relative; a blank line after the
  block (project rule). No unused imports.
- **Horizontal:** line length per Prettier; no horizontal alignment tricks.
- **One file, one topic.** The file name is the topic (`statementQueries.ts`).

## 5. Objects, data and types

- **Data structures expose data; objects expose behaviour.** Firestore documents are data
  (plain `Statement`); the logic that acts on them lives in controllers and helpers. Do not
  bolt methods onto document shapes.
- **Law of Demeter.** `statement.creator.profile.avatar.url` chains through four shapes; if
  one changes, the line breaks. Prefer a helper that knows the shape (`getCreatorAvatarUrl(statement)`).
- **No `any`.** `unknown` plus narrowing (Valibot `parse`/`safeParse`, type predicates) at
  the boundary; precise types inside. `as` casts are a smell; each one needs a reason.
- **Discriminated unions over optional soup.** `{ kind: 'loading' } | { kind: 'ready'; data: T } | { kind: 'error'; error: AppError }` beats `{ loading?: boolean; data?: T; error?: unknown }`.
- **Make illegal states unrepresentable.** If a value cannot be negative, the type or the
  schema says so, not a comment.
- **Borrow before you build.** `packages/shared-types` (imported as `@freedi/shared-types`) own the domain
  types and schemas. A new shared concept is added there once and imported everywhere.

## 6. Error handling

- **Use exceptions, typed.** `DatabaseError`, `ValidationError`, `AuthenticationError`,
  `AuthorizationError`, `NetworkError` from `@/utils/errorHandling`. The class tells the
  caller what happened; the message tells a human.
- **Provide context.** `logError(error, { operation: 'statements.updateStatementText', userId, statementId, metadata })`. A log line without an operation name is a mystery in Sentry.
- **Write the try-catch-finally first.** Decide what the function promises when it fails
  before writing the happy path.
- **Don't return null, don't pass null.** Return an empty array, throw, or use a
  discriminated union. Guard once at the boundary, not at every call site.
- **Catch where you can act.** A controller that cannot recover re-throws after logging; a
  component boundary shows the user-friendly message (`getUserFriendlyErrorMessage`).
- **Wrap third-party exceptions.** The rest of the code should see `DatabaseError`, not a
  Firestore `FirebaseError` with a vendor code.
- **Use the wrappers.** `withErrorHandling` for reusable async controllers, `withRetry` with
  `RETRY` constants for operations that must eventually succeed.

## 7. Boundaries

- **Wrap third-party code in an adapter you own.** `firebaseUtils` is the adapter for
  Firestore refs and timestamps; services are adapters for FCM, analytics, AI. Importing a
  vendor SDK directly in a component or a reducer couples the UI to the vendor.
- **Learning tests.** When you are unsure how an API behaves (a Firestore `in` query limit,
  a Valibot transform), write a small test that pins the behaviour instead of guessing.
- **Keep the surface small.** Expose one function per operation from the adapter;
  callers do not need to know whether it is a `getDoc` or a `getDocs`.

## 8. Unit tests

- **Three laws, adapted:** write the test that would have caught the bug before the fix;
  write the test for the new behaviour before claiming it works; keep tests as clean as
  production code.
- **One concept per test; one assertion group per concept.** Arrange / act / assert, with
  a blank line between them.
- **F.I.R.S.T.** Fast (no network, no emulator for unit tests), Independent (no shared
  mutable state between tests), Repeatable, Self-validating (no manual inspection),
  Timely.
- **Test names are sentences** that describe behaviour, not method names:
  `it('rejects evaluation when the statement is closed')`.
- **Test through the public API.** If you need to reach into a private helper to test it,
  the helper is probably a module of its own.
- **Mock at the boundary only.** Mock `firebaseUtils` or the service adapter, not
  three layers down.

## 9. Classes and modules

In this codebase the "class" is usually a module (a file with exports) or a React component.

- **Single responsibility: one reason to change.** A file that changes when the Firestore
  schema changes *and* when the UI changes has two.
- **Cohesion.** If half the functions in a module use half the imports and the other half
  use the rest, it is two modules.
- **Small, many.** Prefer several focused modules to one "manager". `statementQueries`,
  `statementMutations`, `statementPermissions`, not `statementController` at 900 lines.
- **Organise for change.** New behaviour should be an added file or function, not an edit
  in the middle of an existing switch (Open/Closed; see clean-architecture.md).

## 10. Smells and heuristics (quick lookup)

| Smell | Fix |
|---|---|
| `any`, `as unknown as T`, `// @ts-ignore` | Real type from @freedi/shared-types; Valibot at the boundary |
| `console.log`, bare `console.error(err)` | `logError` with operation + ids |
| Hard-coded `3600000`, `500`, `'#5f88e5'`, `16px` | `TIME.HOUR`, `FIREBASE.BATCH_SIZE`, `var(--btn-primary)`, `var(--padding)` |
| Function > 20 lines, > 3 params, boolean flag | Extract; options object; split by flag |
| `if/else` chain on a `type` field | Lookup map or polymorphic module per type |
| Duplicate `createSelector` by parent/type | `selectorFactories` |
| `doc(FireStore, Collections.x, id)` | `createDocRef` / `createStatementRef` |
| `new Date()`, `serverTimestamp()`, `Timestamp.now()` | `getCurrentTimestamp()` / `createTimestamps()` |
| Component with fetch + transform + render | Hook or controller for fetch, helper for transform, component renders |
| Inline `style={{}}`, global `import './x.scss'` | `*.module.scss` or atomic SCSS with tokens |
| Dead code, commented-out code | Delete |
| Two names for one concept | Pick one; fix UI text, i18n, routes, types |
| Controller importing from `view/` | Invert: controller exposes a function; view calls it |
| File > 300 lines | Split by responsibility |
| Test asserting on implementation (spy on internal helper) | Assert on observable behaviour |
| Nested ternaries, deep `if` nesting | Early returns, guard clauses, extracted predicates |
| Mutable shared state across functions | Pass values; return new values; Redux for app state |
