# Test Plan — Satisfaction Rating Footer (Sign App)

**Feature:** Admin-configurable document footer: classic Sign/Reject buttons vs. a -1..+1 satisfaction scale. Ratings below "Very satisfied" ask the user to explain why; the explanation is stored via the comments mechanism (name preserved) and shown to admins.

**Commit:** `03c631ee5` (branch `dev-sign`)
**Environments:**
- **Dev** — local: `cd apps/sign && npm run dev` → http://localhost:3002 (Firebase project `freedi-test`)
- **Production** — https://sign.wizcol.com (Vercel; deploy `dev-sign` → `main` first)

**Estimated time:** ~60–75 min dev, ~30 min production smoke.

---

## Preparation

- [ ] **Dev:** pull `dev-sign`, `cd apps/sign && npm run build` passes, start dev server
- [ ] Create (or pick) a test document with at least 2–3 paragraphs. For production use a **new dedicated test document** so no real signers are affected
- [ ] Have **two browser profiles** ready (e.g., normal + incognito) — one as the document **admin**, one as a **regular user**
- [ ] Optional third profile on a **phone** (or DevTools mobile emulation) for the mobile checks

**Priority legend:** 🔴 must pass · 🟡 should pass · ⚪ nice to check

---

## 1. Admin Settings (as admin)

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 1.1 | 🔴 | Open `…/doc/<id>/admin/settings` → section **Interactions** | A **"Document Footer"** dropdown exists with options **"Sign / Reject buttons"** (selected by default) and **"Satisfaction rating"** |
| 1.2 | 🔴 | Switch to **Satisfaction rating** → **Save Settings** | Button shows "Saved!"; reload the settings page → dropdown still shows Satisfaction rating |
| 1.3 | 🔴 | While in satisfaction mode, change an unrelated setting (e.g. toggle "Show Heat Map") and save | Both settings persist — footerMode is not lost when saving other settings |
| 1.4 | 🟡 | Switch back to **Sign / Reject buttons**, save, reload the document | Footer shows the classic Sign/Reject buttons again. Then switch back to Satisfaction for the rest of the plan |
| 1.5 | ⚪ | Open a **different document** you admin that was never touched | Its footer still shows Sign/Reject (default unchanged for existing docs) |

## 2. Footer Rendering (as regular user)

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 2.1 | 🔴 | Open the test doc in the second profile | Footer shows **"How satisfied are you with this document?"** + 5 thumb buttons: Very unsatisfied / Unsatisfied / Neutral / Satisfied / Very satisfied. **No Sign/Reject buttons** |
| 2.2 | 🟡 | Hover/keyboard-tab over the buttons | Hover lift effect; focus outline visible; each button has a readable label |
| 2.3 | ⚪ | Zoom to 200%, and check dark-background/accessibility widget states | Scale stays usable, buttons don't overflow |

## 3. Rating Flow

> ⚠️ Wait ~3–5 seconds after page load before clicking — ratings are gated on the profile/demographics check (same as Sign/Reject). Clicking too early shows a "Please wait…" toast. This is expected, not a bug.

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 3.1 | 🔴 | Click **Satisfied (+0.5)** | Feedback modal **"Help us improve"** opens with a textarea |
| 3.2 | 🔴 | Type an explanation → **Send Feedback** | "Thank you!" state → page reloads → footer shows **"Thank you for your feedback!"** and the **Satisfied** button is highlighted/selected |
| 3.3 | 🔴 | Click **Very satisfied (+1)** | Confetti, then the feedback modal opens with **positive phrasing** ("Glad you liked it! … what did you like?"). Send or Skip → reload → Very satisfied selected |
| 3.4 | 🔴 | Click **Unsatisfied (−0.5)** → modal opens → type **different** text → send | Works; later in 5.2 verify the explanation was **updated, not duplicated** |
| 3.5 | 🟡 | Click **Neutral (0)** → modal opens → press **Skip** | Modal closes, page reloads, Neutral is selected, previous explanation untouched |
| 3.6 | 🟡 | Click a rating → modal opens → **close via X** | Same as Skip: reload, rating saved |
| 3.7 | 🟡 | Modal open → leave textarea **empty** → Send Feedback | Behaves like Skip (no empty comment created) |
| 3.8 | ⚪ | Rapid double-click a rating button | No duplicate submissions/errors (buttons disable while submitting) |

## 4. Names & Identity

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 4.1 | 🔴 | Rate + explain as a **Google-logged-in** user (identity mode "Account name") | Admin sees the explanation with the user's **real name** (Users table, section 5) |
| 4.2 | 🟡 | Rate + explain as a **guest/anonymous** user | Works; admin sees "User NNNNNN"-style anonymous name |
| 4.3 | 🟡 | Enable **Require Google Login** in settings → open doc as guest → click a rating | Login modal opens (Google only); rating not saved until logged in. Disable the setting afterwards |

## 5. Admin Visibility

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 5.1 | 🔴 | Open `…/doc/<id>/admin/users` | Table has a **Satisfaction** column showing e.g. "Unsatisfied (−0.5)"; **Reason** column shows the explanation text (hover for full text) |
| 5.2 | 🔴 | After test 3.4 (re-rate + new text) | Reason shows only the **latest** explanation — exactly one entry per user, not duplicates |
| 5.3 | 🟡 | Rate from a **second** user account too | Both users appear, each with own rating + reason |
| 5.4 | ⚪ | Check the **Comments** count column | The explanation counts as 1 comment for that user (it reuses the comments mechanism — expected) |
| 5.5 | ⚪ | Status filter dropdown (Signed/Rejected/Viewed) | Raters appear under **Viewed** — satisfaction does not change the signed status (by design) |

## 6. Regression — Sign/Reject Mode Still Intact

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 6.1 | 🔴 | On a doc in **sign** mode (default): sign it | Confetti, "You have signed this document", counts update |
| 6.2 | 🔴 | On another account: **reject** it | Rejection feedback modal opens; reason saved; admin Users table shows it in Reason |
| 6.3 | 🟡 | Paragraph-level approve / comment / suggestions | Unchanged behavior in both footer modes |
| 6.4 | 🟡 | Switch a doc that already has signatures to satisfaction mode and back | No data lost; signed statuses/counts still correct |

## 7. Localization & RTL

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 7.1 | 🔴 | Set document language to **Hebrew** (or use an RTL doc) | Footer question, 5 labels, and modal all in Hebrew; layout correct in RTL |
| 7.2 | 🟡 | Admin settings page in Hebrew | "Document Footer" row + options translated |
| 7.3 | ⚪ | Spot-check one more language (ar/es/de/fa/nl) | Translated strings appear (added to all 7 languages) |

## 8. Mobile

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 8.1 | 🔴 | Open doc on phone / narrow viewport (~375px) | All 5 buttons fit on one row in the sticky footer, labels legible, tap targets OK |
| 8.2 | 🟡 | Complete a full rate → explain → send flow on mobile | Modal usable, keyboard doesn't hide the Send button |

## 9. Production (sign.wizcol.com) — after deploy

> Merge `dev-sign` → `main` and let Vercel deploy. **Create a fresh test document in production** — don't switch a live document's footer during testing.

| # | Pri | Steps | Expected |
|---|-----|-------|----------|
| 9.1 | 🔴 | New prod test doc → default footer | Sign/Reject shows (nothing changed for existing docs) |
| 9.2 | 🔴 | Enable Satisfaction rating in prod admin settings | Saves and persists |
| 9.3 | 🔴 | Full happy path: rate 0.5 → explain → send → reload | Thank-you state, rating selected |
| 9.4 | 🔴 | Prod admin Users table | Satisfaction + Reason visible with correct name |
| 9.5 | 🔴 | Rate +1 from a second account | Confetti + positive feedback modal, rating saved |
| 9.6 | 🟡 | Existing **live** documents spot-check (view only) | Footers unchanged, no console errors |
| 9.7 | 🟡 | Switch the prod test doc back to sign mode | Classic footer returns cleanly |

## 10. Data Spot-Check (optional, Firebase console)

- [ ] `signatures/<uid>--<docId>` has `satisfaction: <score>` and `signed: "viewed"` (unchanged)
- [ ] Explanation lives in `statements` as a comment with `parentId == <docId>`, `creator.displayName` filled
- [ ] Exactly **one** such comment per user per document (updates replace, don't duplicate)

---

## Known Limitations (don't file as bugs)

1. **~3–5s guard after load** — ratings are blocked until the demographics/profile check finishes (identical to Sign/Reject; shows "Please wait…" toast).
2. **"Anonymous" in Users table for raters who skip the comment** — the signature stores no display name, so raters who skip the feedback modal show as Anonymous (same as signers today). Users who leave an explanation get their name from the comment.
3. **CSV exports** (`Export Users` / `Export Detailed`) do **not** yet include the satisfaction column — planned follow-up if needed.

## Rollback

No migration involved. If anything goes wrong in production: set the document's footer back to **Sign / Reject buttons** in admin settings (per document), or revert commit `03c631ee5` and redeploy. Existing ratings/comments remain in Firestore and are harmless.
