# Privacy Policy and Scientific Research Data Policy

**Effective Date:** April 2026
**Last Updated:** April 13, 2026
**Platform:** Freedi (https://freedi.tech)
**Operated by:** Deliberative Democracy Institute (https://delib.org)

---

## 1. Overview

Freedi is an open-source deliberative democracy platform. This document describes how we collect, use, store, and protect user data — both for platform operation and for optional academic research purposes.

We are committed to transparency, data minimization, and user control. Research participation is always voluntary, and users can participate in Freedi discussions without contributing data to research.

---

## 2. Data We Collect

### 2.1 Account Data

| Data | Purpose | Storage |
|------|---------|---------|
| Google account UID | Authentication | Firebase Auth |
| Display name | Shown to other participants | Firestore |
| Email address | Account recovery (not displayed publicly) | Firebase Auth |

### 2.2 Platform Data

| Data | Purpose | Storage |
|------|---------|---------|
| Statements (proposals, options) | Core deliberation functionality | Firestore |
| Evaluations (ratings -1 to +1) | Consensus calculation | Firestore |
| Votes | Decision-making | Firestore |
| Discussion subscriptions | Notifications and access control | Firestore |

### 2.3 Research Data (Opt-In Only)

When research logging is enabled on a discussion **and** the user consents, the following is collected:

| Data | Purpose | What is NOT stored |
|------|---------|-------------------|
| User ID (UID only) | Link actions within a session | Display name, email, photo |
| Action type (evaluate, vote, create) | Understand participation patterns | Content of statements |
| Timestamp | Temporal analysis | Precise location |
| Session ID | Group actions within a visit | Device/browser info |
| Source app (main, mass-consensus, sign) | Cross-app analysis | IP address |

**Key privacy properties:**
- Only the UID is stored — no names, emails, or other personally identifiable information (PII)
- Statement content is not included in research logs
- Screen paths are normalized (IDs replaced with `:id`) to prevent tracking

---

## 3. Research Consent

### 3.1 Opt-In Model

Research data collection follows a strict opt-in model:

1. **Admin enables research** — A discussion administrator enables research logging on a specific discussion via `statementSettings.enableResearchLogging`
2. **User sees consent banner** — When entering a research-enabled discussion for the first time, users see a consent modal explaining the research purpose
3. **User chooses** — Users can either:
   - **Consent** — Their anonymized actions in that discussion are logged
   - **Decline** — They continue participating normally without any data being logged
4. **Per-discussion** — Consent is tracked per discussion, not globally

### 3.2 Consent Banner Content

The consent banner informs users that:
- The discussion is part of academic research aimed at improving democratic decision-making
- All data is collected anonymously — no personal information is stored
- They may opt out and continue participating without being tracked

### 3.3 Withdrawing Consent

Users who previously consented can withdraw by clearing their consent record. Research data already collected is retained in anonymized form as it cannot be linked back to individuals.

---

## 4. Data Anonymization and Pseudonymization

### 4.1 At Collection

- Only Firebase UID is stored (not display name, email, or photo)
- Screen/route paths are normalized to remove statement IDs
- Login counts are bucketed into ranges (1, 2-5, 6-10, 11-20, 20+) to prevent identification

### 4.2 At Export

When research data is exported for analysis:

- UIDs are replaced with sequential pseudonyms: `participant_1`, `participant_2`, etc.
- Log IDs are regenerated to remove UID traces
- Login counts are removed
- Screen paths are re-normalized

### 4.3 K-Anonymity Protection

When demographic data is included in exports:
- A minimum group size of k=3 is enforced
- Demographic breakdowns with fewer than 3 users are suppressed
- Suppression notes are included in exports

---

## 5. Data Retention

### 5.1 Research Logs

- **Retention period:** 365 days
- **Automatic cleanup:** A scheduled Cloud Function (`cleanupResearchLogs`) runs daily at 3:00 AM UTC and deletes research logs older than the retention period
- **Batch processing:** Deletions are processed in batches of 500 documents

### 5.2 Platform Data

- Statements, evaluations, and votes are retained as long as the discussion exists
- Users can request deletion of their account data by contacting the platform administrators
- Consent records are retained to honor user preferences

### 5.3 Cookies

- **HttpOnly cookies** are used for session management in sub-apps (Sign, Mass Consensus)
- No tracking cookies are used
- No third-party advertising cookies are used

---

## 6. Data Access

### 6.1 Who Can Access Research Data

| Role | Access Level |
|------|-------------|
| System administrators | Full access to pseudonymized research logs |
| Discussion administrators | View aggregate statistics for their discussion |
| Researchers (via export) | Pseudonymized JSON exports only |
| Participants | No access to research logs |

### 6.2 Firestore Security Rules

- Research logs are append-only (no edits or deletions by clients)
- Only system administrators can read research logs
- Users can only create logs for their own UID
- Consent records can only be read/written by the owning user or system administrators

---

## 7. Third-Party Services

| Service | Purpose | Data Shared | DPA Status |
|---------|---------|-------------|------------|
| Firebase (Google) | Hosting, Auth, Database | Account data, platform data | Google Cloud ToS |
| Sentry | Error monitoring | Error traces (no PII) | Pending |
| OpenAI / Google Gemini | AI features (optional) | Statement text (for processing) | API ToS |

---

## 8. User Rights

Users have the following rights regarding their data:

1. **Right to Information** — This document describes all data collection practices
2. **Right to Consent** — Research participation is opt-in with clear consent UI
3. **Right to Withdraw** — Users can decline research participation at any time
4. **Right to Access** — Users can request a copy of their data
5. **Right to Deletion** — Users can request deletion of their account and associated data
6. **Right to Portability** — Platform data can be exported in standard formats

To exercise these rights, contact the platform administrators or open an issue at https://github.com/delib-org/Freedi-app/issues.

---

## 9. For Researchers

### 9.1 Research Ethics

Researchers using Freedi data should:

- Obtain appropriate IRB/ethics committee approval for their study
- Use only pseudonymized exports — never attempt to re-identify participants
- Report findings in aggregate — never report individual-level data
- Cite the platform appropriately (see README for citation format)
- Follow applicable data protection regulations (GDPR, Israeli Privacy Protection Law, etc.)

### 9.2 Data Available for Research

| Dataset | Format | Content |
|---------|--------|---------|
| Research logs | JSON | Pseudonymized action logs (evaluate, vote, create, login) |
| Aggregate statistics | Dashboard | Real-time counts, activity rates, app breakdown |
| Consensus scores | API | Algorithm outputs (no individual evaluations) |

### 9.3 Enabling Research on a Discussion

1. Navigate to the **Admin Panel** (system administrators only)
2. Open the **Research Dashboard**
3. In the **Research Logging Config** panel, enter the top-level statement ID
4. Click to toggle research logging to **Enabled**
5. Users entering the discussion will see the consent banner

---

## 10. Security Measures

- All data is transmitted over HTTPS/TLS
- Firebase Authentication handles identity verification
- Firestore security rules enforce access control at the document level
- Research logs are append-only — cannot be modified or deleted by clients
- No PII is stored in research logs
- Exports are automatically pseudonymized before download

---

## 11. Changes to This Policy

We may update this policy as the platform evolves. Changes will be reflected in the "Last Updated" date above. Significant changes that affect user rights will be communicated through the platform.

---

## 12. Contact

For privacy-related inquiries:
- **GitHub Issues:** https://github.com/delib-org/Freedi-app/issues
- **Organization:** Deliberative Democracy Institute — https://delib.org

---

## 13. Legal Basis

Data processing is based on:
- **Legitimate interest** — Platform operation and improvement
- **Consent** — Research data collection (explicit opt-in)
- **Contract** — Providing the deliberation service to authenticated users

This policy is designed to comply with:
- **GDPR** (EU General Data Protection Regulation)
- **Israeli Privacy Protection Law** (1981) and its regulations
- **CCPA** (California Consumer Privacy Act) principles
