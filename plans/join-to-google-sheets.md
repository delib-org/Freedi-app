# Plan: Write Activist & Organizer Join Events to Google Sheets

## Context
The user wants every "Join as activist" and "Join as organizer" click in the join app to be recorded in a Google Sheet (name + phone + role). The Google Sheets service account credentials are already configured (`wizcol-docs-import@wizcol-app.iam.gserviceaccount.com` + private key in `env/.env.dev`).

### What already exists
- `functions/src/engagement/joinForm/fn_appendJoinSubmissionToSheet.ts` — Firestore-triggered function that fires when a `joinFormSubmissions` doc is created and appends a row to the configured Google Sheet.
- `functions/src/engagement/joinForm/getGoogleSheetsClient.ts` — Authenticated Sheets API client.
- Admin settings panel: `src/view/pages/statement/components/settings/components/QuestionSettings/JoinFormSettings/JoinFormSettings.tsx` — lets admins choose destination (`firestore` | `sheets`) and enter a sheet URL.
- Default form fields (name required, phone required, email optional) in `JoinFormSettings.tsx` line 22-26.
- `apps/join/src/lib/store.ts` — `saveJoinFormSubmission()` writes to `joinFormSubmissions` subcollection; `toggleJoining()` updates `joined[]` or `organizers[]` on the option.

### The gap
- `SolutionCard.ts` only shows the join form for activists (`if (joinForm?.enabled && role === 'activist')`). Organizers skip it entirely — no sheet row is written.
- The `role` field is **not** saved in `JoinFormSubmission` or included in the sheet row.

### User requirements
- Both activist AND organizer clicks written to sheet
- Organizers must fill in name + phone (same form as activists)
- Join app only (not the main Freedi app)

---

## Implementation — 5 files, no new Firebase functions

### 1. Add `role` field to `JoinFormSubmission` type
**File**: `packages/shared-types/src/models/statement/JoinFormSubmission.ts`

```ts
export const JoinFormSubmissionSchema = object({
  userId: string(),
  questionId: string(),
  displayName: string(),
  values: record(string(), string()),
  createdAt: number(),
  lastUpdate: number(),
  role: optional(string()),          // ← add this
  syncedToSheet: optional(boolean()),
  syncedRange: optional(string()),
});
```

After editing, rebuild: `cd packages/shared-types && npm run build`

### 2. Extend `saveJoinFormSubmission()` to accept role
**File**: `apps/join/src/lib/store.ts` (~line 537)

Change signature from:
```ts
export async function saveJoinFormSubmission(
  questionId: string, userId: string,
  displayName: string, values: Record<string, string>,
): Promise<void>
```
To:
```ts
export async function saveJoinFormSubmission(
  questionId: string, userId: string,
  displayName: string, values: Record<string, string>,
  role: JoinRole = 'activist',
): Promise<void>
```

In the `setDoc` call, add `role` to the document object.

### 3. Show join form for organizers too
**File**: `apps/join/src/components/SolutionCard.ts` (~line 207)

Change:
```ts
if (joinForm?.enabled && role === 'activist') {
```
To:
```ts
if (joinForm?.enabled) {
```

This makes the form appear for both roles. Organizers will fill in name + phone just like activists.

### 4. Pass role when saving submission
**File**: `apps/join/src/components/JoinFormModal.ts` (~line 109)

Change:
```ts
await saveJoinFormSubmission(questionId, creator.uid, displayName.trim(), formValues);
```
To:
```ts
await saveJoinFormSubmission(questionId, creator.uid, displayName.trim(), formValues, role);
```

(`role` is already in scope from `handleSubmit` params)

### 5. Add role column to sheet row
**File**: `functions/src/engagement/joinForm/fn_appendJoinSubmissionToSheet.ts`

Line 111 — add `'role'` to metadataHeaders:
```ts
const metadataHeaders = ['userId', 'displayName', 'role', 'optionTitle', 'submittedAt', 'questionId'];
```

Line 133 — add `submission.role ?? ''` to row:
```ts
const row = [
  ...fieldIds.map((id) => submission.values[id] ?? ''),
  submission.userId,
  submission.displayName,
  (submission as JoinFormSubmission & { role?: string }).role ?? '',
  '',           // optionTitle (not stored per-submission)
  new Date(submission.createdAt).toISOString(),
  submission.questionId,
];
```

---

## Admin Setup (no code change — one-time config per question)
1. Open question settings → Join Form → enable the form
2. Set **Destination** to "Google Sheets"
3. Enter the Google Sheet URL
4. Share the sheet with `wizcol-docs-import@wizcol-app.iam.gserviceaccount.com` (Editor access)

---

## Build & Deploy
```bash
# 1. Rebuild shared-types
cd packages/shared-types && npm run build && cd ../..

# 2. Deploy updated Firebase function
npm run deploy:f:test    # staging
# or
npm run deploy:f:prod    # production
```

---

## Verification
1. Create a test question with join form enabled, destination = Sheets, sheet URL set, shared with the service account.
2. Click **Join as activist** → fill name + phone → submit → confirm a row appears with `role = activist`.
3. Click **Join as organizer** → fill name + phone → submit → confirm a row appears with `role = organizer`.
4. Check sheet columns: form fields | userId | displayName | role | optionTitle | submittedAt | questionId
