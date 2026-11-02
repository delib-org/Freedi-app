# Split-sweep change: offline test, criteria fixed before running (2 November 2026)

**Candidate A, trigger:** remove `ALWAYS_SPLIT_ABOVE_LEAVES` (25); keep ≥8 leaves and ≥⅓ of placed. A floor on question size is examined descriptively; its value is not set here.

**Candidate B, judge:** coherence first. It decides whether the proposals form one area of concern; size is never a reason to divide. Prompt in `split_judge_test.mjs`.

**Control:** the compiled production `proposeThemeSplit`, on the same inputs.

**Each case runs 3 times per arm.** A "split" is a result with ≥2 sub-topics.

| # | Cases | Must hold for the candidate | Why |
|---|---|---|---|
| P1 | Benchmark: 2 or 3 true topics mixed (EN and HE, 20 per language) | Splits in ≥90% of runs | Must still catch real mixtures |
| P2 | Benchmark: one true topic (EN and HE, all 10 per language) | Keeps whole in ≥90% of runs | Must not divide a real topic |
| P3 | Bq-VQPMPiG7b's 60-member theme, the documented catch-all | Splits in 3 of 3 runs | The case splitting was built for |
| P4 | Her 5 merged topics (חזות הישוב, תרבות קהילתית, בינוי קהילה, שיח ציבורי, שיפור פני הכפר) | Keeps whole in ≥80% of runs | Her structure must be holdable |
| C1 | The 27 real historical split decisions | Control splits ≥90%, otherwise the reconstructed inputs are not valid | Validity check |

**Reported, no threshold:** candidate's verdict on the 21 Korazim and 6 other historical decisions, against how many of her topics each parent spans.

**Rules:** the candidate prompt is not changed after seeing results. If a criterion fails, it is reported as failed. Any revision is a separate, labelled round, and its result is weaker evidence because it has seen these cases. P4 uses the same single rater this whole study rests on, so passing it doesn't prove general validity.

**Known limits of the inputs:** P3's case holds 49 of the theme's 60 original members, the rest no longer resolve; titles are as they are today, not at decision time; the list of other themes is omitted for both arms; benchmark mixtures are artificial and its topics are cleanly separated.
