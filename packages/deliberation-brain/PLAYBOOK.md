# The WizCol playbook — how a process is composed

This is the source of truth the brain's patterns, engine cards and diagnosis are
written from. It comes from how WizCol processes are actually run (Hazorea,
Rotem), not from theory. Change this file first, then the code.

## 1. The tools and the one job each does

| Tool | Job | Shape | Use when |
|---|---|---|---|
| **Sign** (חתימות) | Public comment on a forming agreement. A draft exists; the public comments on and evaluates it paragraph by paragraph; gaps become visible. | Document · asynchronous · whole community | A text exists, or the outputs of an earlier stage have been turned into one. |
| **Mass Consensus** (הסכמת המונים) | Ask a question of hundreds. Suggest + rate, asynchronous, no facilitation. | Open question · asynchronous · hundreds | No draft yet — the community must generate the material first ("how do we live in peace with the dogs?"). |
| **Join** (הצטרפות) | Face-to-face convergence. A room of a few dozen forms agreed solutions around known gaps. | Live · facilitated · tens | The gaps are known and the group must *resolve* them together. Run one per audience segment. |
| **Draft** (טיוטה) | Turn the results of a stage into a proposal text. A strong model clusters the top suggestions, writes sections and paragraphs with provenance, and lists the open gaps; an admin reviews and edits freely, then opens it for comment. | AI + human review · hours | Material exists (MC / Join / Agora results, or Sign comments) and a text is needed for the next comment round. |
| **Main** (ראשית) | See everything, and decide. The analysis lens over every other tool — consensus index, cooperation index, mind map, clustering — and the formal vote. | Continuous for admins · everyone at the end | Always in the background; at the end for ratification. |
| **Agora** (האסיפה) | Meaningful asynchronous deliberation in large groups. | Experimental | Only for advanced users who opt in. Never in a default plan. |

## 2. The grammar

Every process is the same loop, entered at a different point:

```
GENERATE ──► DRAFT ──► COMMENT ──► CONVERGE ──► DRAFT(revise) ──► COMMENT ──► DECIDE
MC / Join     AI+review   Sign        Join × segments   AI+review     Sign        Main vote
```

Rules:

1. **Entry rule — what exists already?**
   - A text exists → enter at COMMENT (Sign).
   - Material exists but no text (survey results, session outputs) → enter at DRAFT.
   - Nothing exists → enter at GENERATE (Mass Consensus).
   The brain's first question is therefore "is there something written already?", not "how many people?".
2. **Writing is done by the Draft tool and approved by a human.** The plan names the step, schedules it when the source stage closes, and nudges the admin to review. Nothing reaches the public un-reviewed. The cutoff (top-N / above threshold) is the admin's choice, with a default.
3. **Comment before converging.** Sign precedes Join: the room works on the gaps the public exposed, never on a blank page.
4. **Segment the room** when the affected population has groups with different stakes (members / youth): one Join per segment, then merge in the next Draft.
5. **Second comment round after convergence.** The room's result goes back to everyone through Sign, in their own time, for last corrections. That is what gives the room's result legitimacy with those who were not there.
6. **Close with ratification.** Every process ends with DECIDE — an assembly or a vote in Main. Sign/MC results are inputs to the decision, not substitutes for it.
7. **Main is always watching.** Stage transitions are evidence-driven — the admin reads consensus / cooperation / clusters in Main to see whether gaps are identified or agreement is forming — not calendar-driven. A scheduled "review" is preferred to a blind "close".
8. **Iterate, don't lengthen.** When agreement is not forming, add another COMMENT → CONVERGE round rather than extending a stage.

## 3. Reference processes

**Draft-first agreement (Hazorea — professional teams).** A facilitator's draft →
Sign (public comment) → Join × 2 segments (members, youth) resolve the main gaps →
Draft(revise) → Sign (last corrections, everyone in their own time) → assembly / Main vote.
Applicability: a draft exists · the deciding body is the whole community · gaps are
expected to be substantive → a room is needed.

**Question-first agreement (Rotem — the dogs).** MC ("how do we live in peace with
the dogs?") → Draft from the top suggestions → Sign (comment) → Draft(revise) →
Main vote. Applicability: no draft · the problem is broad and needs the community's
own material first · a room is not required or not available.

**Bridging a contested issue.** MC framed around needs, not positions → Draft →
Sign → Join to converge on proposals both sides can live with → Draft(revise) →
Sign → ratify. Applicability: polarization contested/hostile.

Both reference processes share the spine: **Sign carries the agreement, Main carries
the decision.** MC and Join are the two ways of feeding the agreement — MC when
material is missing, Join when resolution is missing. Draft is the joint between
them.

## 4. Diagnosis fields the entry rule needs

`hasDraft` (text exists / material exists / nothing), `audienceSegments` (groups
with different stakes), `decisionBody` (assembly / council / vote in Main),
plus the existing decisionType, audienceSize, timeHorizonDays, polarization,
facilitationCapacity, desiredOutput.
