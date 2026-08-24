# Estimating Israeli Party Positions on Deliberative Statements: Method and Dataset

**Project:** Israeli Odyssey (אודיסיאה ישראלית) — pre-election civic-voice game, Freedi platform
**Date:** 2026-08-24 · **Dataset version:** `apps/odyssey/src/data/party-stance-research.json` v1
**Pipeline author:** Claude (Fable 5) research pipeline, commissioned by Tal Yaron
**Status:** complete dataset, **pending human review** (review sheets in `apps/odyssey/docs/review/`)

---

## Abstract

The Odyssey game measures opinion distance between players and political parties with the metric d(a,b) = mean|eₐ(s) − e_b(s)| / 2 over statements both sides evaluated (see `apps/agora/docs/opinion-distance-and-map.md` §1). Players produce their evaluations by playing; parties cannot. This report documents how we estimated a continuous evaluation score eₚ(s) ∈ [−1, +1] for each of Israel's 11 Knesset parties on each of 48 deliberative statements (12 topics × 4 statements), producing 528 estimates grounded in published materials. We describe the evidence hierarchy, scoring semantics, confidence rubric, inference rule for unfindable positions, the multi-agent research procedure, the validation pipeline, and the protocol for extending the dataset when new topics or statements are added. We report descriptive statistics and enumerate validity threats and their mitigations. The dataset is a *scored-estimate* instrument, not ground truth: every cell carries a rationale, confidence grade, and citations so that a human reviewer can audit and correct any estimate before it reaches production.

---

## 1. Background and purpose

In the game, an island is a policy question and its "shores" (חופים) are 3–5 statements (היגדים) spanning the answer space. A player marks each statement support (+1), live-with (+0.5) or oppose (−1). Parties participate as *virtual users*: each party carries a per-statement attitude map, and the same distance metric applies player↔party as player↔player. The engine originally used a crude one-declared-stance model (+1 on one statement, −1 on its siblings). This project replaced it with **continuous per-statement scores estimated from the public record**, because:

1. Real parties hold graded, not binary, positions (e.g., Yisrael Beiteinu supports *some* override clause but opposed the 2023 overhaul).
2. The ±1 fan-out amplifies any labeling error into a maximal signal; continuous scores degrade gracefully.
3. Attribution of positions to real parties in a pre-election civic tool demands an auditable evidence trail.

**Unit of measurement: the statement, not the issue.** A party is scored against the *exact Hebrew wording* of each statement, including its qualifiers. Example: Hadash-Ta'al scores +1 on "שוויון מלא והשקעה מתקנת רחבה" but only +0.1 on "השקעה אזרחית משמעותית **בלי שינוי זהות המדינה**" — the qualifying clause contradicts its platform demand to repeal the Nation-State Law, and the score reflects the full sentence.

## 2. Task definition

For every party p ∈ P (|P| = 11) and statement s ∈ S (|S| = 48), estimate:

> eₚ(s) ∈ [−1, +1] — how strongly party p supports (+) or opposes (−) statement s, **as of the estimation date (2026-08-24)**, according to its published record.

Together with the score, each estimate must carry:

| Field | Meaning |
|---|---|
| `confidence` | high / medium / low (rubric in §4.6) |
| `inferred` | true ⇔ no findable published position; score derived from general ideology |
| `rationale` | 1–2 sentences (Hebrew) stating the evidential basis |
| `sources` | ≥1 citation {title, url, quote?, date?} for every non-inferred estimate |

## 3. Materials

- **Statements:** the 12 default islands of the Odyssey game (`apps/odyssey/src/lib/defaults.ts`), 4 statements each, covering: Oct-7 accountability, rule of law, integrity of office-holders, the long-term political horizon, security doctrine, Arab-party partnership, Arab-citizen equality, Haredi service/education/funding, religion & state, cost of living & housing, governance & representation, foreign relations.
- **Parties:** Likud, Yesh Atid, National Unity (המחנה הממלכתי), Religious Zionism, Shas, UTJ, Yisrael Beiteinu, Otzma Yehudit, Ra'am, Hadash-Ta'al, The Democrats.
- **Evidence base:** open Hebrew (and some English) web sources, 2022–2026, retrieved by targeted search at estimation time. Top source domains in the final dataset: ynet (155 citations), mako/N12 (47), Hebrew Wikipedia (35), Israel Democracy Institute (33), Israel Hayom (31), Maariv (30), Calcalist (27), Kan (25), Haaretz (21), Globes (16), Davar (16), Walla (13); plus party-owned platforms (yeshatid.org.il, beytenu.org.il, democrats.org.il, zionutdatit.org.il, ozma-yeudit.com), Knesset records, INSS, Adalah, JPPI, Times of Israel, JPost.

## 4. Method

### 4.1 Evidence hierarchy

Estimates draw on evidence classes in strict order of precedence. When classes conflict, the higher class wins and the rationale says so.

1. **Recorded parliamentary behavior** — Knesset votes on directly relevant legislation (e.g., the reasonableness-clause abolition 64–0, July 2023; the judges-selection-committee law 67–0, March 2025; the July 2025 sovereignty declaration with a named per-faction breakdown; the Torah-study Basic Law 63–52, July 2026). Votes are the least deniable signal of a party line.
2. **Official platform / program text** — party platforms, published plans (e.g., Levin plan, Smotrich's "חוק וצדק", Liberman's economic plan, the Democrats' platform).
3. **Leader statements attributable to the party line** — weighted by recency, specificity, and whether the speaker is the leader or a licensed spokesperson; one-off backbencher remarks are discounted or noted as internal dissent.
4. **Governing behavior** — budgets executed, programs frozen or funded (e.g., Smotrich's freezes of Arab-society five-year-plan funds; Shas food-card programs). Actions weigh more than declarations when the two diverge; the rationale then cites the divergence (e.g., Likud's free-market rhetoric vs. its 2025 VAT rise and sectoral coalition funds).
5. **Ideological inference** — used only when classes 1–4 yield nothing on the statement (see §4.4).

### 4.2 Scoring semantics

- **±1.0** — the statement is (or negates) a core, repeatedly affirmed identity commitment of the party (e.g., UTJ on Haredi educational autonomy: +1; Ra'am on political disqualification of Arab coalition partnership: −1).
- **±0.7…0.95** — explicit, current, and consistent support/opposition documented in classes 1–3, but short of an identity commitment, or with minor internal dissent.
- **±0.4…0.65** — clear lean established from adjacent explicit positions or from behavior; or explicit support qualified by significant caveats.
- **±0.05…0.35** — weak or mixed signal: partial overlap with the statement, internal splits, or rhetoric–behavior divergence.
- **0** — *genuine ambivalence documented or inferred*, never "we don't know". Ignorance is handled by the inference rule, not by a silent zero.
- Fractional granularity of 0.05 was allowed; agents mostly used 0.1 steps.

**Statement-text fidelity rule.** The full sentence is scored, qualifiers included. When a party endorses the mechanism but rejects a qualifier (or vice versa), the score moves toward 0 and the rationale identifies which clause binds.

**Party-not-politician rule.** The unit is the party line. Documented internal splits pull the score toward 0 and are named in the rationale (e.g., Likud −0.4 rather than −1 on "restrained review", citing Gallant's dissent; Likud −0.4 on full Haredi service equality, citing the Edelstein wing against the Bismuth line).

**Recency rule.** The window is 2022–2026; later evidence supersedes earlier. Current-Knesset votes and 2025–2026 statements outrank 2022 campaign positions. Where a position visibly shifted (e.g., Lapid and Gantz on cooperation with Arab parties after Oct 7; Netanyahu shelving the broad override clause), the *current* stance is scored and the shift may be noted.

### 4.3 Full-coverage rule

Per the product owner's decision, **every party × statement cell is scored** — a party with no findable position is not skipped but estimated by inference (§4.4). Rationale: the distance engine treats a missing score as "no data" and drops the statement from that party's route; systematic missingness for low-documentation parties (mostly the Haredi parties on foreign policy) would bias their distances toward the topics they *do* publish on. The cost of this decision — attribution risk on inferred cells — is managed by flagging (`inferred: true`), forcing `confidence: low`, and surfacing the flag in the game-side review sheets and in this report's statistics.

### 4.4 Inference rule (unfindable positions)

When classes 1–4 yield nothing on the statement itself, the estimate is derived from the party's general ideological line and documented adjacent behavior, and must:

- set `inferred: true` and `confidence: "low"` (enforced by the validator);
- state the inference base explicitly in the rationale (e.g., "אין עמדה מפורסמת; כמפלגה חרדית-פרגמטית הנשמעת למועצת חכמי התורה היא מיישרת קו עם מדיניות הממשלה");
- be allowed an empty `sources` array (there is nothing to cite for a non-statement).

95/528 estimates (18.0%) are inferred. They concentrate exactly where expected: parties that publish little policy outside their core agenda (UTJ 19, Ra'am 17, Shas 14 inferred cells) and topics remote from most parties' platforms (foreign relations 22, governance/representation 19 inferred cells).

### 4.5 Retrieval procedure

Research was executed by **11 parallel research agents, one per topic** (the 12th topic, rule of law, was researched first as a piloted template by the main session). Per-topic isolation was chosen over per-party isolation so that each agent builds one coherent evidential context (e.g., the single vote breakdown of the sovereignty declaration grounds 11 parties at once) and so that no agent's framing of one topic leaks into another.

Each agent received: the exact statement texts and central question; the party list with fixed slugs; the political context as of 2026-08-24 (coalition composition, expected October 2026 elections); the evidence hierarchy, scoring semantics, confidence rubric and inference rule (§4.1–4.4); topic-specific research leads (named laws, votes, plans to verify); and a strict JSON output contract. Agents performed 6–16 targeted web searches each (Hebrew queries), ~15–20 tool calls per topic, and returned only structured JSON.

### 4.6 Confidence rubric

- **high** — explicit platform text, a recorded vote, or a direct leader statement *on this exact issue*, current and uncontradicted.
- **medium** — position derived from clear adjacent explicit positions or consistent behavior; or explicit but dated/partially contradicted evidence.
- **low** — weak, indirect, or inferred evidence. All `inferred` cells are low by construction.

Distribution in the dataset: high 218 (41.3%), medium 210 (39.8%), low 100 (18.9%).

### 4.7 Validation pipeline

Machine checks (`apps/odyssey/scripts/validate-research.ts`, run on every change):

1. every island/party slug resolves against the game content;
2. full coverage: every researched island contains all 11 parties with exactly one entry per statement;
3. score ∈ [−1, 1]; confidence ∈ {high, medium, low};
4. `inferred ⇒ confidence = low`; `¬inferred ⇒ ≥1 http(s) source`;
5. non-empty rationale; well-formed source URLs.

Merge-time checks (main session): schema shape per agent payload, normalization of the inferred/confidence invariant, rejection of any island failing checks (re-run rather than partial-accept).

**Human review gate.** The canonical JSON renders (via `render-research-review.ts`) into 12 generated-only Markdown review sheets (`apps/odyssey/docs/review/<island>.md`): a score matrix per island plus, per cell, the rationale and numbered linked citations with verbatim quotes where captured. The product owner reviews and corrects; corrections are made in the JSON (single source of truth), sheets re-render, and the live game is re-patched. **No estimate is considered production-grade before this gate.**

### 4.8 Deployment

Scores flow to the game by two routes: (a) fresh seeds read the research file directly; (b) `patch-party-attitudes.ts` maps scores onto an *existing* game document without reseeding (islands located by position + title with loud abort on mismatch; statements by their persisted `order`), preserving all collected player evaluations. Citations never enter the game document — the game carries only the numbers; provenance lives in the research file and review sheets.

## 5. Results

**Coverage.** 12/12 topics, 48/48 statements, 11/11 parties: 528/528 estimates. 592 citations total (mean 1.12 per estimate; inferred cells excluded from the source requirement), 68 estimates carry a verbatim quote.

**Score usage.** The continuous scale is genuinely used: |s| = 1 in 72 cells (13.6%), 0.7 ≤ |s| < 1 in 174 (33.0%), 0.4 ≤ |s| < 0.7 in 142 (26.9%), 0 < |s| < 0.4 in 127 (24.1%), s = 0 in 13 (2.5%). Under the old model, 100% of cells would have been ±1.

**Face-validity patterns** (uncorrected observations, pending review):

- The rule-of-law and Arab-partnership topics reproduce the known coalition/opposition bloc structure almost perfectly — expected, since both were the subject of whipped votes.
- Cross-cutting topics break the blocs: on "סיוע ישיר למשפחות ולפריפריה" *all eleven* parties score positive (range +0.3…+0.95), and on Haredi policy Yisrael Beiteinu sits with the opposition while Ra'am sits nearer the Haredi parties — precisely the deliberative texture the game needs so that "distance" is not a party-bloc tautology.
- The inferred-cell map (§4.4) matches the documentation-availability prior, suggesting agents applied the inference rule rather than fabricating positions.

## 6. Validity threats and limitations

1. **Single-coder design.** Each cell was scored once by one LLM agent. No inter-rater reliability was measured. *Mitigations:* the human review gate; the confidence/inferred flags direct reviewer attention; a straightforward extension is a second independent model pass (e.g., a different LLM) with disagreement flagging — recommended before any high-stakes publication of the data.
2. **Citation verification depth.** URLs were produced from search results the agents actually read, but the pipeline did not *re-fetch and diff* every cited page against every claim. A citation may summarize its source imperfectly. The review sheets make each claim–source pair auditable one click away.
3. **Source-availability bias.** Parties with thin published platforms are systematically pushed into the inference rule; their scores are structurally softer and lower-confidence. This is disclosed per cell rather than hidden.
4. **Temporal validity.** Positions drift; several statements sit on active fault lines (draft law, judicial overhaul, war endgame). The dataset is stamped (`updated: 2026-08-24`) and should be re-run per topic when a major event moves a fault line, and wholesale before the game's public event window.
5. **LLM priors.** Agents may import their own framing of Israeli politics. The mitigations are the structural ones: evidence-hierarchy prompting, mandatory citations, verbatim statement-text scoring, validator-enforced flags, and the human gate. Residual risk remains and is the main reason the review gate is mandatory, not optional.
6. **Statement ambiguity.** Some statements bundle two claims (e.g., "משקל מכריע לברית עם ארה\"ב **ולמעמד הבינלאומי**"); parties may split across the bundle (Hadash-Ta'al: high on international standing, low on the US alliance). Agents scored the conjunction and noted the split; reviewers may prefer to split such statements in future content.
7. **Downstream effect.** Scores feed d = mean|Δ|/2. Errors on a single statement move a party's distance by at most Δ/(2·n) for n shared statements (n = 48 for a full voyage) — individual-cell errors attenuate, but *correlated* bias (e.g., systematically softening one party) would shift its whole route; this is what the review gate and the planned second-model pass exist to catch.

## 7. Reproducibility and extension protocol

Everything needed to reproduce or extend the dataset is in-repo:

- **Canonical data:** `apps/odyssey/src/data/party-stance-research.json` (scores + confidence + rationales + citations).
- **Scripts:** `validate-research.ts` (gatekeeper), `render-research-review.ts` (review sheets), `patch-party-attitudes.ts` (live-game deployment), `research-missing-stances.ts` (gap scanner, §7.1).
- **Agent prompt template:** Appendix A. New research MUST use it unchanged except for the topic block, so that estimates remain comparable across time and topics.

### 7.1 Protocol for new islands / statements

When an admin adds an island or statement (via `/admin`), party scores do not exist for it. The standing protocol:

1. **Scan:** `npx tsx apps/odyssey/scripts/research-missing-stances.ts --game <id>` reads the live game document and reports every statement lacking scores for enabled parties, emitting a ready-to-dispatch research brief (statement texts, central question, party list, and the Appendix-A prompt pre-filled).
2. **Research:** dispatch one research agent per new island with the brief (same contract as §4.5). New islands are registered in the research file under a new slug with an `islandMeta` record (title + statement list), since admin-created islands have no entry in the built-in defaults.
3. **Validate → render → review:** same pipeline; the validator and sheet renderer resolve non-default islands through `islandMeta`.
4. **Deploy:** `patch-party-attitudes.ts` locates non-default islands in the live document by title and patches by statement order.

The same protocol re-scores an *existing* statement after a political event: correct or delete its entries in the JSON, re-run steps 3–4.

---

## Appendix A — Research-agent prompt template

```
You are a political-positions researcher for an Israeli civic game. Today is {DATE};
Knesset elections are expected {ELECTION}. Current coalition: {COALITION}.
Opposition: {OPPOSITION}.

TASK: For EACH of {N_PARTIES} parties, estimate its stand on EACH of the {N} statements
below, as a continuous score in [-1, +1]: -1 = strongly opposes this exact statement,
+1 = strongly supports it, fractions encouraged. Ground every score in PUBLISHED
materials via web search (party platforms, Knesset votes, leader statements,
{YEAR_WINDOW}, prefer recent).

TOPIC: {ISLAND_TITLE} — {ISLAND_ISSUE}
Question: {CENTRAL_QUESTION}
Statements:
{NUMBERED_STATEMENTS}

Key research leads: {TOPIC_SPECIFIC_LEADS}

RULES:
- Do 6-14 targeted web searches (Hebrew queries work best). Verify claims before scoring.
- confidence: "high" = explicit platform/vote/statement on this exact issue;
  "medium" = derived from clear adjacent positions; "low" = weak evidence.
- If NO findable published position: inferred:true, confidence:"low", sources:[],
  rationale explains the ideological inference. Every party × statement MUST have an entry.
- Non-inferred entries MUST have >=1 source: {"title","url"(http/https),
  "quote"(optional),"date"(optional)}.
- rationale: 1-2 sentences in Hebrew.
- Party slugs exactly: {PARTY_SLUGS}.

OUTPUT: Return ONLY a valid JSON object: keys = the party slugs; each value = array of
EXACTLY {N} entries (statement order), each entry {"score": number, "confidence":
"high"|"medium"|"low", "inferred": boolean, "rationale": string, "sources": [...]}.
```

## Appendix B — Confidence and inference by topic

| Topic | high | medium | low | inferred |
|---|---|---|---|---|
| rule-of-law | 31 | 12 | 1 | 1 |
| accountability | 12 | 22 | 10 | 10 |
| clean-hands | 22 | 16 | 6 | 6 |
| political-home | 20 | 19 | 5 | 4 |
| security-storm | 20 | 20 | 4 | 4 |
| arab-partnership | 18 | 21 | 5 | 4 |
| civic-equality | 14 | 21 | 9 | 9 |
| civic-covenant | 22 | 17 | 5 | 4 |
| sabbath-rabbinate | 24 | 18 | 2 | 1 |
| bread-and-home | 12 | 21 | 11 | 11 |
| democracy-itself | 8 | 16 | 20 | 19 |
| world-partners | 15 | 7 | 22 | 22 |

(Row sums = 44 = 11 parties × 4 statements. Low counts include all inferred cells, plus a handful of low-confidence sourced estimates.)
