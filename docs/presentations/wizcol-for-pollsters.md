---
marp: true
theme: default
paginate: true
title: WizCol — Deliberative Polling for the Modern Campaign
---

# WizCol
### Deliberative Polling for the Modern Campaign

**A 10× efficient alternative to traditional public-opinion research**

Prepared for: Survey & Polling Industry Partners
Co-developed with: CleanSweep Campaigns (US Market)

---

## The Problem with Traditional Polling

Traditional pollsters (Qualtrics, SurveyMonkey, geokg-style platforms) deliver **System-1 reactions** to **closed questions** designed by researchers.

| What you get | What you don't get |
|---|---|
| "56% support Measure A" | *Why* they support it |
| Demographic crosstabs | The proposal voters would actually rally around |
| Static snapshot | Cross-partisan common ground |
| 4–6 weeks, ~$30,000 | The *language* to build social license |

**A campaign needs to know what people will *agree on after thinking* — not what they reflex-answer in 90 seconds.**

---

## What WizCol Does Differently

WizCol is a **deliberative consensus platform**. Voters don't just pick from your options — they **propose, evaluate, and refine** ideas, while a calibrated math engine surfaces real common ground.

Three innovations on top of standard polling:

1. **Statistically-calibrated consensus scores** (not raw %)
2. **Real Voice harvesting** — voters submit their own proposals
3. **Negative-consensus detection** — finds the landmines a regular poll misses

All in **5 days, ~$2,800**, with structured *and* open-ended insight.

---

## Innovation #1 — The Consensus Formula

Traditional polls report `agree / total` as a percentage. WizCol uses a **statistically calibrated consensus score**:

> **C_p  =  μ_p  −  t_{α, n+k−1} · SEM\*_p**

- `μ_p` — mean sentiment on a −1 to +1 scale
- `t_{α, df}` — Student-t critical value (penalizes small samples)
- `SEM*_p` — standard error of the mean, **Bayesian-smoothed** with `k = 2` phantom prior votes

Result: a number in [−1, +1] that **automatically accounts for sample size and opinion diversity**.

📄 Source: `packages/shared-types/src/utils/consensusCalculation.ts`

---

## Why That Math Matters (For a Pollster)

| Scenario | Naive % | WizCol score |
|---|---|---|
| 3 of 3 voters agree | 100% ✅ | **+0.45** ⚠️ "promising, not conclusive" |
| 990 of 1000 voters agree | 99% ✅ | **+0.99** ✅ "real consensus" |
| 60 of 100 voters agree, but split passionately | 60% | **+0.18** ⚠️ "soft, polarized" |
| 60 of 100 voters agree, calmly aligned | 60% | **+0.42** ✅ "stable agreement" |

**You can't get this from a percentage.** A pollster who reports "60% support" treats both of the last two cases as identical — and one of them is a riot waiting to happen.

---

## Innovation #2 — Real Voice (Voters Become Co-Authors)

The Mass Consensus app lets respondents **submit their own proposals**, then evaluates them with the same math.

Flow:
1. Voter is recruited via SMS/MMS/QR/email link (no login)
2. Sees the question + 6 randomly shuffled options
3. Swipes to evaluate each (−1 to +1)
4. **Submits their own option** if none capture their view
5. Their option enters the pool for others to evaluate

📄 `apps/mass-consensus/` — Next.js, server-rendered, anonymous

This is how WizCol surfaces the **specific language** ("Cat Cafés," "Vacant Lot Sales") that a focus group would discover — but at a sample size pollsters can defend statistically.

---

## Innovation #3 — Semantic Clustering (No Free-Text Coders Needed)

When 500 voters write 500 short proposals, you'd normally hire grad students to code them.

WizCol uses **OpenAI text-embedding-3-small (1536-d)** + a custom **8-d rating vector** to cluster proposals automatically — by *meaning*, not keywords. As ratings accumulate, the similarity blend shifts:

| Evaluators | Text similarity | Rating similarity |
|---|---|---|
| 0  | 100% | 0% |
| 20 | ~57% | ~43% |
| 100+ | minority | majority |

📄 `functions/src/services/{embedding,vector-search,hybrid-vector}-service.ts`

Hebrew, Arabic, Spanish, English handled natively — critical for **bilingual / Latino-segment** deliberations.

---

## Innovation #4 — The Collaboration Index Map

The hardest question in polling: **"Where is there real cross-partisan common ground — and where is the dispute?"**

WizCol answers it with a **2D map**, plotting every proposal × every pair of demographic groups:

- **Y-axis — Agreement-on-Evaluation:** how aligned the two groups are in their evaluation
  > `agreementOnEvaluation = 1 − |mean_A − mean_B| / 2` &nbsp; (0 = poles apart, 1 = aligned)
- **X-axis — Direction:** what the two groups jointly think
  > `direction = (mean_A + mean_B) / 2` &nbsp; (−1 = both oppose, 0 = both neutral, +1 = both support)

| Where on the map | What it means | Campaign action |
|---|---|---|
| Bottom-right | United in support | 🟢 Lead with this |
| Bottom-left | United in rejection | 🟢 Don't waste effort defending |
| Bottom-center | United in indifference | 🟡 Low-priority issue — depoliticised |
| Top | Polarized — groups disagree | 🔴 Landmine; expect counter-mobilization |

📄 `packages/shared-types/src/utils/madCalculation.ts` (function `calculateAgreementOnEvaluation`)

---

## The Collaboration Index in Practice

| Group A vs. Group B | mean_A | mean_B | Agreement-on-Eval | Direction | Map position |
|---|---|---|---|---|---|
| Dems vs. Reps — Proposal X | +0.55 | +0.45 | **0.95** | +0.50 | Bottom-right ✅ united support |
| Dems vs. Reps — Proposal Y | +0.60 | −0.50 | **0.45** | +0.05 | Top ⚠️ polarized landmine |
| Dems vs. Reps — Proposal Z | −0.40 | −0.50 | **0.95** | −0.45 | Bottom-left ✅ united rejection |
| Latino vs. non-Latino — Q | +0.05 | +0.05 | **1.00** | +0.05 | Bottom-center 🟡 issue is dead |

**Plus MAD (Mean Absolute Deviation)** flags *within-group* fractures: a party can have a high mean but be internally split — MAD catches what a crosstab average hides.

K-anonymity built in: minimum segment size = 5 (`DEMOGRAPHIC_CONSTANTS.MIN_SEGMENT_SIZE`) — GDPR/CCPA-compliant cuts out of the box.

**For a pollster:** A 200-cell crosstab becomes one map. Hand the campaign a one-page where-they-stand picture instead of a 40-page deck.

---

## Innovation #5 — Negative-Consensus Detection

A traditional poll asks "Do you support X?" — opposition shows up only if you thought to ask.

WizCol's score is **two-sided** — a strongly negative `C_p` (e.g. **−0.58**) is a flashing red light: *the public has converged against this*.

> **Modesto, CA case (CleanSweep validation):**
> A "Pulse Check" deployment surfaced **58% active opposition** to a parking ordinance the incumbent was about to champion. A standard poll, scoped only to the campaign's preferred frame, would have missed it.

This is the **"insurance policy"** Dan Dimendberg's LOI references. A $2,800 pulse can prevent a 6-figure messaging mistake.

---

## Innovation #6 — Popperian Evidence Scoring

Voting alone reflects groupthink. WizCol layers on **evidence-quality scoring** inspired by Karl Popper's falsificationism:

- A refutation comment damages the score by up to **70%**
- A corroborating comment boosts by only **~6%**
- Floor / ceiling: [0.05, 0.95] — nothing is fully proven or dead

A proposal can have **high consensus but low evidence quality** — flagged as "well-liked but unsupported." This is data a campaign can act on: it's the proposal that *polls well now and collapses on first opposition mailer*.

📄 `functions/src/helpers/consensusValidCalculator.ts`

---

## Innovation #7 — Live Facilitation Mode

For town halls, council meetings, school-board forums: **organizer-led synchronized deliberation**.

- Organizer projects the question on screen
- All participants join `/m/{mainId}` on their phones
- Everyone is force-routed to the **same view** in real time (Firestore listeners)
- Live group evaluates options, then drills into top option's discussion thread

📄 `apps/join/src/lib/facilitator.ts` (current branch: `feat/join-facilitation-mode`)

**No traditional pollster offers this.** It's how WizCol bridges digital polling and physical retail politics.

---

## Side-by-Side: WizCol vs. Traditional Pollster

| Capability | Traditional (geokg-style) | **WizCol** |
|---|---|---|
| Output | % agree / disagree | Calibrated consensus score (−1, +1) |
| Sample-size adjustment | None (or footnote) | Built into every score |
| Open-ended responses | Manual coding, weeks | AI-clustered in real time |
| Voter-submitted proposals | No | **Yes — Real Voice** |
| Negative-consensus alerts | Only if you asked | Automatic |
| Cross-partisan common ground | Crosstab inference | **Collaboration Index map per pair of groups** |
| Within-group cohesion | Not reported | **MAD per segment** |
| Live group sessions | No | **Facilitation Mode** |
| Languages | Translate per project | 6 built-in (EN/HE/AR/ES/DE/NL) |
| Time to insight | 4–6 weeks | **3–5 days** |
| Typical cost (local race) | $25k–$40k | **~$2,800** |

---

## The Commercial Math (CleanSweep Pilot Modeling)

| District size | Recruit cost | Pulse Check total | Equivalent traditional poll |
|---|---|---|---|
| 2,500 voters (school board) | ~$400 | **$2,800** | $25,000 |
| 10,000 voters (city council) | ~$1,200 | **$5,500** | $30,000 |
| 50,000 voters (state assembly) | ~$6,000 | **$18,000** | $75,000+ |

**Revenue model:** 50% Platform / 50% Agency split — designed to scale across municipal and school-board races where traditional polling is *unaffordable*, leaving an entire market uncovered.

---

## What Survey Companies Should Take Away

1. **WizCol is not a SurveyMonkey replacement** — it's a new layer above your stack: deliberation + consensus, where you do measurement.
2. **The math is defensible** — t-distribution, Bayesian smoothing, published methodology (`docs/papers/confidence-agreement-paper.pdf`).
3. **The recruitment problem is solved** — CleanSweep handles voter-file outreach; the platform does deliberation.
4. **Partnership opportunity** — survey firms can resell WizCol Pulse Checks as a **premium "Message R&D"** product that complements (not cannibalizes) traditional tracking polls.
5. **Israeli Innovation Authority backing** validates the technology pipeline.

---

## Underlying Architecture (Brief, for Technical Diligence)

- **Monorepo**, 5 specialized apps + Cloud Functions (50+)
- **Mass Consensus** — Next.js 14 SSR, anonymous, optimized for 1000s of concurrent evaluators
- **Join** — Mithril.js, lightweight; designed for in-person facilitation
- **Sign** — consensus-driven document collaboration (paragraphs auto-add/remove based on `C_p` thresholds)
- **Admin** — survey config, analytics, demographic heatmaps
- **Shared types & i18n** — strong type discipline across all apps
- **Backed by**: Firebase (Firestore + Functions, region me-west1), OpenAI embeddings, Vector search

---

## Closing — The Pitch in One Sentence

> **WizCol does to political polling what continuous deployment did to software releases:**
> turn a 6-week, $30k batch process into a 5-day, $3k iterative one — while *also* producing better data, in the voters' own words, with cross-partisan consensus already mapped.

**Discussion / Q&A**

📧 Contact: tal.yaron@gmail.com
🔗 Pilot validation: CleanSweep Campaigns — Modesto, CA, April 2026
