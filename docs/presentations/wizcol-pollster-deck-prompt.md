# Prompt — Generate WizCol Slideshow for Pollsters

> Paste everything below the line into Gamma, Tome, Beautiful.ai, ChatGPT, Claude, or any slide-generation tool.

---

## ROLE

You are a senior B2B pitch designer building a 14-slide deck for a US polling/survey company (similar to PDI, geokg.com, or any traditional pollster) evaluating **WizCol** — a deliberative polling platform — as a strategic partner.

Audience mindset: pollsters live and die by (a) margin per project, (b) defensibility of numbers, (c) speed to client, (d) how easy crosstabs are to read. They are skeptical of "AI" but love anything that lets them sell more polls or charge more per poll.

## TONE & STYLE

- Direct, commercial, no jargon-stacking. One concrete number per slide where possible.
- Each slide: **one big claim + one supporting visual idea** (table, formula, comparison, quote).
- No emojis except sparingly for green/yellow/red status.
- Every technical claim has a defensible source — include source paths in speaker notes.
- Visual style: clean, minimal, data-forward. Avoid stock-photo "people pointing at laptops."

## STRUCTURE

14 slides, sorted by **importance to a pollster's commercial decision**, not by technical depth. The opening must hook on margin and market expansion — the closer is the partnership ask.

---

## SLIDE 1 — Title

**WizCol — Deliberative Polling for the Modern Survey Firm**

Subtitle: "10× efficiency. Calibrated consensus. Cross-demographic agreement at a glance."

Footer: Co-developed with CleanSweep Campaigns (US). Backed by the Israeli Innovation Authority.

---

## SLIDE 2 — The Commercial Headline (#1 priority for a pollster)

Title: **A 10× efficient polling layer — opens markets you can't currently serve**

| District size | Traditional poll | WizCol Pulse Check | Margin opportunity |
|---|---|---|---|
| 2,500 voters (school board) | $25,000 | **$2,800** | New addressable market |
| 10,000 voters (city council) | $30,000 | **$5,500** | 5× more projects per quarter |
| 50,000 voters (state assembly) | $75,000+ | **$18,000** | Add-on to tracking polls |

Bottom line: **5 days, not 4–6 weeks.** Down-ballot races (school boards, city councils) are currently uneconomical for traditional methods — WizCol unlocks them.

Speaker notes: 50/50 platform/agency revenue split modeled by CleanSweep Campaigns for 2026 cycle.

---

<<<<<<< HEAD
## SLIDE 3 — The Collaboration Index — a 2D map of every proposal × every demographic pair

Title: **Where they agree, where they dispute, who supports, who opposes — on one map**

The Collaboration Index plots each proposal-by-group-pair as a point on a 2D map:

- **Y-axis — Agreement-on-Evaluation:** `1 − |mean_A − mean_B| / 2` &nbsp; (top = divided, bottom = united)
- **X-axis — Direction:** `(mean_A + mean_B) / 2` &nbsp; (left = oppose, right = support)

The map's four readable corners:

| Position | Meaning | Color band |
|---|---|---|
| **Bottom-right** | United in support | 🟢 |
| **Bottom-left** | United in rejection | 🟢 |
| **Bottom-center** | United in indifference (dead issue) | 🟡 |
| **Top** | Polarized — groups disagree on the evaluation | 🔴 |

A 200-cell crosstab compresses to one picture. Visual: render the actual map screenshot here (Hebrew labels: מאוחדים = united, מחולקים = divided, קונצנזוס = consensus, דחייה = rejection, ניטרלי = neutral, מקוטב = polarized).

Source: `packages/shared-types/src/utils/madCalculation.ts` (function `calculateAgreementOnEvaluation`)

---

## SLIDE 4 — The Collaboration Index in numbers

Title: **Read the map: four worked examples**

| Group A vs. Group B | mean_A | mean_B | Agreement-on-Eval | Direction | Map position |
|---|---|---|---|---|---|
| Dems vs. Reps — Proposal X | +0.55 | +0.45 | **0.95** | +0.50 | 🟢 bottom-right (united support) |
| Dems vs. Reps — Proposal Y | +0.60 | −0.50 | **0.45** | +0.05 | 🔴 top (polarized landmine) |
| Dems vs. Reps — Proposal Z | −0.40 | −0.50 | **0.95** | −0.45 | 🟢 bottom-left (united rejection) |
| Latino vs. non-Latino — Q | +0.05 | +0.05 | **1.00** | +0.05 | 🟡 bottom-center (issue is dead) |

Within-group fractures caught by **MAD (Mean Absolute Deviation)** — a party can have a high mean but be internally split. MAD catches what crosstab averages hide.

K-anonymity: minimum segment size = 5 (auto-suppressed below threshold).
=======
## SLIDE 3 — Demographic Collaboration Index (DCI) — replaces crosstab reading

Title: **Cross-partisan common ground as a single sortable number**

> **DCI = 1 − |mean_A − mean_B| / 2**     (range 0 → 1)

| Group A vs. Group B on Proposal | mean_A | mean_B | **DCI** | Read |
|---|---|---|---|---|
| Dems vs. Reps — Proposal X | +0.55 | +0.45 | **0.95** | 🟢 Strong cross-partisan agreement |
| Dems vs. Reps — Proposal Y | +0.60 | −0.50 | **0.45** | 🔴 Polarized landmine |
| Latino vs. non-Latino — Proposal Z | +0.30 | +0.20 | **0.95** | 🟢 Bilingual rollout safe |

A 200-cell crosstab becomes one column you can sort. Every proposal × every demographic pair gets a number.

Source: `packages/shared-types/src/utils/madCalculation.ts:54`

---

## SLIDE 4 — DCI in Practice: Green / Yellow / Red

Title: **One-page client deliverable instead of a 40-page deck**

Every proposal (or document paragraph) auto-classified:

| Status | Divergence | Campaign action |
|---|---|---|
| 🟢 **Collaborative** | < 0.25 | Lead with this — broad agreement |
| 🟡 **Mixed** | 0.25 – 0.60 | Needs message work |
| 🔴 **Polarized** | > 0.60 | Landmine — expect counter-mobilization |

Within-group fractures caught by **MAD (Mean Absolute Deviation)** — a party can have a high mean but be internally split. DCI catches what crosstab averages hide.
>>>>>>> feat/join-facilitation-mode

Source: `apps/sign/app/api/admin/collaboration/[docId]/route.ts`

---

## SLIDE 5 — Calibrated Consensus Score — defensible math

Title: **Replace "% agree" with a number you can defend in court**

> **C_p = μ_p − t_{α, n+k−1} · SEM\*_p**

- t-distribution penalty for small samples (Student-t, α = 0.05)
- Bayesian smoothing with k = 2 phantom prior votes
- Output range: [−1, +1]

| Scenario | Naive % | **WizCol C_p** |
|---|---|---|
| 3 of 3 unanimous | 100% | **+0.45** |
| 990 of 1000 | 99% | **+0.99** |
| 60% support, polarized | 60% | **+0.18** |
| 60% support, calmly aligned | 60% | **+0.42** |

A pollster can answer "how confident are we?" with a number, not a footnote.

Source: `packages/shared-types/src/utils/consensusCalculation.ts`

---

## SLIDE 6 — Eliminate open-end coding labor

Title: **AI clustering replaces a 2-week coding sprint**

When 500 respondents write 500 short proposals, you'd hire grad students to code them.

WizCol uses:
- **OpenAI text-embedding-3-small** (1536-d) for semantic similarity
- **8-d rating vector** layered on top
- Hybrid blend that shifts as more evaluations arrive

| Evaluators | Text similarity | Rating similarity |
|---|---|---|
| 0 | 100% | 0% |
| 20 | ~57% | ~43% |
| 100+ | minority | majority |

Native multilingual: English, Hebrew, Arabic, Spanish, Dutch, German.

Source: `functions/src/services/{embedding,vector-search,hybrid-vector}-service.ts`

---

## SLIDE 7 — Real Voice — voters write the items being scored

Title: **Stop guessing the question. Let respondents propose the answer.**

Mass Consensus app flow (anonymous, no login):
1. Recruit via SMS / MMS / QR / email link
2. See question + 6 randomly shuffled options
3. Swipe to evaluate (−1 to +1)
4. **Submit own proposal** if none capture their view
5. New proposals enter the pool, evaluated by others

Same consensus math applies to voter-written proposals. Pollster gets the **specific language** ("Cat Cafés", "Vacant Lot Sales") clients need for messaging — at sample sizes that are statistically defensible.

Source: `apps/mass-consensus/`

---

## SLIDE 8 — Negative-consensus detection (the "insurance policy")

Title: **Catch landmines a one-sided poll never sees**

Two-sided scoring → strong negatives are flagged automatically.

> **Modesto, CA — April 2026 (CleanSweep validation):**
> A $2,800 Pulse Check surfaced **58% active opposition** to a parking ordinance the incumbent was about to champion. A standard poll, scoped only to the campaign's preferred frame, would have missed it.

For a pollster: this is the **risk-mitigation product** you can sell to every incumbent. One avoided debacle pays for a year of polling.

---

## SLIDE 9 — Privacy & compliance baked in

Title: **K-anonymity & GDPR/CCPA-ready — out of the box**

- **Minimum segment size = 5** (`DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE`) — segments below threshold are auto-suppressed
- Anonymous evaluation (UUID, no PII required)
- All scores deterministic and re-computable from raw evaluation data
- No black-box "proprietary index" — every number is auditable

Reduces legal review cost per project. Lets the pollster sell to municipalities, school districts, EU clients without bespoke legal work.

Source: `packages/shared-types/src/utils/madCalculation.ts:65`

---

## SLIDE 10 — Multilingual & bilingual recruitment

Title: **Latino-segment polling without translation overhead**

- 6 languages built in: English, Hebrew, Arabic, Spanish, Dutch, German
- OpenAI embeddings cluster cross-lingually (Spanish proposal grouped with semantically similar English proposal)
- Bilingual SMS/QR recruitment via CleanSweep partnership

For US pollsters: serve the Latino electorate without standing up a separate Spanish-language survey instrument.

---

## SLIDE 11 — Live Facilitation Mode

Title: **Run a synchronized session at a town hall — walk out with structured data**

- Organizer projects the question on screen
- Participants join `/m/{mainId}` on phones
- All views force-synced via Firestore listeners
- Live group evaluates options, then drills into top option's discussion thread

Adds a new service line: **moderated deliberation events** (focus group + poll + report in one engagement).

Source: `apps/join/src/lib/facilitator.ts`

---

## SLIDE 12 — Side-by-side: WizCol vs. Traditional Pollster

Title: **What changes for your firm**

| Capability | Traditional | **WizCol** |
|---|---|---|
| Output | % agree | Calibrated consensus score |
| Sample-size adjustment | Footnote | Built into score |
| Cross-partisan common ground | Crosstab inference | **DCI per pair of groups** |
| Within-group cohesion | Not reported | **MAD per segment** |
| Open-ended responses | Manual coding, weeks | AI-clustered in real time |
| Voter-submitted proposals | No | **Real Voice** |
| Negative-consensus alerts | Only if asked | Automatic |
| Live group sessions | No | **Facilitation Mode** |
| Languages | Per project | 6 built-in |
| Time to insight | 4–6 weeks | **3–5 days** |
| Typical cost (local race) | $25k–$40k | **~$2,800** |

---

## SLIDE 13 — Partnership architecture

Title: **White-label, modular, revenue-share**

- 5 specialized apps (Mass Consensus, Join, Sign, Admin, Flow) — embed any single capability into your client portal
- 50/50 platform / agency revenue split
- Pollster owns the client relationship, recruitment, branding
- WizCol provides: the math engine, AI clustering, DCI, infrastructure
- Backed by: Firebase (region me-west1), OpenAI embeddings, Israeli Innovation Authority

The pollster doesn't replace their stack — they add a premium layer on top.

---

## SLIDE 14 — The ask

Title: **Pilot proposal for the 2026 cycle**

Three things we're proposing:

1. **One joint pilot** — choose a down-ballot race in your existing book and run a $2,800 Pulse Check alongside your traditional method. Compare the deliverable side by side.
2. **Co-branded "Pulse Check" SKU** — premium add-on to your tracking polls, priced at $5–8k, marketed as Message R&D.
3. **Exclusive territory** — first-mover license in your state / vertical for 12 months.

Closing line: *WizCol does to political polling what continuous deployment did to software releases — turn a 6-week, $30k batch process into a 5-day, $3k iterative one, while producing better data, in voters' own words, with cross-partisan consensus already mapped.*

Contact: tal.yaron@gmail.com

---

## OUTPUT INSTRUCTIONS FOR THE SLIDE TOOL

- Generate **14 slides in this exact order**.
- Each slide: clean layout, max 30–40 words of body copy, plus one table or formula where listed.
- Use a restrained color palette (one accent color, one neutral background). Highlight 🟢🟡🔴 status colors only on slides 3 and 4.
- No clip art. Use simple geometric icons or none at all.
- Speaker notes for each slide: include the source file path provided, plus one sentence the presenter would actually say out loud.
- Final format: **PPTX preferred**, fallback to PDF.

## ORDER RATIONALE (do not include in output)

1. Title
2. **Cost / market expansion** — pollsters lead with margin
<<<<<<< HEAD
3. **Collaboration Index map** — the killer analytical feature; replaces what they already do (crosstabs) with a 2D picture
4. **Collaboration Index worked examples** — proves it's operational, not theoretical
=======
3. **DCI** — the killer analytical feature; replaces what they already do (crosstabs) with something better
4. **DCI in practice** — proves it's operational, not theoretical
>>>>>>> feat/join-facilitation-mode
5. **Calibrated consensus** — defensibility (their #2 commercial concern)
6. **AI clustering** — kills a real labor cost line
7. **Real Voice** — the methodological leap; powerful but slightly threatening to their question-design role, so placed mid-deck after credibility is established
8. **Negative consensus** — risk-mitigation product, sells itself with the Modesto case
9. **Privacy / k-anonymity** — reduces legal & ops cost
10. **Multilingual** — market-specific value (Latino segment)
11. **Facilitation Mode** — new service line, niche but differentiating
12. **Side-by-side** — consolidates everything into one decision-ready table
13. **Partnership architecture** — answers "how does this fit in our business?"
14. **The ask** — concrete, low-risk pilot proposal
