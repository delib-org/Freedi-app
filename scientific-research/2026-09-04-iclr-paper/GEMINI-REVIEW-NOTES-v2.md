# Accuracy check of the revised Gemini draft (v2, 12 pages)

Checked line by line against the production code (`functions/src/synthesis/`, `functions/src/services/`), the committed run artefacts under `scientific-research/`, and the public citation record. Round one is in `GEMINI-REVIEW-NOTES.md`.

**Verdict.** Most of round one was applied correctly, and the paper is much stronger: Pass 5 and theme creation are now right, the Hebrew figures are right, the hash is right, the legacy-production column no longer reports metrics nobody measured, the invented claims are gone, the LLM-only baseline is disclosed honestly, and a Limitations section exists. Three issues below are blocking. Nine are factual errors that remain. The rest are omissions worth filling, since the main text ends on page 8 of the 9 allowed.

---

## Blocking, fix before submission

**B1. The submission is no longer double-blind.** The reproducibility statement links `https://github.com/delib-org/Freedi-app`. That repository is public, is named after the authors' organisation, and carries a CITATION file and a licence naming them. Combined with §5.4 naming the Heschel Center for Sustainability as the data partner, a reviewer identifies the authors in one click. Replace with an anonymised mirror (`anonymous.4open.science` or similar, actually created and populated) or with "a repository link will be provided in the camera-ready". If the Heschel Center is named, it should be with the operator's agreement and after checking that it does not identify the team.

**B2. Fabricated author names in a citation.** The reference for Zheng et al. (2023) lists "Lingchen Mao", who is not an author, duplicates "Hao Zhang", and omits Ying Sheng, Zhanghao Wu and Zi Lin. The correct list is: Lianmin Zheng, Wei-Lin Chiang, Ying Sheng, Siyuan Zhuang, Zhanghao Wu, Yonghao Zhuang, Zi Lin, Zhuohan Li, Dacheng Li, Eric P. Xing, Hao Zhang, Joseph E. Gonzalez, Ion Stoica (NeurIPS 2023, Datasets and Benchmarks Track; arXiv:2306.05685). This matters twice over, because the AI-use statement asserts that "all citations were verified against original publication records". Either verify every reference by hand or remove that assertion. Check the page numbers on Zheng and Kellerhals too.

**B3. The reproducibility statement promises artefacts that are not published.** `scientific-research/2026-09-04-llm-only-baseline`, which §3.2's LLM-only result depends on, returns 404 on the public repository; it exists only in a local branch, along with the paper folder. The Heschel audit logs are published. Either push the missing folders before submission or narrow the claim to what is actually there.

---

## Factual errors that remain

**E1. "Unicode Verification: Script matches deliberation language, failing closed on drift" (§4.6).** Still wrong, and flagged in round one. The writer's output language is forced by detecting the script of the inputs and instructing the model; nothing fails closed. The reason it exists is worth a clause: unforced, 8 of 10 topic labels for an all-English corpus came back in Spanish or German, and because cluster titles are themselves embedded and reused as evidence, a wrong-language title corrupts retrieval rather than merely looking wrong.

**E2. Table 2, "Statements Left Open" row.** Both cells are wrong. Computed from the run artefacts: the first replay left 21 statements in no cluster and logged 30 review-queue events; the fixed build left 22 and logged 42 events. The 27 in the case study is a different accounting from an earlier export, and 42 is an event count, not a statement count. The label is wrong too: the blind audit found that only 2 of the 21 missed statements were in the review queue, which is exactly why "19 silent" appears one row below. Suggested fix: rename the row "Review-queue events" with 30 and 42, or "Statements in no cluster" with 21 and 22. Do not label either "queued for review".

**E3. "eliminating scope inflation from 4/50 to 0/50 in live testing" (§4.6).** Not live. That measurement is an offline A/B that drives the real compiled writer over the 50 ground-truth pairs. The live figure is different and also worth citing: 98 of 98 member intents preserved on a live benchmark run, and fidelity 0.953 on the real Heschel replay.

**E4. "Standard sentence encoders (Gao et al., 2021)" (§2).** Still miscited, and flagged in round one. SimCSE is a contrastive training method, not a standard encoder. Cite Reimers & Gurevych (2019) and MTEB (Muennighoff et al., 2023) here, and keep SimCSE where contrastive training is discussed.

**E5. Replay wall-clock presented as inference cost (Table 2 and §7).** "Replay Execution Latency 68 / 95 minutes", cited in Limitations as evidence of "inference cost asymmetry", is harness wall-clock dominated by settle-detection waits, not by model latency. The per-placement figures are the honest ones: 1–2 seconds per placement, 8–10 seconds when the writer is invoked, 2.85 calls per statement, about $0.2–0.5 per 1,000 statements, and a verdict-cache hit at about 45 ms against about 2.3 seconds for a completion.

**E6. reviewLowerBound under 3-large (§4.2).** "For 3-large, no separate review floor is defined, using the ANN search floor" reads as though the floor disappears. It does not: the large-model band set overrides only the attach, synthesis and cluster thresholds, so the review floor stays 0.45 in both configurations, and that floor *is* the ANN search threshold. Write "0.45 for both".

**E7. AI-use statement, model facts.** Brief distillation is listed as `gpt-4o-mini`; the current production worker is `gpt-5.6-luna`, with `gpt-4o-mini` the historical model used for the 875-triplet runs. Say which model each result used. (Table 1's per-row model labels are correct as written.)

**E8. AI-use statement, overclaim.** "All mathematical formulations, complexity analyses, and cohesion thresholds were derived and verified manually." The cohesion floor of 0.815 and the band values are empirical calibrations measured over 4,900 candidates, not derivations. Also, the statement still says only "an LLM was employed for drafting assistance"; ICLR expects the tool to be named, and this manuscript was drafted by Gemini.

**E9. Uncited reference.** Achille & Soatto (2018) appears in the reference list but nowhere in the text. Either cite it where the invariance framing is introduced in §2 or remove it.

**E10. §4.5 lost the registry's reason to exist.** The previous draft opened with it; this one starts at the mechanism. One sentence restores it: the cascade can only judge pairs that cosine surfaced, so two statements with the same meaning and distant embeddings are never compared, and no threshold closes that gap because the failing pair never becomes a candidate. Add that the registry is opt-in per question and off by default, since a reviewer will otherwise assume every reported number includes it. It did not: the Heschel replay ran with the registry off, which is why its near-verbatim missed duplicates are the strongest real-data evidence for it.

**E11. Appendix A, "EquivalenceJudge(s, S.anchor)".** The judge compares the arrival against the synthesis's own published text, not an "anchor", and "anchor" already means the verbatim exemplar in the registry. Write `S.text`.

---

## Omissions worth the remaining page

**O1. The list-scale result is missing, and it is the strongest argument in the paper.** The same judge that scores 95.0% against one candidate claim scores 36.0% to 55.8% under strict scoring against unconsolidated codebooks of about 94 claims, while "match attaches to some equivalent claim" stays at 89–93%. That single measurement is what justifies retrieval-then-judge over judge-everything, and it belongs both in §3.2 and as three rows in Table 1.

**O2. The incremental LLM-only baseline is missing, and its absence is a vulnerability.** §3.2 concludes that the challenge is "how to operationalize that reasoning in an incremental, low-latency, fail-closed streaming system". Our own incremental bare-LLM baseline was exactly that, and it scored higher than the pipeline: composite 0.937–0.984, synthesis F1 1.000, topic F1 0.844–0.960, over 101 calls per run at about $0.03. A reviewer with the repository will find it. Report it, and make the argument that actually survives it: its per-step prompt grows linearly with the number of live syntheses, so total cost is quadratic, and at a few thousand statements its prompts reach both the context ceiling and the list-scale regime of O1.

**O3. The design implication that follows.** Themes only organise the page and are not what participants agreed to, so they can be rebuilt in batch from the current syntheses in one cheap call, while syntheses cannot. That is the cleanest answer to why the batch baseline beats the pipeline on theming, and it is a contribution rather than a concession.

**O4. The cross-generator control.** A reviewer will object that the same team wrote the benchmark corpus and the prompts. The answer exists: an independent vendor's model authored a second corpus with harder geometry, where the best cosine-only F1 is 0.871, and the judged pipeline scored synthesis F1 0.980 with zero false merges, eleven points above that ceiling. One sentence in §5.3.

**O5. Table 1 needs one caveat.** The distractors were generated to defeat embeddings, not a model that reads the text. Distractors built against a judge, with buried negation, scope shifts, hedges or sarcasm, could score materially worse, so 95% is an upper bound of unknown tightness. Saying this costs nothing and pre-empts the obvious review comment.

**O6. Registry mechanisms still unstated.** Cosine survives inside the registry as a ranker that orders the codebook and filters nothing. Above thirty claims, classification routes through at most two topic claims, but any "none" triggers an ungated flat fallback: without that fallback, hard partitioning caused 59% of all recall loss in a corpus replay, and adding it moved accuracy from 61.3% to 75.3% (p = 7.5 × 10⁻⁴). Every consolidation merge is by construction a case where the registry said "new" and was wrong, so the running merge count is an online estimate of its own recall error.

**O7. Related work gaps.** LLM-guided clustering is the nearest neighbour to this work and is absent: Viswanathan et al. (2024), Zhang et al. (2023), Pham et al. (2024), Wan et al. (2024). Also missing: lost-in-the-middle (Liu et al., 2024), which supports O1; prompt sensitivity (Sclar et al., 2024); non-determinism at temperature zero (Atil et al., 2024); and retrieve-then-rerank (Nogueira & Cho, 2019; Lewis et al., 2020), the architectural relative worth distinguishing from, since our reranker returns a typed relation rather than a score and ranks against a growing codebook rather than the corpus.

**O8. Limitations, one more item.** The benchmark corpora are partly synthetic, and Blair et al.'s natural-data numbers of 65–69% suggest most real pairs are easy while the hard tail is what the architecture exists for. That framing strengthens the 74% rather than weakening it.

---

## Confirmed correct in this revision

Pass 5 and theme creation from syntheses, including the Appendix A flow. Hebrew separability, 56/100 under 3-small and 88–89/100 under 3-large. Band values including the 0.815 centroid floor and the 0.78 quorum floor. SHA-1, order-independent, versioned by model and prompt, fallbacks never cached. The four-way rubric and the writer rubric, which now match the shipped text. "Replayed" rather than "deployed". The legacy-production column marked not measured. Auditors described by family without an invented version. Pilot-150 leading with the enriched regression, 92.0% to 79.7% at p = 2.8 × 10⁻⁴, the stance-qualifier cause, the partial recovery to 82.7%, and the token-headroom fix. Live benchmark composite 0.884–0.910 English and about 0.930 Hebrew with synthesis F1 0.947 and 45 of 50 pairs. Heschel numbers 65% to 74.4%, 0.647 to 0.953, and the three fixes. The single-vendor limitation, correctly noting that the file named `gemini.ts` delegates to OpenAI. McNemar p ≈ 10⁻²⁴⁹. The embedding-gate baseline tying at 95.0%.
