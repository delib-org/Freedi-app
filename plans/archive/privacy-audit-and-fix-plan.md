# Privacy Audit & Fix Plan

**Date:** 2026-04-10
**Status:** In Progress

---

## Findings Summary

### Critical Issues

#### C1. Evaluations Collection Publicly Readable Without Authentication
- **Location:** `firestore.rules` line ~406
- **Rule:** `allow read: if true;`
- **Risk:** Anyone on the internet can reconstruct every user's complete voting/evaluation pattern with full identity (evaluatorId, displayName, email, photoURL)
- **Legal:** Violates GDPR Art. 5(1)(f), Art. 32; Israel Privacy Protection Law Section 17; CCPA

#### C2. Statements Collection Publicly Readable With Embedded Creator PII
- **Location:** `firestore.rules` line ~137
- **Rule:** `allow read;`
- **Risk:** All statement authors deanonymized; emails, photos, UIDs exposed to unauthenticated users
- **Legal:** GDPR Art. 17 (right to erasure impossible with denormalized PII); Israel Privacy Protection Regulations

#### C3. Full User Objects Embedded in Firestore Documents
- **Locations:**
  - `packages/shared-types/src/models/statement/StatementTypes.ts` — `creator: UserSchema`
  - `packages/shared-types/src/models/evaluation/Evaluation.ts` — `evaluator: optional(UserSchema)`
  - `packages/shared-types/src/models/vote/votingModel.ts` — `voter: optional(UserSchema)`
  - `packages/shared-types/src/models/statement/StatementSubscription.ts` — `user: UserSchema`
- **Risk:** Email, displayName, photoURL denormalized into every document; stale PII persists after user updates; right to erasure requires scanning thousands of documents
- **Legal:** GDPR Art. 5(1)(c) (data minimization), Art. 17 (right to erasure), Art. 25 (privacy by design)

#### C4. Email Address Stored in localStorage
- **Location:** `src/controllers/auth/publicAuthHandler.ts` line ~48
- **Code:** `localStorage.setItem('lastGoogleEmail', result.user.email);`
- **Risk:** Survives browser sessions, accessible to XSS, visible on shared devices
- **Legal:** GDPR Art. 5(1)(e) (storage limitation)

#### C5. PII Sent to Sentry (Third-Party Error Monitoring)
- **Location:** `src/services/monitoring/sentry.ts` lines ~128-135
- **Code:** `scope.setUser({ id: user.uid, email: user.email, username: user.displayName })`
- **Risk:** Email and displayName transferred to US-based third-party without DPA; cross-border data transfer
- **Legal:** GDPR Art. 28 (processor requirements), Art. 44-49 (cross-border transfers)

### Warnings

#### W1. Online Presence Exposes Email to All Authenticated Users
- **Location:** `src/controllers/db/online/setOnline.ts` lines ~23-27
- **Risk:** Any logged-in user can query who is online and see their email
- **Fix:** Remove `email` from Online document

#### W2. Admin Panel Reveals Individual Voting/Evaluation Patterns
- **Locations:** `GetEvaluators.tsx`, `GetVoters.tsx`, `getEvaluation.ts`
- **Risk:** Admins can see which specific option each user voted for — breaks ballot secrecy
- **Deliberation trade-off:** Show participation (who voted) but NOT how they voted

#### W3. Notification Documents Readable by Any Authenticated User
- **Location:** `firestore.rules` — `inAppNotifications` collection
- **Risk:** Any user can read any other user's notifications
- **Fix:** Restrict to `resource.data.userId == request.auth.uid`

#### W4. Debug Utilities Log PII in Production Builds
- **Locations:** `src/utils/debugNotifications.ts`, `src/utils/compareBrowserTokens.ts`
- **Risk:** Ship to production, expose PII in console
- **Fix:** Gate behind `import.meta.env.DEV`

#### W5. Subscription Documents Expose User Data
- **Location:** `firestore.rules` — `statementsSubscribe` collection
- **Risk:** Any authenticated user can read any subscription (full User objects, notification prefs, tokens)
- **Fix:** Restrict to owner or admin

#### W6. Several Collections Have No Owner-Check on Writes
- **Collections:** `pushNotifications`, `importance`, `signatures`, `agrees`, `massConsensusProcesses`
- **Risk:** Any authenticated user could write data attributed to other users
- **Fix:** Add `request.resource.data.userId == request.auth.uid` checks

### Good Practices Already in Place
- k-anonymity in privacy exports (`privacyUtils.ts`)
- Sign app's `hideUserIdentity` with pseudonames
- JSON export anonymization (user IDs replaced with `user_1`, `user_2`)
- Statement export strips creator PII
- Properly scoped engagement and user demographic collections
- Terms of use acceptance flow
- Anonymous user support with temporal names

---

## Fix Plan

### Phase 1: Emergency Fixes (no breaking changes) -- COMPLETED 2026-04-10

- [x] **1a.** Lock evaluations collection — changed `allow read: if true` to `allow read: if request.auth != null` in `firestore.rules:406`
- [x] **1b.** Restrict inAppNotifications reads to notification owner — added `resource.data.get('userId', '') == request.auth.uid` check in `firestore.rules:143`
- [x] **1c.** Remove email and username from Sentry context — now sends only `{ id: user.uid }` in `sentry.ts:131`
- [ ] ~~**1d.**~~ **REVERTED** — `localStorage` for email hint is required for returning-user identification across sessions. Accepted risk with documented justification.
- [x] **1e.** Gate debug utilities behind `import.meta.env.DEV` check in `debugNotifications.ts:142` and `compareBrowserTokens.ts:94`

### Phase 2: Data Minimization (1-2 weeks)

- [ ] **2a.** Create `CreatorPublic` type (uid, displayName, isAnonymous, photoURL — no email) for denormalized positions
- [ ] **2b.** Strip email from write paths: `setEvaluation.ts`, `setVote.ts`, `setOnline.ts`
- [ ] **2c.** Restrict `statementsSubscribe` reads to owner or admin
- [ ] **2d.** Add owner checks to broad-write collections (pushNotifications, importance, signatures, agrees, massConsensusProcesses)

### Phase 3: Anonymity for Main App (2-4 weeks)

- [ ] **3a.** Port `hideUserIdentity` to main app (statement-level setting for anonymous deliberations)
- [ ] **3b.** Strip individual evaluation data from admin "Get Evaluators" view (show participation only)
- [ ] **3c.** Separate voter identity from vote choice in admin "Get Voters" view

### Phase 4: GDPR Compliance (3-6 weeks)

- [ ] **4a.** Build `deleteUserData(userId)` Cloud Function for account deletion / right to erasure
- [ ] **4b.** Build personal data export endpoint (GDPR Art. 20 / CCPA right to access)
- [ ] **4c.** Implement granular consent management (analytics, push notifications, email)
- [ ] **4d.** Define and implement data retention policies with cleanup Cloud Functions

### Phase 5: Structural Improvements (long-term)

- [ ] **5a.** Replace embedded User objects with ID references + client-side resolution
- [ ] **5b.** Add privacy tiers per deliberation (full identity / pseudonymous / fully anonymous)
- [ ] **5c.** Implement differential privacy for small-group aggregated results

---

## Legal Actions Required

- [ ] Conduct a DPIA under GDPR Art. 35
- [ ] Execute a DPA with Sentry under GDPR Art. 28
- [ ] Update Terms of Use to describe data collection accurately
- [ ] Publish a Privacy Policy covering: data collected, legal basis, retention, third-party sharing, cross-border transfers, user rights
