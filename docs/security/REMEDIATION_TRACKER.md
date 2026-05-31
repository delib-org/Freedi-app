# Security Remediation Tracker

**Status as of:** 2026-05-28
**Owner:** Tal Yaron
**Companion document:** Confidential plan with technical details lives at `docs/security/REMEDIATION_PLAN.md` (gitignored). This tracker mirrors sprint/status for public visibility and is safe to share.

This file tracks remediation progress against findings from the May 2026 pentest and a follow-up internal audit. Identifiers (H1, C1, etc.) match the confidential plan. Specific reproduction paths are deliberately omitted; see the gitignored plan for technical detail.

---

## Sprint board

| Sprint | Theme | Window | Findings | Status |
|--------|-------|--------|----------|--------|
| **S1** | Authorization hardening (Firestore + Storage rules) | 0–7 days | 7 findings (4 critical, 2 high, 1 medium) | 🟥 Open |
| **S2** | XSS & SSRF | 7–14 days | 6 findings (3 critical, 2 high, 1 high) | 🟥 Open |
| **S3** | App Check enforcement + rate limiting | 14–21 days | 2 findings (1 high, 1 medium) | 🟥 Open |
| **S4** | Content-Security-Policy + header hardening + log hygiene | 21–28 days | 2 findings (1 medium-high, 1 medium) | 🟥 Open |
| **S5** | Dependency hygiene + secret scanning + residuals | 28–60 days | 7 findings (mostly low/info) | 🟥 Open |
| **S6** | Long-term: pentest, threat modeling, WAF, SBOM | 60–120 days | Ongoing | 🟥 Not started |

Legend: 🟥 Open · 🟧 In progress · 🟨 Review · 🟩 Done

---

## Status by finding

### Pentest report (May 2026)

| ID | Severity | Subsystem | Status | Commit / Notes |
|----|----------|-----------|--------|----------------|
| H1 | High | Dependencies — XSS sanitizer | 🟩 Patched | `4201fcf33` (DOMPurify 3.3.1 → 3.4.6). Caveat tracked under C5. |
| H2 | High | Dependencies — backend HTTP client | 🟩 Patched | `4201fcf33` (Axios + SendGrid) |
| H3 | High | Dependencies — build/transitive | 🟩 Patched | `4201fcf33` (fast-uri, fast-xml-builder, babel transform, Vite) |
| M1 | Med-High | Hosting headers (CSP) | 🟥 Open | Sprint S4 |
| M2 | Medium | Firestore authorization | 🟥 Open | Sprint S1 — see C1–C3, H7, M7, M8 in plan |
| M3 | Low-Med | Firebase config exposure + App Check | 🟧 Partial | Client init exists; backend enforcement deferred to S3 |
| M4 | Medium | Transitive deps (firebase-admin) | 🟧 Partial | Snapshot in `functions/npm_audit_output.json`; final triage in S5 |
| L1–L6 | Low/Info | Misc | 🟥 Open | Sprint S5/S6 |

### Supplementary audit (2026-05-26)

| ID | Severity | Subsystem | Sprint | Status |
|----|----------|-----------|--------|--------|
| C1 | Critical | Firestore rules — write authorization | S1 | 🟥 Open |
| C2 | Critical | Firestore rules — admin assignment | S1 | 🟥 Open |
| C3 | Critical | Firestore rules — read authorization | S1 | 🟥 Open |
| C4 | Critical | Cloud Function — OG tags / HTML reflection | S2 | 🟥 Open |
| C5 | Critical | Sign app — SSR sanitization | S2 | 🟥 Open |
| C6 | Critical | Cloud Function — outbound HTTP fetch | S2 | 🟥 Open |
| C7 | Critical | HTTP endpoints — token verification | S2 | 🟥 Open |
| H4 | High | Email subsystem — token verification | S2 | 🟥 Open |
| H5 | High | Storage rules — write authorization | S1 | 🟥 Open |
| H6 | High | Join-delegate — email verification | S2 | 🟥 Open |
| H7 | High | Firestore rules — subscription create | S1 | 🟥 Open |
| H8 | High | App Check enforcement | S3 | 🟥 Open |
| M5 | Medium | Rate limiting | S3 | 🟥 Open |
| M6 | Medium | Logging — PII | S4 | 🟥 Open |
| M7 | Medium | Firestore rules — notification update | S1 | 🟥 Open |
| M8 | Medium | Firestore rules — misc collections | S1 | 🟥 Open |
| M9 | Medium | Dependency residuals (post-patch) | S5 | 🟥 Open |
| L7–L10 | Low | Misc hardening | S5 | 🟥 Open |

---

## Exit criteria per sprint

**S1:** Firebase Rules Unit Tests (`npm run test:rules`) cover every collection × {anonymous, authed-not-member, member, admin, creator, banned}; anonymous user cannot promote self / vote as another user / overwrite another statement's banner in a manual smoke test.

**S2:** Audit doc shows every `dangerouslySetInnerHTML` and `innerHTML` sink is sanitized or escaped; SSRF test cases return 400; SSR-rendered comments/suggestions/paragraphs sanitize server-side; all HTTP fns derive identifiers from verified tokens, not request bodies.

**S3:** All AI / email / admin callables enforce App Check (after monitor-mode bake); per-uid rate limits in place for AI (30/min), email (5/min), feedback (10/hr), summarize-link (10/min).

**S4:** CSP enforced (not report-only) across all hosting targets; CSP report endpoint live; email addresses no longer logged in plaintext in Cloud Logging.

**S5:** `gitleaks` pre-commit hook installed; Firebase web API key restricted by HTTP referrer + API allow-list; remaining npm-audit high/critical residuals triaged with decisions documented.

**S6:** External authenticated pentest commissioned and findings triaged; threat model exists for AI synthesis / Join forms / live editing; SBOM in CI; quarterly review cadence agreed.

---

## Tracking workflow

1. When starting a sprint, change its row in the **Sprint board** to 🟧 In progress.
2. Per-finding fix lands in a commit referencing the finding ID in the message (e.g. `fix(rules): C1 — require evaluatorId == auth.uid`).
3. Update the finding's row here to 🟩 Done with the commit SHA.
4. Update the confidential plan §1/§3 with the same SHA.
5. After each sprint, re-run the supplementary audit and append any new findings to the plan + this tracker.

---

## Related documents

- `docs/security/REMEDIATION_PLAN.md` — confidential, full technical detail (gitignored)
- `docs/security/PENTEST_REPORT.md` — confidential, May 2026 pentest report (gitignored)
- `docs/security/CODE_HAZARDS.md` — null/undefined access hazards (separate workstream)
- `docs/security/URGENT_SECURITY_FIX.md` — historical exposed-key incident notes
- `docs/security/SECURITY.md` — public security policy / disclosure
- `plans/privacy-audit-and-fix-plan.md` — privacy/GDPR workstream
- `functions/npm_audit_output.json` — dependency-audit snapshot (post-`4201fcf33`)

---

*Revision 1 · 2026-05-28*
