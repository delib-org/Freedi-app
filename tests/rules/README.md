# Firestore rules tests

Executable assertions about `firestore.rules`. A rule is not "reviewed" here, it
is *run* — every claim in this directory was verified against the emulator.

## Running

```bash
npm run test:rules        # against an emulator you already have up
npm run test:rules:exec   # starts a firestore emulator, runs, tears it down
```

The emulator port is **8081** (from `firebase.json`), not Firebase's default
8080. Pointing this harness at 8080 quietly starts a second emulator with no
rules loaded, and then every assertion passes for the wrong reason.

## Why its own `package.json`

`@firebase/rules-unit-testing@5` peers on `firebase@^12` while the apps are on
`firebase@^11`. Keeping this directory's `node_modules` separate lets the
harness stay current without dragging the apps' SDK forward.

## Why the tests are red

They describe the rules we **want**, not the rules we have. As of the first
commit, 14 of 27 fail, and each failure is a live hole:

**`/evaluations`** — the input to Agora's entire scoring model (every rating
feeds `onAgoraEvaluationWritten`, which computes `bridgingScore`,
`classConsensus`, rating credits and the class score):

- an unauthenticated write is accepted — `create`/`update` carry no
  `request.auth` check at all, only field-shape assertions
- a rating can be cast under any `evaluatorId`, including a classmate's
- the synthetic `agora-ai--{character}--{n}` raters can be impersonated, which
  moves any proposal's camp aggregates at will
- a classmate's existing rating can be overwritten, reassigned to a different
  evaluator, or deleted

**`/statements`** — shared by every Freedi app; Agora's proposals live here:

- reads are fully public and unauthenticated, so minors' classroom writing is
  readable by anyone with the project ID
- a statement can be created under another user's identity
- a classmate can rewrite an Agora proposal, flip `suggestionStatus` to
  `thanked` (which feeds `creditWeaves` payouts in `fn_onAgoraProposal.ts`), or
  set `agoraPointsAwarded`

The mechanism behind those last three is specific and worth knowing:
`isAllowedToUpdate()` lets any authenticated user through as long as no
protected field changes, and `hasProtectedFieldChanges()` is gated on the
document having **both** `questionSettings` and `statementSettings` keys. Agora
proposals have neither, so the guard short-circuits to `false` and those
documents are structurally exempt from the only protection the collection has.

**Agora's own collections** — mostly already correct (`agoraScores` and
`agoraCharacterReviews` are properly server-owned, points and cross-student
writes are properly pinned). Three gaps remain:

- a student can re-position after their camp is set, moving the bridging
  denominator and `eligiblePoolFor` for every proposal in the room
- `allow list` exposes the whole class's value answers
- a teacher can write `classScore`, which `computeSessionResults` owns

Turning these green is Phase 1 of the classroom-hardening plan. When they pass,
run the cross-app e2e suites (`npm run e2e:main`, `e2e:sign`, `e2e:mc`) — a
break there means the update allowlist missed a legitimate write path, not that
the rules are wrong.

## Adding a test

`helpers.mjs` has fixture builders. Use `seed()` to arrange the world (it writes
with rules disabled) and a normal auth context for the action under test —
never seed through the path you are testing.

`statementDoc()` populates both `creatorId` and `creator.uid`, because the two
coexist in the product; a fixture setting only one would make creator-identity
rules pass or fail for the wrong reason.
