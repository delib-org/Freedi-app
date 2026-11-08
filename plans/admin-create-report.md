# Plan: "Create report" for admins

Status: approved direction, nothing built. To be executed in a new session. Written 2 November 2026.

## Why

The Korazim Stage A report was written by hand: an AI draft, then 26 review comments by Sigal Gilboa over 28 minutes. Tal wants this as a product feature: a button in the admin panel, a short dialog, and a finished document that follows Sigal's way of working.

Read first: `scientific-research/2026-11-02-korazim-theming-review/README.md`. It explains what the report step has to do and why the pipeline's theme layer is staying as it is.

**Decisions already made by Tal**
- Theme labels in the pipeline stay derived from the text. Professional vocabulary is applied only when writing a report.
- The split sweep is left alone. Its proposed fix failed a preregistered test (Finding 6). Umbrella topics are created at report time.

## What the admin gets

A "Create report" button on a question or a group, opening a dialog:

| Field | Options | Default |
|---|---|---|
| Scope (groups only) | Which child questions to include | All |
| Languages | Multi-select of the 7 app languages (en, he, ar, de, es, nl, fa); one document per language | The question's language |
| Format | PDF, DOCX, or both | DOCX (Sigal edited heavily, so it should stay editable) |
| Vocabulary | Professional / From the texts / Other (free text describing it) | From the texts |
| Extra instructions | Free text | Empty |

Then: progress by stage, download links per file, and a list of earlier reports for this statement.

## Design rules

**1. The model never produces a number.** The hand-written report had the same grocery figure as 15/5 in the summary and 19/5/2 in the table, and listed a 19-of-21 item as contested. So:
- A deterministic fact sheet is built from Firestore first.
- The model returns structured JSON that refers to statements and themes by ID, with placeholders such as `{{s:ID:pro}}`.
- The renderer fills the numbers in.
- A validator rejects any digit in prose that doesn't come from the fact sheet, and any unknown ID. It retries, then fails loudly.

**2. Rules carried over from Sigal's edits**, enforced in code where possible:
- Votes on different themes can't be summed. A chapter keeps each theme's numbers separate.
- Each participant counts once within a theme.
- Contested means at least 20% against, or a high neutral share. Contested items are shown as contested and never presented inside an "agreement".
- Items with few raters (7 or fewer) are marked as a hint, not a finding.
- All proposals are residents', not the facilitators' recommendations.

**3. Sigal's style is a versioned prompt file,** `functions/src/report/prompts/facilitatorStyle.ts`, adapted from the `sigal-editing-style` skill. Keep the general principles, and drop the one community's specifics (Hazorea):
- A report reports; it doesn't interpret or recommend.
- Precise names for events and institutions.
- Respectful language; direct headings.
- Plain, explicit wording; a short glossary.

Hebrew-specific punctuation rules apply only to Hebrew output. The principles need adapting per language, not translating.

**4. Vocabulary applies to chapter names and framing; prose stays plain.**
- *Professional:* the model alone is not enough. In the study it wrote "חוסן קהילתי" and "לכידות קהילתית" unprompted but never "בינוי קהילה". Supply a glossary, `functions/src/report/prompts/professionalGlossary.ts`, seeded with her examples and **to be completed by Sigal**.
- *From the texts:* chapter names reuse theme labels and words in the statements.
- *Other:* the admin's description is passed in.

**5. Free text can shape, not falsify.** Extra instructions can change tone, focus, length or audience. They can't change numbers, hide contested items or invent content, because the fact sheet and validator sit outside the model. Resident statements and admin text go into prompts as delimited data, never as instructions.

**6. Data traps found in the study:**
- `fullExport` reads direct children only and includes hidden rows, so groups need their own traversal and reports must filter hidden rows.
- Membership comes from `theme.integratedOptions`; `themeId` is computed by the export, not stored.
- 3 syntheses on Korazim are filed under two themes. Show each once, by a defined rule, and log it.
- Empty themes and unthemed items (`other-ideas`) need an explicit place: empty excluded, unthemed listed.
- Most "originals" are AI rewrites (`Title: body`), and only 13–15% of direct theme members are plain-form statements. A quote shown as a resident's words must be labelled accurately, and never be an AI paraphrase passed off as a quote.

## Architecture

```
ResultsSection → CreateReportDialog → createReport (callable)
                                          ↓ writes reportJobs/{id}, lease per statement
                              onDocumentCreated worker (540s, 2GiB, me-west1)
   collect facts → group into chapters → write per language → validate → render → Storage
                                          ↓ status updates
                 client onSnapshot on the job → getReportDownloadUrl (callable)
```

| Concern | Choice | Reuse / reference |
|---|---|---|
| Button home | `ResultsSection.tsx:55`, beside export, for questions and groups (confirm in IA) | `HostHub.tsx:118` |
| Dialog | Atomic `Modal`, `Button`, `Checkbox`, `SegmentedControl`, `Input` | Copy `synthesisPanel/ThemeRebuildPreview.tsx`; don't copy raw `<button>`s from `ExportSettings` |
| Auth | Admin or creator | `functions/src/utils/assertStatementAdmin.ts` |
| Stats | Stored `StatementEvaluation` | `condensation/aggregation.ts:303`, `privacyExport/optionStats.ts` `computeMergedStats`; read `functions/src/strategicExport/` before writing anything new |
| Long job | Job doc plus `onSnapshot`, not an awaited callable: no client timeout is set today and rebuild shows no progress | Lease pattern in `synthesis/themeRebuild/rebuildStore.ts` |
| LLM | `callLLM` with `LLM_MODEL_HEAVY`, set `maxTokens` (default is 1024) | `config/openai-chat.ts`; precedent `fn_documentReport.ts:72` |
| Types | `packages/shared-types/src/models/report/`, add to `Collections` | `models/themeRebuild/themeRebuildCallables.ts`. Functions see them only after repacking the `.tgz` |
| i18n | New keys in all 7 language files | `packages/shared-i18n/src/languages/` |
| DOCX | `docx` npm library, new dependency | Tables must be truly right-to-left (`bidi`, `visuallyRightToLeft`), which the hand-written process couldn't do |
| PDF | HTML through headless Chromium (`puppeteer-core` + `@sparticuz/chromium`), recommended because Hebrew and Arabic shaping is the hard part; confirm in the spike | No document library exists in the repo today |
| Fonts | Add Hebrew, Arabic and Persian TTFs to functions assets | The repo has only woff2 subsets |
| Files | New admin-gated `reports/{statementId}/{jobId}/` path, short-lived signed URLs, 30-day retention | `storage.rules:5` makes `statements/**` public, so not there. `getSignedUrl` is unused so far and may need IAM (see memory `custom-token-signblob-iam`) |
| Rules | `reportJobs` readable by statement admins, writable by server only | `firestore.rules:878`. Note rules accept `statement-creator` while `assertStatementAdmin` checks `creatorId`; settle this |

Keep the new dependencies lazy-loaded and, if size demands it, in a separately deployed function, so they don't slow other functions' cold starts. Check the deploy size.

**Document structure,** from the Korazim report:
1. Executive summary with participation numbers
2. About the process and how to read the numbers
3. Findings by chapter, each with its themes and statements
4. Map of agreements and disagreements
5. Proposals rated by few people
6. Appendix: all themes at a glance

## Phases

**Phase 0: gates, before any UI (cheap, offline).**
- *Chapter test.* Give the model the 16 and 27 Korazim themes with contents, ask for chapters, compare with her five groupings, repeat 3 times. Fix the pass criteria first, following `split-test/PREREGISTRATION.md`. **This is untested, and the whole "umbrellas at report time" idea rests on it.** If it fails, the report shows themes ungrouped by default and the admin groups them in DOCX. The feature still ships.
- *Rendering spike.* Generate one Hebrew and one Arabic sample with an RTL table, as DOCX and PDF, from a Cloud Function. Open them in Word, Google Docs and a PDF viewer. Pick the PDF engine. Measure memory, time and deploy size.

**Phase 1: IA.** Run the `information-architect` agent (required by CLAUDE.md) to write `docs/ia/main-create-report.md`:
- Where the button lives, and its name. "Strategic Report (AI-Ready JSON)" at `ExportSettings.tsx:244` will collide.
- One term for theme / cluster / "אשכול" / chapter across UI and report.
- Dialog, progress, history and failure states.

**Phase 2: facts.** `functions/src/report/collectFacts.ts`, groups included, with tests that reproduce the Korazim report's numbers exactly (the 43 rows in the study's `data/sigal_partition.json` are a ready fixture). Include participant counts (proposed, rated), which the report needs and stored stats may not hold.

**Phase 3: writing.** Chapter grouping, the prompts, per-language writing, validator, retries.

**Phase 4: rendering and storage.** DOCX and PDF, RTL, fonts, signed URLs, retention.

**Phase 5: UI.** Button, dialog, progress, downloads, history, i18n, SCSS per the atomic system.

**Phase 6: review and release.**
- `privacy-guardian` agent: verbatim quotes can identify people in a small community, items rated by 1–2 people expose their votes (the k-anonymity rule is k=3), and files live for 30 days.
- `qa-code-auditor` or an independent reviewer.
- Regenerate Korazim on a copy on `freedi-test`, and have **Sigal read it**. That's the acceptance test.
- Deploys need Tal's explicit ask: named functions only, in me-west1; storage and Firestore rules from a clean worktree (rules deploys are whole-file).

## Verification

- Every number in the generated Korazim report matches the fact sheet, by script.
- The validator rejects a deliberately corrupted model answer.
- Extra instructions like "say everyone agrees" or "remove the synagogue dispute" don't alter numbers or drop contested items.
- A resident statement containing an instruction is treated as data.
- Hebrew, Arabic and Persian tables are truly RTL in Word and in PDF.
- Non-admins can't start a job, read a job or fetch a file.
- Generating twice at once is refused by the lease; a failed job reports failure and doesn't leave a half-finished file.
- `npm run check-all`, 80%+ coverage on utilities, and an emulator E2E on the solo suite.

## Questions for Tal, at the start of the new session

1. **Interpretive section.** Sigal's rule is "a report reports, it doesn't interpret", yet the Korazim report has "משמעויות, תובנות ומסקנות" with "להערכתי". Recommended: an "Include insights" checkbox, off by default, clearly labelled as the facilitators' reading.
2. **Naming Sigal in the product.** Recommended: "Facilitator style" in the UI, and ask her before using her name.
3. **Style choice.** Is her style the only one in v1? Recommended: yes, with extra instructions for variation.
4. **Outline approval.** Her edits were mainly about structure. A step to approve chapters before writing would save re-runs, but adds a screen. Recommended: leave it out of v1 and see how much DOCX editing is needed.

**Owed by Sigal:** the professional glossary, and rating the sample output.

## Not in v1

Demographic breakdowns, editing inside the app, publishing reports to participants, scheduled reports, and changes to the theme pipeline.

**Cost:** not measured yet. Phase 0 must report cost per report and per language, and the dialog should show it if it's material.
