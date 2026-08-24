# Distance, Alignment, Convergence — a short methods report

**Project:** Israeli Odyssey → Agora civic game (Freedi) · **Date:** 2026-08-24
**Scope:** (1) how party stands were constructed; (2) how they are evaluated against a player's preferences; (3) how "coming closer" is measured in the Agora.
**Full method report:** `REPORT.md` (same folder). **Metric spec:** `apps/agora/docs/opinion-distance-and-map.md`.

---

## 1 · Constructing the party stands

The unit of measurement is the **individual statement (היגד)**, not the issue: each of Israel's 11 Knesset parties received a continuous score **e_p(s) ∈ [−1, +1]** on each of 48 deliberative statements (12 topics × 4), where −1 = strongly opposes and +1 = strongly supports the *exact wording*, qualifiers included.

Scores were estimated from the public record under a strict **evidence hierarchy**: recorded Knesset votes ≻ official platforms ≻ leader statements attributable to the party line ≻ governing behavior (budgets executed vs. rhetoric) ≻ flagged ideological inference. Research ran as **one web-search agent per topic** (Hebrew sources, 2022–2026, recency-weighted), each returning per-cell score + confidence (high/medium/low) + rationale + citations under a fixed JSON contract. When no published position exists, the cell is estimated from the party's general ideology and flagged `inferred` (forced low confidence) rather than silently zeroed — full coverage keeps low-documentation parties from biasing their own distances.

A validator enforces range, coverage, and the citation/inference invariants; the dataset then passes a **human review gate** (auditable per-cell review sheets) before production. Result: 528/528 cells, 592 citations, confidence high 41% / medium 40% / low 19%, 18% inferred; only 13.6% of scores are at the ±1 extremes, versus 100% under the previous one-declared-stance model.

## 2 · Evaluating party stands against a player's preferences

Playing the game *is* the player's measurement: on each statement the player marks support (+1), can-live-with (+0.5) or oppose (−1) — ordinary Freedi evaluations. Player and party thus occupy the same space, and one metric serves both comparisons:

> **d(a, b) = mean over shared statements of |e_a(s) − e_b(s)| / 2  ∈ [0, 1]**

0 = identical routes, 1 = maximally opposed. Parties enter as *virtual users* via their researched attitude maps; the same formula runs player↔party and player↔player. A minimum-overlap rule guards against noise (a player-pair distance needs ≥5 shared statements; a party ship reacts from the first shared island). Because the comparison is statement-level, distance is not a bloc tautology — cross-cutting topics (e.g., direct family aid, where all 11 parties score positive) let a player be near one party on economics and far from it on religion & state.

Presentation follows two honesty rules. Proximity bands ("close to your route / midway / drifting away") display the scalar with the caveat that closeness is *temporary anchoring, not a voting instruction*. The 2-D opinion map embeds all pairwise distances by classical MDS and **hides itself when unfaithful**: fidelity (Pearson r between true and drawn distances, plus stress and variance-explained) is always computed, and the map only renders when r ≥ 0.8.

## 3 · Measuring "coming closer" in the Agora

When island deliberations open onto the Agora, the event scores itself on whether the room actually converged — using the *same* distance metric, so game and event cannot disagree about the same people.

- **Baseline.** On entering the square, each participant's current statement evaluations are snapshotted (`stanceBaseline`). The snapshot is essential: the closing re-rate overwrites the same evaluation documents, destroying the before-picture otherwise.
- **Re-rate.** At closing, participants restate where they now stand on the island's statements; these are written back as ordinary evaluations (so the Odyssey map immediately reflects the deliberation) and convergence is recomputed.
- **Estimator.** Mean pairwise distance before (D̄_before) and after (D̄_after), computed **over the identical set of participants and the identical set of pairs**: anyone missing either half is dropped from *both* means, and a pair counts in both or in neither. This is the anti-attrition guard — a room that merely emptied of dissenters cannot report convergence. Overlap floor per island: min(3, statement count), since the voyage-wide floor of 5 is unreachable on a 4-statement island.

> **Convergence = (D̄_before − D̄_after) / D̄_before × 100**

— the percent of the room's initial disagreement that closed. The score is deliberately **signed** (a deliberation that polarized the room reports negative), and a room that began in perfect agreement scores 0 rather than dividing by zero. The estimator is covered by unit tests and a 26-check end-to-end suite (baseline preserved, same-population rule, positive-score path, answers landing back on the island).

## 4 · Validity notes

Party stands are single-coder LLM estimates pending human review; a second-model disagreement pass is the recommended next step. Convergence measures *movement of stated positions*, not their quality — social-desirability pressure at the closing re-rate is an acknowledged threat, partly mitigated by re-rates being ordinary private evaluations rather than public declarations. Both instruments are dated (2026-08-24) and the party dataset carries a standing re-estimation protocol for new statements and post-event drift.

## 5 · Appendix — all statements and party scores

Scores −1 (opposes) … +1 (supports); `*` = ideology-inferred (low confidence).

### האחריות — מה הדרך הנכונה לברר אחריות על כשלי 7 באוקטובר?

1. ועדת חקירה ממלכתית בהקדם, גם בזמן מלחמה
2. ועדת חקירה ממלכתית לאחר תום המלחמה
3. בדיקות פנימיות בכל מערכת, ורק אחר כך הכרעה על ועדה
4. להתמקד כעת בניצחון ובשיקום

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -1 | -0.5 | +0.7 | +0.9 |
| יש עתיד | +1 | -0.3 | -0.8 | -0.9 |
| המחנה הממלכתי | +0.9 | 0 | -0.5 | -0.7 |
| הציונות הדתית | -1 | -0.8 | +0.6 | +0.7* |
| ש״ס | -0.4 | +0.3 | +0.5 | +0.4 |
| יהדות התורה | -0.4 | +0.2 | +0.5 | +0.2* |
| ישראל ביתנו | +0.9 | -0.3 | -0.8 | -0.8 |
| עוצמה יהודית | -1 | -0.7 | +0.5 | +0.8* |
| רע״ם | +0.6* | +0.1* | -0.5* | -0.6* |
| חד״ש-תע״ל | +0.8 | -0.3* | -0.8* | -1* |
| המחנה הדמוקרטי | +1 | -0.4 | -0.8 | -0.9 |

### שלטון החוק — איזה כוח צריך להיות לבית המשפט העליון מול הממשלה והכנסת?

1. כוח משמעותי לבלום חקיקה, כולל חוקי יסוד, אם היא פוגעת בזכויות יסוד או בכללי המשחק הדמוקרטיים
2. כוח ביקורת קיים, אך עם ריסון עצמי גבוה יותר והגדרת גבולות ברורה יותר
3. צמצום משמעותי של כוח בית המשפט לבטל הכרעות רוב של הכנסת והממשלה
4. שינוי יסודי במערכת המשפט, כולל פסקת התגברות רחבה ושליטה פוליטית במינוי שופטים

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.9 | -0.4 | +0.9 | +0.8 |
| יש עתיד | +0.7 | +0.2 | -0.9 | -1 |
| המחנה הממלכתי | +0.4 | +0.7 | -0.7 | -0.9 |
| הציונות הדתית | -1 | -0.8 | +0.9 | +1 |
| ש״ס | -0.9 | -0.5 | +0.9 | +0.9 |
| יהדות התורה | -1 | -0.6 | +0.8 | +0.8 |
| ישראל ביתנו | -0.2 | +0.6 | -0.4 | -0.7 |
| עוצמה יהודית | -1 | -0.9 | +1 | +1 |
| רע״ם | +0.4 | +0.5 | -0.7 | -0.9 |
| חד״ש-תע״ל | +0.5 | 0* | -0.8 | -1 |
| המחנה הדמוקרטי | +1 | -0.2 | -1 | -1 |

### ניקיון הכפיים — כיצד להתייחס למנהיגים הנאשמים בעבירות חמורות לפני הרשעה סופית?

1. פסילה מכהונה ציבורית עד לסיום ההליך המשפטי
2. כהונה עם מגבלות ברורות על סמכויות ומינויים
3. הכרעת הציבור בבחירות היא ההכרעה היחידה הנדרשת
4. מדובר בחשש מרדיפה פוליטית – אין למנוע כהונה

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.95 | -0.8 | +0.9 | +0.95 |
| יש עתיד | +0.8 | +0.3 | -0.8 | -0.9 |
| המחנה הממלכתי | +0.4 | +0.6 | -0.6 | -0.8 |
| הציונות הדתית | -0.9 | -0.8 | +0.8 | +0.9 |
| ש״ס | -1 | -0.8 | +0.9 | +0.8 |
| יהדות התורה | -0.7 | -0.5 | +0.5 | +0.3* |
| ישראל ביתנו | +0.9 | +0.2 | -0.8 | -0.9 |
| עוצמה יהודית | -1 | -0.9 | +0.8 | +1 |
| רע״ם | +0.2* | +0.4* | -0.4* | -0.5* |
| חד״ש-תע״ל | +0.7 | 0* | -0.8 | -0.9 |
| המחנה הדמוקרטי | +1 | -0.2 | -0.9 | -1 |

### הבית המדיני — מה היעד הרצוי בטווח ארוך ביחס לעזה, יהודה ושומרון והפלסטינים?

1. סיפוח והחלת ריבונות ישראלית
2. ניהול הסכסוך ושמירת המצב הקיים
3. הפרדה מדינית והיערכות לקראת שתי מדינות
4. הסדר במסגרת אזורית רחבה או אפשרות אחרת

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | +0.55 | +0.6 | -0.9 | +0.5 |
| יש עתיד | -0.8 | -0.3 | +0.7 | +0.85 |
| המחנה הממלכתי | -0.55 | +0.5 | -0.3 | +0.6 |
| הציונות הדתית | +1 | -0.8 | -1 | -0.7 |
| ש״ס | +0.4 | +0.5* | -0.7 | +0.3* |
| יהדות התורה | +0.45 | +0.5* | -0.6 | +0.2* |
| ישראל ביתנו | +0.4 | -0.5 | +0.3 | +0.8 |
| עוצמה יהודית | +1 | -0.9 | -1 | -0.9 |
| רע״ם | -1 | -0.8 | +1 | +0.6 |
| חד״ש-תע״ל | -1 | -1 | +0.9 | +0.3 |
| המחנה הדמוקרטי | -1 | -0.8 | +1 | +0.9 |

### הסערה הביטחונית — איזו דרך מעשית תקדם ביטחון בשנים הקרובות?

1. הכרעה צבאית והרתעה מתמשכת
2. עוצמה צבאית בתיאום הדוק עם ארצות הברית
3. חיבור בין כוח צבאי להסדרים אזוריים
4. מסגרת מדינית אזורית כמוקד הביטחון

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | +0.9 | +0.4 | +0.3 | -0.6 |
| יש עתיד | -0.5 | +0.8 | +0.9 | +0.6 |
| המחנה הממלכתי | -0.1 | +0.9 | +0.9 | +0.3 |
| הציונות הדתית | +0.95 | -0.3 | -0.7 | -0.95 |
| ש״ס | +0.2 | +0.5 | +0.4 | -0.2* |
| יהדות התורה | +0.1 | +0.3* | +0.3 | -0.2* |
| ישראל ביתנו | +0.7 | +0.7 | +0.5 | -0.3* |
| עוצמה יהודית | +1 | -0.8 | -0.9 | -1 |
| רע״ם | -0.9 | -0.5 | 0 | +0.95 |
| חד״ש-תע״ל | -1 | -0.9 | -0.4 | +0.85 |
| המחנה הדמוקרטי | -0.3 | +0.7 | +0.9 | +0.6 |

### השותפות הערבית — מה מקומן הראוי של מפלגות ערביות בפוליטיקה הישראלית?

1. שותפות מלאה, כולל ישיבה בממשלה
2. תמיכה מבחוץ בממשלה מוסכמת
3. שיתוף פעולה אזרחי מוגבל בנושאים מוסכמים
4. פסילה פוליטית של שותפות קואליציונית

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.9 | -0.7 | +0.3 | +0.9 |
| יש עתיד | -0.3 | -0.1 | +0.6 | -0.6 |
| המחנה הממלכתי | -0.7 | -0.5 | +0.6 | -0.5 |
| הציונות הדתית | -1 | -0.9 | -0.3* | +1 |
| ש״ס | -0.8 | -0.5 | +0.5* | +0.7 |
| יהדות התורה | -0.6* | -0.3* | +0.5 | +0.1 |
| ישראל ביתנו | -0.4 | -0.8 | +0.4 | +0.3 |
| עוצמה יהודית | -1 | -1 | -0.6 | +1 |
| רע״ם | +1 | +0.6 | -0.3 | -1 |
| חד״ש-תע״ל | +0.2 | +0.8 | -0.2 | -1 |
| המחנה הדמוקרטי | +0.9 | +0.5 | -0.4 | -1 |

### השוויון האזרחי — מה צריכה להיות מדיניות המדינה כלפי אזרחיה הערבים?

1. שוויון מלא והשקעה מתקנת רחבה
2. השקעה אזרחית משמעותית בלי שינוי זהות המדינה
3. זכויות פרט מלאות ללא הכרה קולקטיבית
4. זכויות מותנות במחויבות ובנאמנות למדינה

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.7 | +0.1 | +0.5 | +0.2* |
| יש עתיד | +0.4 | +0.9 | +0.3 | -0.8 |
| המחנה הממלכתי | +0.3 | +0.8 | +0.5 | -0.6* |
| הציונות הדתית | -0.9 | -0.6 | -0.2* | +0.7 |
| ש״ס | -0.5 | +0.2 | +0.1* | +0.2* |
| יהדות התורה | -0.5 | 0* | +0.1* | +0.1* |
| ישראל ביתנו | -0.4 | +0.4 | +0.2 | +1 |
| עוצמה יהודית | -1 | -0.8 | -0.5 | +0.9 |
| רע״ם | +0.6 | +1 | -0.3 | -0.9 |
| חד״ש-תע״ל | +1 | +0.1 | -0.8 | -1 |
| המחנה הדמוקרטי | +1 | +0.5 | -0.3* | -1 |

### החוזה האזרחי — מה צריכה להיות המדיניות כלפי הציבור החרדי בתחומי שירות, חינוך ותקצוב?

1. שוויון אזרחי מלא בחובות ובזכויות
2. שינוי הדרגתי ומוסכם לאורך שנים
3. אוטונומיה רחבה לקהילה החרדית
4. הכרה בלימוד תורה כתרומה לאומית שוות ערך

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.4 | +0.6 | +0.4 | +0.3 |
| יש עתיד | +0.9 | -0.3 | -0.7 | -0.9 |
| המחנה הממלכתי | +0.6 | +0.7 | -0.3 | -0.6 |
| הציונות הדתית | -0.1 | +0.6 | +0.3* | +0.6 |
| ש״ס | -0.9 | +0.3 | +0.9 | +1 |
| יהדות התורה | -1 | +0.1 | +1 | +1 |
| ישראל ביתנו | +1 | -0.7 | -0.9 | -1 |
| עוצמה יהודית | -0.2 | +0.5 | +0.4* | +0.4 |
| רע״ם | -0.3 | +0.5 | +0.5 | -0.3 |
| חד״ש-תע״ל | -0.1 | +0.2* | +0.3* | -0.6 |
| המחנה הדמוקרטי | +0.8 | +0.4 | -0.7 | -0.9 |

### השבת והרבנות — מה היחס הרצוי בין דת ומדינה בישראל?

1. הפרדה אזרחית רחבה בין דת ומדינה
2. חופש אזרחי מקומי לצד סמלים יהודיים ממלכתיים
3. סטטוס-קוו מתוקן ומעודכן
4. חיזוק סמכות הרבנות והזהות היהודית במרחב הציבורי

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.8 | -0.4 | +0.3 | +0.7 |
| יש עתיד | +0.4 | +0.9 | +0.5 | -0.9 |
| המחנה הממלכתי | -0.3 | +0.6 | +0.8 | -0.6 |
| הציונות הדתית | -1 | -0.7 | -0.3 | +1 |
| ש״ס | -1 | -0.9 | -0.2 | +1 |
| יהדות התורה | -1 | -0.9 | -0.2 | +1 |
| ישראל ביתנו | +0.7 | +0.9 | +0.1 | -1 |
| עוצמה יהודית | -0.9 | -0.6 | -0.3 | +0.9 |
| רע״ם | -0.6 | +0.1* | +0.4 | +0.1 |
| חד״ש-תע״ל | +0.9 | -0.2 | -0.4 | -0.9 |
| המחנה הדמוקרטי | +0.8 | +0.6 | +0.1 | -1 |

### הלחם והבית — מהי הדרך המרכזית להוריד את יוקר המחיה ולאפשר דיור בהישג יד?

1. התערבות ממשלתית רחבה בשוק ובמחירים
2. שילוב של הגברת תחרות והתערבות ממוקדת
3. שוק חופשי, הסרת רגולציה ופתיחת השוק
4. סיוע ישיר למשפחות ולפריפריה

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.55 | +0.45 | +0.6 | +0.3 |
| יש עתיד | -0.5 | +0.9 | +0.25 | +0.3 |
| המחנה הממלכתי | -0.45 | +0.85 | +0.3 | +0.4 |
| הציונות הדתית | -0.75 | +0.35 | +0.85 | +0.4 |
| ש״ס | +0.4 | +0.1* | -0.6* | +0.95 |
| יהדות התורה | +0.35 | 0* | -0.5* | +0.9 |
| ישראל ביתנו | -0.9 | +0.4 | +0.95 | +0.3 |
| עוצמה יהודית | +0.2* | 0* | -0.2* | +0.55 |
| רע״ם | +0.3* | +0.35* | -0.4* | +0.95 |
| חד״ש-תע״ל | +0.9 | -0.1* | -0.95 | +0.75 |
| המחנה הדמוקרטי | +0.5 | +0.6 | -0.65 | +0.7 |

### הדמוקרטיה עצמה — האם ישראל זקוקה לשינוי בשיטת הממשל והייצוג?

1. יותר דמוקרטיה ישירה ומשתפת לאזרחים
2. שינוי שיטת הייצוג והבחירות
3. חיזוק המשילות ויכולת ההכרעה של הממשלה
4. בעיקר שינוי במנהיגות ובנורמות, לא בשיטה

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.3* | +0.1* | +0.9 | -0.7 |
| יש עתיד | 0* | +0.3 | -0.2 | +0.2 |
| המחנה הממלכתי | -0.1* | -0.1* | +0.3 | +0.7 |
| הציונות הדתית | -0.5* | +0.2 | +1 | -0.8 |
| ש״ס | -0.4* | -0.6 | +0.7 | -0.3* |
| יהדות התורה | -0.6* | -0.7 | +0.7 | -0.3* |
| ישראל ביתנו | -0.1* | +0.7 | +0.8 | -0.6 |
| עוצמה יהודית | -0.6* | +0.2* | +1 | -0.8 |
| רע״ם | +0.2* | -0.4 | -0.6 | +0.3* |
| חד״ש-תע״ל | +0.3* | -0.4 | -0.9 | -0.3* |
| המחנה הדמוקרטי | +0.2* | -0.2* | -0.7 | -0.2 |

### יחסי החוץ — כמה משקל לתת לברית עם ארה״ב, למעמד הבינלאומי ולקשר עם יהדות התפוצות?

1. משקל מכריע לברית עם ארה״ב ולמעמד הבינלאומי
2. משקל גבוה, אך לא מכריע, לצד שיקולים עצמאיים
3. הקשבה לעולם לצד פעולה עצמאית ועקבית
4. העדפת חופש פעולה מלא, גם במחיר עימות

| מפלגה | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| הליכוד | -0.6 | +0.3 | +0.4 | +0.6 |
| יש עתיד | +0.9 | +0.3 | -0.3* | -1 |
| המחנה הממלכתי | +0.6 | +0.7 | 0* | -0.8 |
| הציונות הדתית | -0.9 | -0.5* | -0.4* | +0.95 |
| ש״ס | -0.3* | +0.2* | +0.3* | 0* |
| יהדות התורה | -0.4* | +0.1* | +0.2* | 0* |
| ישראל ביתנו | +0.4 | +0.8 | +0.2* | -0.6* |
| עוצמה יהודית | -1 | -0.7 | -0.6* | +1 |
| רע״ם | +0.5 | +0.3* | 0* | -0.9* |
| חד״ש-תע״ל | +0.1 | 0* | -0.4* | -1 |
| המחנה הדמוקרטי | +0.85 | +0.3* | -0.2* | -1 |

