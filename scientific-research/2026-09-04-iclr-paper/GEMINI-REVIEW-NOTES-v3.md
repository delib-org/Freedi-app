# Accuracy check of the third Gemini draft (v3, 13 pages)

Checked against the production code, the committed run artefacts, and the public citation record. Rounds one and two are in `GEMINI-REVIEW-NOTES.md` and `-v2.md`.

**Verdict.** Yes, it is better, and substantially. Every blocking issue from round two is resolved and every one of the eleven factual errors is fixed correctly. All eight omissions were added, and the new material is accurate where I could check it. Three things still stand between this draft and submission, and one of them is a repeat of a pattern that has now appeared twice.

---

## Blocking

**B1. Three of the newly added citations are fabricated, and the paper now asserts that they were verified.** Each round, the model fixes the citations I name and invents new ones in the references it adds. Verified against the ACL Anthology, the ICLR proceedings and TACL:

| As printed | What is actually true |
|---|---|
| Sclar et al., "Quantifying extreme variability in LLM evaluation", ICLR 2024, with eight authors including Yizhong Wang, Sachin Kumar, Alisa Liu, Peter West, Sean Welleck, Noah A. Smith | Title is *"Quantifying Language Models' Sensitivity to Spurious Features in Prompt Design or: How I learned to start worrying about prompt formatting"*. Authors are Melanie Sclar, Yejin Choi, Yulia Tsvetkov, Alane Suhr. Six of the eight printed names are not on the paper. |
| Zhang, Agarwal & McAuley, "Large language models as zero-shot clusterers", EMNLP 2023 | Title is *"ClusterLLM: Large Language Models as a Guide for Text Clustering"*. Authors are Yuwei Zhang, Zihan Wang, Jingbo Shang. Sanchit Agarwal and Julian McAuley are not authors. Pages 13903–13920. |
| Viswanathan et al., "Large language models for automated data clustering", Findings of ACL 2024 | Title is *"Large Language Models Enable Few-Shot Clustering"*. Venue is TACL, volume 12, pages 321–333, 2024. The author list is correct. |

The AI-use statement now says "Citations and author lists were verified against official conference proceedings (e.g., NeurIPS, ICML, EMNLP) and arXiv records." That sentence is false as the draft stands, and a reviewer who checks one reference and finds an invented author will distrust the empirical sections too. The fix is procedural, not editorial: **the model must not author any further reference entries.** Supply the bib entries yourself, or take them from `references.bib` in this folder, which was checked. Then re-verify the full list once by hand.

**B2. A fabricated number in Table 1.** The row "Unconsolidated Codebook (≈ 94 claims), Any Equiv. Claim — 89.1%–93.4%" does not correspond to any measurement. The actual match-to-any-claim figures across the four codebook conditions are 74.4% (bare canonicals), 92.9% (enriched), 89.8% (enriched with stance caution) and 92.2% (two-hop with flat fallback). The correct range is 74.4%–92.9%, or 89.8%–92.9% if the row is restricted to the enriched conditions, which should then be said.

**B3. The list-scale result is overstated, and our own source report says so.** §3.2 and §5.1 present the 36.0%–55.8% strict figure as proof that "retrieval gating is essential" and attribute it to "attention dispersion and context-length degradation". The benchmark report that produced those numbers reaches a narrower conclusion: the benchmark codebook gives every anchor its own claim and never runs production's consolidation pass, so it contains many word-for-word equivalent claims, and about a third of the matches attach to one of those legitimate near-duplicates rather than to the anchor's own claim. That is why match-to-any stays at 74–93% while strict accuracy falls. The honest sentence is that list scale costs recall of the *specific* claim, that the strict number is partly an artifact of an unconsolidated codebook, and that the false-attach rate does *not* rise with list length (10.3% at 94 claims against 12.8% at one claim). The argument for retrieval gating survives this on token cost and codebook growth; it does not need the stronger version, and a reviewer with the repository will find the caveat.

---

## Smaller corrections

**S1. Anonymisation introduced a factual error.** §5.4 now reads "a municipal sustainability deliberation". The Heschel Center is a sustainability institute, not a municipality, and the participants were researchers rather than residents. Write "a deliberation convened by a sustainability research institute" or simply "an environmental research deliberation".

**S2. Table 2, "Review-Queue Events Logged", legacy production cell.** The draft prints 0. Nobody instrumented the production run, and the older pipeline logged no such events for us to count. Print an em dash or "not measured", consistent with the rest of that column.

**S3. §5.4 does not say the claim registry was off.** §4.5 correctly states the registry is opt-in and ships default-off, and the real-data replay ran without it. Without one clause saying so, a reader assumes the 74.4% includes the registry. It does not, which also means the near-verbatim duplicates the sweepers found are the strongest available evidence for the registry rather than a failure of it.

**S4. §4.5 item 2 packs two protocols into one numbered item, and the sentence is broken.** "Rewordings are classified ({reword, broaden, narrow, different}) after two consecutive broadenings, wording is tested against founding anchor" is missing a stop after the brace, so it reads as one clause. Split the broaden ratchet and hierarchical routing into separate items.

**S5. One registry mechanism is still unstated.** Inside the registry, cosine survives as a *ranker*: it orders the codebook most-plausible-first so likely matches appear early, and filters nothing. That is one sentence, it connects directly to the Liu et al. citation the paper now carries, and it completes the "geometry proposes" claim at the registry layer.

**S6. Supplementary material.** The reproducibility statement now promises the harnesses and audit logs "in the supplementary material". That is the right fix, but the archive has to be built and uploaded at submission time; the LLM-only baseline folder in particular exists only on a local branch.

---

## Confirmed fixed in this revision

Double-blind restored: the de-anonymising repository link is gone and the Heschel Center is no longer named. The Zheng et al. author list is now correct. Unicode enforcement is described accurately, with the right reason. Table 2 now has separate, correct rows for statements in no cluster (14 / 21 / 22) and review-queue events (30 / 42), both matching the run artefacts. The scope figure is labelled as offline A/B and paired with the live 98/98. SimCSE is cited as a contrastive method and Reimers & Gurevych plus MTEB carry the standard-encoder claim. Achille & Soatto is now cited in text. The review floor reads 0.45 for both models. Replay wall-clock is gone from the cost argument and replaced with real per-placement figures. The registry section opens with the recall gap and states that it is opt-in and default-off. The hierarchical fallback, the self-audit counter, the cross-generator control, the incremental LLM-only baseline, the batch-theming design implication, the distractor-construction caveat and the synthetic-distribution limitation are all present and correct. Gemini is named in the AI-use statement, and the model attributions distinguish historical from current production. Appendix A reads `S.text`. Main text ends within the nine-page limit.
