# Review checklist and review output format

Use the checklist twice: once on your own diff before you report "done", and once when
Tal asks for a review of someone else's code. The order is the order of severity; stop
adding style notes if a correctness item is open.

## A. Correctness and safety

- [ ] The change does what the request asked, no more, no less. Unrequested refactors are a separate commit or left out.
- [ ] Every async operation is inside try/catch (or a `withErrorHandling` wrapper) and the catch calls `logError` with `operation` and the relevant ids.
- [ ] Failure cases throw a typed error (`DatabaseError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NetworkError`) or return a discriminated result; nothing returns `null`/`false` to mean "failed".
- [ ] Inputs that cross a boundary (Firestore reads, callable payloads, URL params, form input) are validated with Valibot schemas from `@freedi/shared-types` or a type guard; no trust in `as`.
- [ ] Timestamps are milliseconds (`getCurrentTimestamp`, `createTimestamps`, `Date.now()`); reads convert with `convertTimestampsToMillis`.
- [ ] No new Firestore reads in a loop or per-render; listeners are cleaned up; batch writes go through `executeBatchUpdates`.
- [ ] Permissions are checked where the data is written (controller / function / rules), not only hidden in the UI.
- [ ] Tests exist for the happy path, each error path and the edge that motivated the change, and they pass.

## B. Architecture

- [ ] The code sits in the right ring (see clean-architecture.md §6). No Firestore in components, no React in controllers, no `await` in reducers.
- [ ] Dependencies point inward only. No app imports another app; no package imports an app.
- [ ] Types come from `@freedi/shared-types`. New shared concepts were added there, not in a local `types/` file.
- [ ] Third-party SDKs are reached through the existing adapter (`firebaseUtils`, services), not directly.
- [ ] Rules that both the app and functions need live in one place both can import.
- [ ] A new behaviour was added by adding code, not by widening an existing `switch`/`if` chain in several files.

## C. Clarity

- [ ] Every function does one thing at one level of abstraction; none is over ~20 lines or takes more than three parameters without an options type.
- [ ] Names reveal intent; booleans read as questions; handlers are `handleX`; hooks are `useX`; one name per concept across code, routes, i18n and UI text.
- [ ] No magic numbers or strings; constants from `@/constants/common` with names that explain them.
- [ ] No `any`, no `@ts-ignore`, no unexplained `as`.
- [ ] Comments explain *why*; no commented-out code, no narration of the obvious, no ownerless TODOs.
- [ ] Files under 300 lines (500 hard ceiling), each with one topic; the file name is the topic.
- [ ] Early returns and guard clauses instead of nesting; no nested ternaries.

## D. UI specifics (when the diff touches `view/` or SCSS)

- [ ] Functional component, hooks at top, props interface typed, early returns for loading/empty.
- [ ] Logic that is not rendering lives in a hook, helper or controller; the component is close to pure markup.
- [ ] Styles in `*.module.scss` or atomic SCSS with BEM; design tokens only (`var(--btn-primary)`, `var(--padding)`); no inline styles; no global SCSS imported in a component.
- [ ] All user-facing strings go through `useTranslation()` and were added to every language file.
- [ ] Accessible: semantic elements, labels, keyboard reachable, focus handled in modals, contrast via tokens.
- [ ] New screens or flows have an IA spec in `docs/ia/` (CLAUDE.md "Information Architecture First").

## E. Hygiene

- [ ] `npm run lint`, `npm run typecheck`, `npm run test` (or `npm run check-all`) run clean, and the output was pasted, not summarised.
- [ ] No `console.log`; only `console.info`/`console.error` via the logging utilities.
- [ ] Imports ordered (external, `@/`, relative), unused imports removed, blank line after imports and before `return`.
- [ ] Commit message says what and why in one line, scoped (`feat(agora): ...`, `fix(mc): ...`).

---

## Review output format

When reviewing someone else's change, report like this. Keep each finding to the smell,
the principle, and the fix; the reader is a developer who wants to act, not a student who
wants a lecture.

```
## Verdict
One line: ship / ship after fixes / needs rework. Then one sentence on why.

## Findings (most severe first)
1. **[correctness] <file>:<line>** — <what is wrong in one sentence>.
   Principle: <e.g. "catch where you can act; log with context">.
   Fix: <concrete change, with a short snippet if it is not obvious>.
2. **[architecture] ...**
3. **[clarity] ...**
4. **[style] ...**

## Keep
Two or three things the author did well that should not be "fixed" by a later pass.

## Not checked
Anything you could not verify (did not run the emulator, did not open the Figma, ...).
```

Severity tags: `correctness`, `architecture`, `clarity`, `style`, `test-coverage`. Prefer
fewer, verified findings over a long list of maybes; say "plausible, not verified" when
that is the honest state.
