# Corrections for the Gemini draft "Geometry Proposes, Judgement Disposes: Online Proposal Aggregation for Deliberative AI" (12-page PDF, 2026-09-04)

Every item below was checked against the production code (`functions/src/synthesis/`, `functions/src/services/`) and the committed run artefacts under `scientific-research/`. Items are grouped by what they require: correct, delete, add, or comply. Where a correct value exists it is given with its source.

---

## A. Factual errors to correct

1. **Pass 5 and how themes are created (§4.3, Appendix A).** The draft says Pass 5 is "permanently disabled" and never says how new themes come into being, so a reader cannot see where themes come from. Correct statement: new themes are born only from syntheses. When Pass 2 spawns a synthesis, the theme judge is asked which existing theme it belongs to; if the answer is NONE and the per-question setting `createThemesFromSyntheses` is on (default: on), a new theme is created around that synthesis with a generated label (`nestSynthUnderTopic` → `createThemeForSynth` in `nestSynthesis.ts`). A plain statement can only be filed into an existing theme (Pass 3). Pass 5, theme creation from a pair of raw statements on cosine evidence, is off by default because it produced four near-duplicate headings in one run. Add this to §4.3 and to Appendix A (step 5 should read "SpawnSynthesis({s,u}); NestUnderTheme(S) creating a theme if none fits").

2. **Hebrew nearest-neighbour figure (§3.2).** "100/100 English and 88/100 Hebrew" mixes two embedding models. Under the production model `text-embedding-3-small` the paraphrase twin is the nearest neighbour for 100/100 English and only 56/100 Hebrew statements; 88–89/100 Hebrew is under `text-embedding-3-large`. State both, because the gap is the reason for the per-question model pin. Source: `2026-08-18-live-synth-accuracy/README.md`, pre-flight table.

3. **reviewLowerBound for 3-large (§4.2).** "0.45 / 0.55" is wrong. The large-model band set defines only attach 0.86, synthesis 0.80 and cluster 0.75 (`LARGE_MODEL_BANDS` in `types.ts`); the review floor stays 0.45 for both. Delete 0.55.

4. **Verdict cache hash (§4.4).** Not SHA-256. Verdicts are keyed by SHA-1 of the normalised texts, combined order-independently (`textHash.ts`), and the cache is versioned by model id and prompt version; fallback verdicts produced by a failed call are never written. Add the versioning and the never-cache-fallbacks rule; they are the point of the cache, not details.

5. **"The pipeline was deployed on 114 authentic Hebrew statements" (§5.4).** It was not deployed on them. The question was exported read-only from production and replayed on a local emulator, twice. The three fixes were later deployed to production (2026-08-25), but the question itself has not been migrated to the new configuration as of the last record. Write "replayed", not "deployed", and say the migration is pending.

6. **Auditor model (§5.4, AI-use statement).** "Anthropic Claude 3.5 Sonnet" is invented. The audit artefacts (`runs/bq-replay-*/verification/*.json`) record Claude-family agents and no version. Write "Claude-family models" or, better, say the version is not recorded and treat that as a limitation.

7. **Legacy-production column of Table 2 (§5.4).** No blind audit was ever run on production's structure, so "precision ≈ 8.3% (2/24)", "22 unrepresented voices", "fabricated commitments: broad drift" and "14 silent missed merges" are not measurements. What is documented: production had one 59-statement flat theme, one 24-statement "synthesis" of which only 2 statements proposed the periodic forum it was named after, a third theme restating the question, and 14 statements unplaced with no flag. Report those as observations from the case study, and put "not audited" in the audited-metric rows.

8. **"9 refused / 6 queued" (Table 2).** The six were not queued for review; they were pairs that awaited further sweep rounds (the harness ran about four; production sweeps every ten minutes). Write "awaiting sweep".

9. **Scope rule (§4.6).** `Scope(S_synth) ⊆ Scope(s_A) ∩ Scope(s_B)` is wrong as written: a synthesis must cover both inputs, so the rule is that the synthesis never widens beyond what the inputs say (no new scope beyond their union, every input's ask still visible). Also "0/98 scope inflations in production audits" conflates two measurements: scope inflation went 4/50 → 0/50 on the benchmark pairs after the rule, and 98/98 member intents were preserved on live benchmark runs. On the real production replay the fidelity was 0.953 with two weakened asks. Report each number with its own instrument.

10. **"Unicode Verification … failing closed on drift" (§4.6).** The output language is forced by detecting the inputs' script and instructing the writer; it is not a fail-closed check. The reason it exists: unforced, 8 of 10 topic labels for an all-English corpus came back in Spanish or German, and because titles are embedded and reused as evidence, a wrong-language title is a retrieval corruption. Say that.

11. **Brief distillation (§4.1).** "Embeddings are generated exclusively from this brief" is too strong: embedding the brief is gated by a setting (`EMBEDDING_USE_BRIEF`, default on) and applies to statements of 40 characters or more. Say "by default".

12. **Cohesion gate purpose (§4.2).** "To permanently eliminate snowball collapse" overclaims: snowballing recurred on real data (an 8-member synthesis with 6 wrong members) and was stopped only by the later farthest-pair transitivity check on the sweep, which the draft itself reports in §5.4. Write "to brake".

13. **"Resolved by our exemplar-anchored architecture" (§5.1) and "verbatim exemplars retain uncompressed semantic ground truth" (§4.5).** Overclaims. The production codebook line (canonical + explanation + exemplar, with the stance caution) scores 88.6%, not 95%; the 95.0% condition uses the raw anchor as the claim text. After the model upgrade the enriched configuration fell to 79.7% (82.7% after a prompt fix) while raw-anchor classification stayed at 96.7–98.0%. The correct statement: compression loss is only partly recovered by enrichment, so the robust configuration keeps canonical wordings for display and weights the verbatim exemplar as the operative matching text. Source: `20206-07-16-Claim-regestry/benchmark/PILOT150-RESULTS.md`.

14. **Appendix C.** "In the all-judged build, the transitivity check on merge sweeps and the revisit pass ensured…" — those two mechanisms are in the *fixed* build, not the initial all-judged build. Also add that this replay ran with the claim registry off (its default), and that the near-verbatim duplicates it missed are the first real-data confirmation of the registry's motivation.

15. **Related-work citation (§2).** "Standard sentence embeddings (Gao et al., 2021)" cites SimCSE, a contrastive method, for "standard embeddings". Cite Reimers & Gurevych 2019 and the MTEB benchmark (Muennighoff et al., 2023) instead, and keep SimCSE where contrastive training is discussed.

## B. Invented claims to delete or mark as hypotheses

16. **"Exceeding sub-3-second SLAs at N = 5" (§3.1).** Never measured. The three-second figure in our records is the deadline for pre-computing the embedding in the trigger, not a placement SLA. Delete.

17. **"Order dependence" of a bare LLM (§3.1 item 3).** Our own LLM-only baseline contradicts this on the clean corpus: one-shot batch and incremental bare-model runs produced the identical synthesis partition across three arrival orders (cross-seed ARI 1.000), the same partition the pipeline produces. Delete the claim or restrict it to the theming layer. Source: `2026-09-04-llm-only-baseline/RESULTS.md`.

18. **"Sycophantic bias … artificial compromises" (§3.1 item 3).** Not measured anywhere in our work. Delete, or state explicitly as an untested hypothesis.

19. **"Reduces LLM judge invocation by 40%–60%" (§6).** Invented. What exists is a prediction with one supporting number: judge cost measured 3.7× higher on long candidate lists than on short ones, so a better ranker should cut it "by a large factor". Say that, as a prediction.

20. **"O(1) amortized retrieval" (abstract).** Approximate nearest-neighbour search is sub-linear, not O(1). Write "sub-linear ANN retrieval".

21. **"Institutional consent" (ethics statement).** Not documented in our records. Write what is documented: a read-only export of the platform operator's own production data, with no personally identifying information and no statements quoted. Confirm the consent wording with the platform operator before submission.

22. **Anonymous repository URL (reproducibility statement).** `https://anonymous.4open.science/r/deliberation-aggregation-ICLR27` does not exist. Either create it and populate it before submission or replace with "a link will be provided in the camera-ready". Also "Appendices A–D": only A–C exist.

23. **Appendix B rubric quotes.** The quoted P1 rubric ("exact same lever and mechanism", "DIFFERENT (different topics)") is not the shipped text. Quote the shipped rubric or label the block "paraphrased". The shipped definitions: same = paraphrases of essentially the same proposal, authors would agree they meant the same thing; related = same topic, different actions, stances or magnitudes; different = about different things, wording similar by coincidence; opposite = contradictory actions on the same subject; use same only when interchangeable; when in doubt between same and related prefer related. Full abridged rubrics are in Appendix B of the internal draft (`paper.tex`).

## C. Omissions reviewers will flag

24. **The LLM-only baseline result.** The paper's thesis is that a bare LLM fails, yet on the clean 100-statement corpus a bare model matched the pipeline's synthesis layer exactly (F1 1.000, 50/50 pairs, 0 false merges, 9 runs, $0.18) and beat it on theming (topic F1 0.80–0.96 vs 0.71–0.78). This must be reported. It reframes the pipeline's justification as operational (streaming order-stability, O(k) tokens per arrival instead of O(n), robustness on hard real pairs, bounded and cached spend) rather than per-decision accuracy, and it motivates a design change: rebuild themes in batch from syntheses. Source: `2026-09-04-llm-only-baseline/RESULTS.md`.

25. **The evidence that actually supports §3.1.** Replace the invented items with the measured ones: (a) list-scale degradation, the same judge falls from 95.0% to 36–56% under strict scoring against ~94-claim codebooks (match-to-any-claim stays 89–93%); (b) the canonicalisation regression across model generations (item 13); (c) the looping judge: a sweep asked to find merge groups in a settled, correct set of ten headings proposed a wrong merge in one of two samples, and production asks ~144 times a day, hence judge-once fingerprints; (d) silent failure: 260 of the first 456 classifications in one run were fail-closed outages indistinguishable from honest "new" verdicts, and reasoning models exhaust completion caps on hidden tokens; (e) prompt sensitivity: 36% vs 79% triplet accuracy with the architecture fixed; (f) the spend incident, ~3,100 completions/day on untouched questions until budgets were billed on cache misses.

26. **Table 1 is missing two rows that change its reading.** The embedding-gate-then-judge baseline ties the registry at 95.0% with 0 matches lost at the gate, which shows the headline gain is the judge's and the registry's value is cold start, the maintained codebook and a narrow cross-lingual recall gap (6/125 Hebrew pairs). And the codebook-scale rows (36.0%, 53.8%, 55.8%). Add the caveat that the distractors were built to defeat embeddings, not a reader, so 95% is an upper bound of unknown tightness.

27. **Pilot-150's main finding (§5.2).** The section reports the token-headroom fix but omits the significant regression of the enriched condition (92.0% → 79.7%, p = 2.8×10⁻⁴) and its cause (stance qualifiers dropped by the new model's canonicalisation). That is the result; the headroom fix is the footnote.

28. **Live benchmark (§5.3).** Missing: the composite score and its range (0.884–0.910 over three seeds), the Hebrew results (≈0.93, precision 1.000, 45/50, ten themes for a true ten), the arc from 0.067 (the topic black hole: one cluster absorbed all 100 statements while coverage read 100/100), and the cross-generator test (independent vendor's corpus: synthesis F1 0.980, 0 false merges, 11 points above the cosine-only ceiling).

29. **Real-data section (§5.4).** Missing: the first-replay recall finding (11 missed attaches + 5 missed spawn pairs, 19 of 21 silent), the residual error profile after the fixes (precision now fails at the spawn writer, 9 wrong pairs of 25 spawns on "related" Hebrew pairs; recall at judge refusals and sweep budget), and the statement that the 74% is the number to quote instead of the benchmark's 100%. The abstract's "confirming robust operational viability" should be softened accordingly; the audit itself says it is not a clean bill of health.

30. **Cost and latency.** No numbers in the draft. Add: ≈$0.11 per 1,000 registry classifications at small codebooks, ≈$0.41 at ~100 claims; 2.85 calls per statement in corpus replay, ≈$0.2–0.5 per 1,000 statements; 1–2 s per placement, 8–10 s with the writer; cache hit ≈45 ms vs ≈2.3 s per completion.

31. **A Limitations section.** None exists. Reviewers expect one. Content: partly synthetic benchmarks and the 74% real-data precision; theming as the open front; all LLM components from one vendor's family (the equivalence judge, the writer and the canonicaliser all run on OpenAI models; the "Gemini" wrapper in the code delegates to OpenAI), so the 5% cross-model audit estimates drift but not family-correlated bias; English and Hebrew only; no fixed token budget in the cost comparison.

32. **Related work on LLM judging and LLM clustering.** Position bias and long-context degradation (Liu et al., 2024; Wang et al., 2023), judge reliability (Zheng et al., 2023), prompt sensitivity (Sclar et al., 2024), non-determinism (Atil et al., 2024), LLM-guided clustering (Viswanathan et al., 2024; Zhang et al., 2023; Pham et al., 2024), retrieve-then-rerank (Nogueira & Cho, 2019). These are what the architecture's judge-once fingerprints, short ranked lists and upgrade regression tests answer.

33. **The claim registry (§4.5).** Missing: it is opt-in per question and off by default (the judged cascade is the default); cosine is demoted to a ranker that orders the codebook and filters nothing; hierarchical routing above 30 claims with an ungated flat fallback (without the fallback, hard partitioning caused 59% of recall loss; adding it moved 61.3% → 75.3%, p = 7.5×10⁻⁴); the self-audit counter (every consolidation merge is an observed false "new"); the 5% shadow audit; and that a matched claim must be confirmed only after ≥3 members *and* surviving a consolidation pass untouched.

## D. ICLR 2027 compliance and template

34. **AI-use statement.** Must disclose that the manuscript itself was drafted by Gemini (the draft says "an LLM"; name it). Correct the model facts: brief distillation and classification run on the production worker model `gpt-5.6-luna` (previously `gpt-4o-mini`); the equivalence judge runs on the same OpenAI fast model despite the wrapper's name; the auditors' version is not recorded. Remove the claim that "all mathematical derivations … cohesion bounds were manually derived and verified line-by-line" unless the human authors have actually done so; equation (4) and the cohesion floors are empirical calibrations, not derivations.

35. **Author block.** The submission is double-blind; keep it anonymous, but the source must carry the four authors for the camera-ready: Tal Yaron (Freedi), Nimrod Talmon (BGU), Erel Segal-Halevi (Ariel), Fany Yuval (BGU).

36. **Page budget.** The main text is 8 pages, inside the 9-page limit, so there is room for items 24–33. Ethics, reproducibility and AI-use statements do not count toward the limit.

37. **Title.** "Online Proposal Aggregation for Deliberative AI" reads as if the system is an AI that deliberates. The internal draft uses "Engineering Online Claim Aggregation for Live Deliberation"; either is fine, but "deliberative AI" is not what the paper is about.

## E. Style

38. Prefer plain statements over coined jargon ("topological stability", "sovereign public proposals", "attention degradation", "convex hull"). Each of these can be said in ordinary words, and reviewers read coined terms as padding.

39. Put the new information at the end of the sentence and the known information at the start; keep subject and verb together; one point per sentence. The internal draft (`paper.tex` in this folder) was rewritten on those rules and can serve as the wording reference for every section above.
