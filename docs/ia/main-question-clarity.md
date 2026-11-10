# Main: Question screen clarity — IA spec

Status: approved by owner 2026-11-10; native Hebrew read-through still owed
Date: 2026-11-10
Supersedes: the label "Other ideas" in `docs/ia/main-app-theme-other.md` (now "Other answers"). Everything else there stands.

Scope: labels, cues and navigation consistency on existing screens. No new screen. Code types, route segments and most i18n keys stay. Values change in all 7 language files; this spec gives EN and HE, and the other five follow under plan item 1.11.

## 1. Audiences

| Audience | One-line goal | Must never see |
|---|---|---|
| Participant, possibly about 13 years old, often Hebrew on a phone | Know what to do now, add an answer, rate answers | Option, Solution, Idea, Proposal, Consensus, Cp, Confidence; a "%" on a score |
| Host (admin or creator) | Move the question through its stages and override what participants can do | Two names for one switch |
| Signed-out or anonymous visitor at a closed door | Sign in and return to the same place | "Take Me Home" as the only way forward |

## 2. Object model

| Object | Statement mapping | Relation and lifecycle |
|---|---|---|
| Question | `StatementType.question` | Has 0..n answers, 0..n messages, 0..n follow-up questions. Stage is Collecting → Rating → Voting → Decided |
| Answer | `StatementType.option`, `parentId` = question | Has 0..n ratings, 0..n messages. "Your own" answers are not rateable |
| Combined answer | Option with `isCluster`, `derivedByPipeline: 'synthesis'` | An answer, rated like any other. Built from 2..n original answers |
| Original answer | An option that a combined answer or a topic lists | Visible on drill-down |
| Topic | Option with `isCluster`, `derivedByPipeline: 'topic-cluster'` | Groups related answers. Not rated |
| Message | `StatementType.statement` | Can be turned into an answer or a question |
| Rating | Evaluation, −1..+1 | One per person per answer |
| Vote | Vote document | At most one per person per question |

Viewer capability comes from `QuestionScreenData`: `canAddAnswer`, `canRate`, `isHalted`, `ratedCount`, `rateableCount`.

## 3. Labels

### 3.1 The Answer set

Route segment: none changes (`?tab=options` stays). Code type stays `StatementType.option`.

| Concept | EN | HE | i18n key | Retire in main app |
|---|---|---|---|---|
| The thing people add and rate | Answer | תשובה | `Answer`, `question.sheet.typeAnswer` | Option אפשרות, Suggestion הצעה, Solution פתרון, Idea רעיון, Proposal הצעה |
| Plural, tab | Answers | תשובות | `Answers` | Options, Solutions, Suggestions, Ideas, Proposals |
| Count | {n} answers | {n} תשובות | new `{n} answers` | `{n} ideas`, `options`, `solutions`, `suggestions` |
| Add action, sheet title | Add an answer | הוספת תשובה | `Add an answer` | Add Solution, Add Your Solution First, Add a possibility |
| Input label | Your answer | התשובה שלך | `Your answer` | Your Idea, Your suggestion |
| Sheet placeholder | What is your answer? | מה התשובה שלך? | `What do you think the solution is?` (value) | |
| Similar check | Checking whether someone already wrote something similar… | בודקים אם מישהו כבר כתב משהו דומה… | existing key (value) | "suggested" |
| Rate, button | Rate the answers | לדירוג התשובות | `Rate the answers` | Evaluate, להעריך |
| Rate, plain noun | Ratings | דירוגים | `Ratings` | Evaluations, הערכות |
| Unrated | Not rated yet | עדיין לא דורגה | `Not rated yet` | |
| Turn a message into an answer | Turn into an answer | הפיכה לתשובה | `Mark as a Solution`, `Convert to Solution` (values) | Mark as a Solution, Convert to Solution |
| Same, tree view | Turn into an answer | הפיכה לתשובה | `Make this a proposal` (value) | "proposal" |
| Same menu, question | Turn into a question | הפיכה לשאלה | `Mark as a Question`, `Convert to Question` (values) | Mark as, Convert to |
| Undo, either type | Turn back into a message | החזרה להודעה | `Unmark as a Solution`, `Unmark as a Question` (values) | Unmark |
| Banner | This looks like an answer | נראה שזו תשובה | `This looks like a solution` (value) | |
| Conversion error | Could not turn this message into an answer. Please try again. | לא הצלחנו להפוך את ההודעה לתשובה. כדאי לנסות שוב. | existing key (value) | |
| Improve, title | Improve this answer together | משפרים את התשובה יחד | `improve.title` (he changes) | Improve the option together |
| Improve, open form | Write a better wording | לכתוב ניסוח טוב יותר | `improve.propose` (value) | Suggest, Propose improved wording |
| Improve, submit | Add as a new answer | הוספה כתשובה חדשה | `improve.submit` (value) | Create revised answer, Create revised option |
| Improve, link | See the original answer | לתשובה המקורית | `improve.compareSource` (value) | Compare the source option |
| Improve, AI modal | Improve this answer | שיפור התשובה | `Improve Suggestion` (value) | |
| AI-written answer | Combined answer | תשובה מאוחדת | new `Combined answer` | Synthesized proposal, merged idea, AI proposal |
| Member of a combined answer or topic | Original answer | תשובה מקורית | `Original Suggestion`, `Original ideas` (values) | source ideas, originals |
| Answers list header, AI | Answers combined with AI | תשובות שאוחדו בעזרת AI | `AI proposals` (value) | AI proposals |
| Answers list header, the rest | Participants' answers | תשובות של משתתפים | `Open ideas` (value) | Open ideas |
| Related answers | Topic | נושא | `Theme · distinct positions` becomes "Topic · different positions" / "נושא · עמדות שונות" | Theme, cluster, אשכול (participant surfaces) |
| Link from Maps | Topics and combined answers | נושאים ותשובות מאוחדות | `Themes & synthesis` (value) | Themes & synthesis |
| Answers in no topic | Other answers | תשובות אחרות | `Other ideas` (value) | Other ideas |
| Same, explainer | Answers that stand on their own. | תשובות שעומדות בפני עצמן. | `Ideas that stand on their own.` (value) | |

Empty states:

| Key | EN | HE |
|---|---|---|
| `solutionsOnboarding.shareSolution` | Share your answer | שתפו את התשובה שלכם |
| `solutionsOnboarding.shareSolutionDesc` | This is where everyone's answers come together. | כאן מתאספות התשובות של כולם. |
| `solutionsOnboarding.addSolution` | Add an answer | הוסיפו תשובה |
| `solutionsOnboarding.addSolutionDesc` | Tap the + button or "Add an answer". | לחצו על ה-+ או על "הוספת תשובה". |
| `solutionsOnboarding.convertFromDiscussion` | Or start in the Discussion | או התחילו בדיון |
| `solutionsOnboarding.convertFromDiscussionDesc` | Write in the Discussion tab and turn any message into an answer from its menu. | כתבו בלשונית דיון והפכו כל הודעה לתשובה דרך התפריט שלה. |
| `questionOnboarding.addSolutions` | Add answers | הוסיפו תשובות |
| `questionOnboarding.addSolutionsDesc` | Go to the Answers tab to add an answer, or write here and turn any message into an answer from its menu. | עברו ללשונית תשובות כדי להוסיף תשובה, או כתבו כאן והפכו כל הודעה לתשובה דרך התפריט שלה. |
| `questionOnboarding.startConversationDesc` | Write your thoughts or reactions in the discussion below. | כתבו את המחשבות והתגובות שלכם בדיון למטה. |
| `questionOnboarding.askQuestionsDesc` | You can also turn discussion messages into questions to break the topic into smaller parts. | אפשר גם להפוך הודעות דיון לשאלות כדי לפרק את הנושא לחלקים קטנים יותר. |
| `Be the first to share your idea!` | Be the first to add an answer! | היו הראשונים להוסיף תשובה! |
| `No suggestions yet` | No answers yet | אין עדיין תשובות |
| `Press "Add an answer" to add your suggestion` | Press "Add an answer" to write yours | לחצו על "הוספת תשובה" וכתבו את שלכם |
| `Press the + button to add your suggestion` | Press the + button to write yours | לחצו על ה-+ וכתבו את שלכם |

When `canAddAnswer` is false, the Answers empty state shows only "No answers yet". The add steps are hidden.

**Rule for the plan 1.1 key list.** Replace every word that names the thing people add and rate, on host surfaces too (Bulk add options, Top solutions, Find Solutions, Options shown in voting). HE: פתרון and רעיון are masculine and תשובה is feminine, so adjectives and verbs must change with the noun ("פתרון חדש" becomes "תשובה חדשה", "נוסף" becomes "נוספת").

**Keep these. They are a different concept.**

| Word | Legitimate use |
|---|---|
| Option / אפשרות | Generic UI: `Accessibility options`, `Allow "Other" option`, `Select an option`, `View options`, `add more options` (demographic forms), `Optional`, `Search options` when it filters a setting list |
| Suggestion / הצעה, Suggest | Sign's "Suggestion" (a proposed edit to a paragraph). The system proposing something that is not an answer: `AI suggestion`, `Suggested title`, `Suggest better title`, `Dismiss suggestion` (the banner's nudge) |
| Proposed | AI previews of groups or topics: `Proposed themes`, `Preview proposed groups` |
| Idea / רעיון | Ordinary meaning, not an item in a list: `Type a word or an idea`, landing and Waiting page copy ("share ideas") |
| Synthesis, Cluster, Clustering | Host tools only: `SynthesisPanel`, `host.clustering`, `Facilitator synthesis controls` |
| Consensus | Mode and product names: `Mass Consensus`, crowd-consensus mode |
| Confidence | `ImproveProposalModal`, where it is the AI's confidence, not a score of the answer |

**Shared keys.** Do not change the value; add or use a main-only key and repoint main call sites:

| Shared key | Also used by | Main-app replacement |
|---|---|---|
| `Options` | MC, Sign | `Answers` |
| `Solutions` | MC | `Answers` |
| `Suggestions` | Sign | `Answers` |
| `options` | Join | new `answers` |
| `Add Suggestion` | MC | `Add an answer` |
| `Consensus` | Sign | new `Agreement score` |
| `Consensus score` | another app | new `Agreement score` |
| `People evaluated` | another app | new `People who rated` |

### 3.2 The stage cue

One line under the stage bar on every tab of a question, mounted with `StageProgress` in `StatementHeader`. Plain imperative plural in Hebrew, so it is gender neutral. Keys are `stageCue.*`.

How-it-works link: **How it works / איך זה עובד** (`How it works`, exists). It opens `?tab=background` at `#how-it-works` and is not shown on the Background tab itself.

Strings:

| Key | EN | HE |
|---|---|---|
| `addOrRate` | Add an answer, or rate the ones already here. | הוסיפו תשובה, או דרגו את התשובות שכבר כאן. |
| `addRatingLater` | Add an answer. Rating opens later. | הוסיפו תשובה. הדירוג ייפתח בהמשך. |
| `noneToRateAdd` | No answers to rate yet. Add one. | אין עדיין תשובות לדרג. הוסיפו תשובה. |
| `noneToRate` | No answers to rate yet. | אין עדיין תשובות לדרג. |
| `rateEach` | Rate each answer on its own. What could you live with? | דרגו כל תשובה בנפרד. עם מה אפשר לחיות? |
| `moreToRate` | {n} more to rate. | עוד {n} לדרג. |
| `moreToRateAdd` | {n} more to rate. You can also add an answer. | עוד {n} לדרג. אפשר גם להוסיף תשובה. |
| `ratedAll` | You rated them all. Thank you! | דירגתם את כולן. תודה! |
| `ratedAllAdd` | You rated them all. Have another answer? | דירגתם את כולן. יש לכם עוד תשובה? |
| `collectingRead` | Answers are still coming in. You can read them. | התשובות עדיין נאספות. אפשר לקרוא אותן. |
| `ratingClosedAdd` | Rating is closed. You can still add an answer. | הדירוג סגור. אפשר עדיין להוסיף תשובה. |
| `ratingClosedRead` | Rating is closed. You can still read the answers. | הדירוג סגור. אפשר עדיין לקרוא את התשובות. |
| `voteOne` | Vote for one answer. | הצביעו בעד תשובה אחת. |
| `voteOrAdd` | Vote for one answer, or add a new one. | הצביעו בעד תשובה אחת, או הוסיפו תשובה חדשה. |
| `voted` | Your vote is in. Thank you! | ההצבעה שלכם נקלטה. תודה! |
| `votedAdd` | Your vote is in. You can still add an answer. | ההצבעה שלכם נקלטה. אפשר עדיין להוסיף תשובה. |
| `noneToVote` | No answers to vote on yet. | אין עדיין תשובות להצבעה. |
| `noneToVoteAdd` | No answers to vote on yet. Add one. | אין עדיין תשובות להצבעה. הוסיפו תשובה. |
| `votingClosedAdd` | Voting is closed. You can still add an answer. | ההצבעה סגורה. אפשר עדיין להוסיף תשובה. |
| `votingClosedRead` | Voting is closed. You can still read the answers. | ההצבעה סגורה. אפשר עדיין לקרוא את התשובות. |
| `closed` | This question is closed. You can still read the answers. | השאלה סגורה. אפשר עדיין לקרוא את התשובות. |
| `over` | The process is over. Read the result. | התהליך הסתיים. קראו את התוצאה. |

Cell selection, evaluated top to bottom:

1. Stage is Decided: `over`. `canRate` and `canAddAnswer` are always false there.
2. `isHalted` (host halt or deadline passed): `closed`.
3. If `canRate` and the question runs the voting UI (`evaluationUI === voting`), use the Voting table whatever the stage says. Otherwise use the row of the actual stage.

Capability is `canAddAnswer` × `canRate`, read per viewer, so hosts use the same tables. Progress:

- **Nothing to rate**: `rateableCount = 0`.
- **None**: `ratedCount = 0`.
- **Some**: `0 < ratedCount < rateableCount`.
- **All**: `ratedCount = rateableCount`.

{n} is `rateableCount − ratedCount`.

Collecting. Owner decision 2026-11-10: ratings stay ON during Collecting, so "Add and rate" is the normal row. The "Add only" row still applies when a host turns rating off by hand.

| Can do | Nothing to rate | None | Some | All |
|---|---|---|---|---|
| Add and rate | `noneToRateAdd` | `addOrRate` | `moreToRateAdd` | `ratedAllAdd` |
| Add only | `addRatingLater` | `addRatingLater` | `addRatingLater` | `addRatingLater` |
| Rate only | `noneToRate` | `rateEach` | `moreToRate` | `ratedAll` |
| Neither | `collectingRead` | `collectingRead` | `collectingRead` | `collectingRead` |

Rating:

| Can do | Nothing to rate | None | Some | All |
|---|---|---|---|---|
| Add and rate | `noneToRateAdd` | `rateEach` | `moreToRate` | `ratedAllAdd` |
| Add only | `ratingClosedAdd` | `ratingClosedAdd` | `ratingClosedAdd` | `ratingClosedAdd` |
| Rate only | `noneToRate` | `rateEach` | `moreToRate` | `ratedAll` |
| Neither | `ratingClosedRead` | `ratingClosedRead` | `ratingClosedRead` | `ratingClosedRead` |

Voting. Progress is "has voted", because a person has one vote. The rated Some and All columns collapse into Voted.

| Can do | Nothing to vote on | Not voted | Voted |
|---|---|---|---|
| Add and vote | `noneToVoteAdd` | `voteOrAdd` | `votedAdd` |
| Add only | `votingClosedAdd` | `votingClosedAdd` | `votingClosedAdd` |
| Vote only | `noneToVote` | `voteOne` | `voted` |
| Neither | `votingClosedRead` | `votingClosedRead` | `votingClosedRead` |

Decided: `over` in every cell.

The Answers tab counter keeps only `{rated}/{total}`. Its hint text moves to the cue, so nothing is said twice.

"How it works" lines (`HOW_KEYS`, values change):

| Stage | EN | HE |
|---|---|---|
| Collecting | Everyone adds answers. | כולם מוסיפים תשובות. |
| Rating | Rate each answer on its own: what could you live with? | מדרגים כל תשובה בנפרד: עם מה אפשר לחיות? |
| Voting | If needed, vote between the leading answers. | אם צריך, מצביעים בין התשובות המובילות. |
| Decided | The result becomes a written agreement. | התוצאה הופכת להסכמה כתובה. |

The Collecting line drops "Duplicates are checked quietly" because plan 1.9 makes that check conditional.

### 3.3 Score labels

Format decision: scores show as whole numbers from −100 to +100 with a sign and **no % sign** ("+62", "−15", "0"). Agreement thresholds use the same scale (60, not 0.6). "%" remains only where it is a real share of people.

| Number | EN | HE | Key | Data | Tooltip EN | Tooltip HE |
|---|---|---|---|---|---|---|
| Consensus score | Agreement score | ציון הסכמה | new `Agreement score`, tip `scoreTip.agreement` | `consensus` | A score between minus 100 and plus 100: the average rating, lowered while only a few people have rated. | ציון בין מינוס 100 לפלוס 100: הדירוג הממוצע, בהפחתה כל עוד דירגו רק מעטים. |
| Mean | Average rating | דירוג ממוצע | `Average rating`, tip `scoreTip.average` | `calcMeanSentiment` | All the ratings averaged, between minus 100 and plus 100, not the percentage of people in favor. | ממוצע כל הדירוגים, בין מינוס 100 לפלוס 100, ולא אחוז התומכים. |
| Count | People who rated | אנשים שדירגו | new `People who rated`, tip `scoreTip.people` | `numberOfEvaluators` | How many people rated this answer. | כמה אנשים דירגו את התשובה הזו. |
| Count with known population, value "50 / 500" | People who rated (same label) | אנשים שדירגו | tip `scoreTip.peopleOf` | `stakeholderCount` | {n} of the {total} people this question concerns rated this answer. | {n} מתוך {total} האנשים שהשאלה נוגעת להם דירגו את התשובה הזו. |
| Negative raters | Rated against | דירגו נגד | `Oppose` (value), tip `scoreTip.against` | `numberOfConEvaluators` | How many people gave this answer a rating below zero. | כמה אנשים נתנו לתשובה הזו דירוג שלילי. |
| Votes | Votes | הצבעות | `Votes`, tip `scoreTip.votes` | `selections` | How many people voted for this answer. | כמה אנשים הצביעו בעד התשובה הזו. |
| Single-like share, value "62%" | Liked by | אהבו | new `Liked by`, tip `scoreTip.liked` | `LikeChips` | The percentage of people who rated this answer and liked it. | אחוז האנשים שדירגו את התשובה הזו ואהבו אותה. |

Retire on participant surfaces: Consensus, Consensus score, Cp, Average, Average score, Average sentiment, Evaluators, evaluators, People evaluated, people evaluated, Of stakeholders, and bare Agreement on any number.

Remove from participant surfaces:
- **Confidence** (`AgreementHub`, `GroupedSuggestionCard`). The Agreement score already includes the adjustment.
- **The Agreement index row** in `GroupedSuggestionCard`. It is a second number that was also called Agreement. That card shows the same three as `ResultsStrip`.

Bands. `scoreLabelKey` takes the rater count as well:

| Condition | EN | HE | Key | Tooltip EN | Tooltip HE |
|---|---|---|---|---|---|
| Fewer than 3 people rated | Too few ratings so far | עדיין מעט דירוגים | new `Too few ratings so far` | Wait for a few more ratings before reading this answer's score. | כדאי לחכות לעוד כמה דירוגים לפני שקוראים את הציון. |
| Score ≥ 60 | Broad agreement | הסכמה רחבה | exists | Rated well by the people who rated it, and by enough of them. | קיבלה דירוגים טובים, ומספיק אנשים דירגו. |
| 30 to 59 | Partial agreement | הסכמה חלקית | exists | Leaning toward agreement, with room to improve. | נוטה להסכמה, ויש מקום לשפר. |
| −9 to 29 | No clear agreement | אין הסכמה ברורה | `Split` (value) | No clear direction yet: ratings are mixed or there are still few of them. | אין עדיין כיוון ברור: הדירוגים מעורבים או שעדיין יש מעט מהם. |
| −10 or lower | Low agreement | הסכמה נמוכה | `Opposition` (value) | The ratings of this answer are low. | הדירוגים של התשובה הזו נמוכים. |

Why two band names change. I applied the formula from `consensusCalculation.ts` by hand:

| Ratings | Score | Band today |
|---|---|---|
| One person, +1 | −0.19 | "Opposition" |
| Three people, all +1 | +0.17 | "Split" |
| Two for, one against (+.5, +.5, −.5) | −0.25 | "Opposition" |

The new names are true in all these cases. `AnswerResult` also hides the bar under 3 raters, matching the rule `ResultsStrip` already follows.

Other text on results (values change):

| Key | EN | HE |
|---|---|---|
| `Consensus will show after {n} evaluators` | Agreement score shows after {n} people rate | ציון ההסכמה יוצג אחרי ש-{n} אנשים ידרגו |
| `Results are hidden. Evaluate independently.` | Results are hidden for now. | התוצאות מוסתרות בינתיים. |
| `Top {n} by agreement` and `By consensus · top {n}` | Top {n} by agreement score | {n} המובילות לפי ציון הסכמה |
| `Above the agreement threshold ({n})` and `By consensus · threshold {n}` | Agreement score of {n} or more | ציון הסכמה {n} ומעלה |
| `Every rated answer, by agreement` | Every rated answer, by agreement score | כל התשובות שדורגו, לפי ציון הסכמה |
| `Candidates ranked by confidence-adjusted consensus.` | Answers ranked by agreement score. | התשובות מדורגות לפי ציון ההסכמה. |
| `Candidates, not a decision: answers most…` | Candidates, not a decision: the answers with the highest agreement score so far. | מועמדות, לא החלטה: התשובות עם ציון ההסכמה הגבוה ביותר עד עכשיו. |
| `The decision: the answer the whole group can live with.` | This is what the group decided. | זה מה שהקבוצה החליטה. |
| `QuestionProcess` "Cp NN%" | Agreement score NN | ציון הסכמה NN |
| `Summaries update…70% Cp.` | Summaries update every 24 hours when the leading answers change. Drafts start when all selected answers reach an agreement score of 70. | הסיכום מתעדכן כל 24 שעות אם התשובות המובילות השתנו. טיוטה נוצרת כשכל התשובות שנבחרו מגיעות לציון הסכמה 70. |
| `Read the introduction here…70% Cp.` | Read the introduction here. Develop and rate the full wording in Sign. Each agreement needs its own agreement score of 70. | כאן מופיע המבוא. את הנוסח המלא מפתחים ומדרגים ב־Sign. כל הסכמה זקוקה לציון הסכמה 70 משלה. |

"How to read the results", on the Results tab, collapsed by default:

| Key | EN | HE |
|---|---|---|
| `results.howToRead` | How to read the results | איך לקרוא את התוצאות |
| `results.howToRead1` | Every answer gets an agreement score between minus 100 and plus 100. It starts from the average rating and is lowered while only a few people have rated. | כל תשובה מקבלת ציון הסכמה בין מינוס 100 לפלוס 100. הוא מתחיל מהדירוג הממוצע, ומופחת כל עוד דירגו רק מעטים. |
| `results.howToRead2` | The score is not the percentage of people in favor. If half the group loves an answer and half rejects it, its score ends up low. | הציון הוא לא אחוז התומכים. אם חצי מהקבוצה אוהבים תשובה וחצי דוחים אותה, הציון שלה יהיה נמוך. |
| `results.howToRead3` | More ratings make the picture clearer, but they do not erase disagreement. | עוד דירוגים עושים את התמונה ברורה יותר, אבל לא מוחקים מחלוקת. |
| `results.howToRead4` | Answers that say the same thing can be combined into one. A combined answer is not a decision of the group. | תשובות שאומרות את אותו הדבר יכולות להתאחד לתשובה אחת. תשובה מאוחדת היא לא החלטה של הקבוצה. |

### 3.4 Host switch labels

The same three labels and keys are used in `HostHubSheet`, `LiveNowCard` (full and compact), `AllowAddAnswersToggle` and `InstantSettings`.

| Switch | Setting | EN | HE | Key | Retire |
|---|---|---|---|---|---|
| Add | `enableAdd*Option` | Participants can add answers | המשתתפים יכולים להוסיף תשובות | `Participants can add answers` | `host.allowAddAnswers` |
| Rate | `enableEvaluation` | Participants can rate and vote | המשתתפים יכולים לדרג ולהצביע | new `Participants can rate and vote` | `Accepting ratings`, `host.acceptingResponses`, `Accepting responses` |
| Live | `showEvaluation` | Participants see live results | המשתתפים רואים תוצאות בזמן אמת | new `Participants see live results` | `Live results for participants`, `Show live results` |

The rate switch names voting because it controls voting too.

The existing descriptions stay. `host.allowAddAnswersDesc` HE changes "מנחים" to "מארחים". `host.liveDesc` becomes "Presenter mode, PIN and QR, who can add, rate and vote, live results, close date" / "מצב מציג, קוד PIN ו-QR, מי יכול להוסיף, לדרג ולהצביע, תוצאות בזמן אמת, מועד סגירה".

Switches versus stage preset (shown under the three switches in `HostHubSheet`, only when at least one differs from `stagePreset(stage)`):

| Concept | EN | HE | Key |
|---|---|---|---|
| Status | Switches differ from this stage's settings | המתגים שונים מהגדרות השלב | new `host.stageDiffers` |
| Action | Restore stage settings | החזרת הגדרות השלב | new `host.applyStagePreset` |
| After | Stage settings restored | הגדרות השלב הוחזרו | new `host.stagePresetApplied` |

The status is written neutrally ("customised" is retired) so it stays true on older questions whose switches nobody changed by hand.

### 3.5 Maps

Route segments and `Screen` values stay. `title` and `rowTitle` in `mapViews` point to one key. `rowDescription` is the one description.

| Map | Route segment | EN | HE | Key | Retire |
|---|---|---|---|---|---|
| `Screen.mindMap` | `mind-map` | Mind map | מפת חשיבה | `Mind map` | `Mind Map` (`HeaderMenu`, `ViewsDropdown`, `FollowMeToast`) |
| `Screen.clusterBoard` | `cluster-board` | Topics map | מפת נושאים | new `Topics map` | Cluster map, Cluster Map, Groups board |
| `Screen.agreementMap` | `agreement-map` | Agreement map | מפת הסכמה | `Agreement Map` (value) | Agreement triangle |
| `Screen.polarizationIndex` | `polarization-index` | Disagreement map | מפת מחלוקות | new `Disagreement map` | Collaboration Index, Polarization |
| `Screen.subQuestionsMap` | `sub-questions-map` | Questions map | מפת שאלות | `Questions map` | Statement Map, Sub-question map |

**Cluster-map destination.** All in-app navigation goes to `/statement-screen/:id/cluster-board`: both `onNavigateToClusterMap` callers (`StatementTopNav`, `QuestionHeaderBar`), the Maps tab and `AgreementHub`. That screen has the back button, the map switcher and the question's title. `/map/:id` and `/map/:id/embed` stay as the public share and embed URLs only, so existing links keep working.

### 3.6 Small labels

| Item | Condition | EN | HE | Key |
|---|---|---|---|---|
| Bottom-nav "+" | `canCompose` true: the Answers tab, adding allowed | Add an answer | הוספת תשובה | `Add an answer` |
| Bottom-nav "+" | otherwise | Ask a question | לשאול שאלה | `Ask a question` |
| 401, signed out or anonymous | primary action | Sign in | התחברות | `Sign in` |
| 401, signed in with no access | body | You don't have access to this page. Ask the host to invite you. | אין לך גישה לעמוד הזה. אפשר לבקש הזמנה מהמארחים. | new `No access. Ask the host to invite you.` |
| 401, signed in with no access | primary action | Sign in with another account | התחברות עם חשבון אחר | new `Sign in with another account` |
| 401, either state | secondary | Back to home | חזרה לדף הבית | `Back to home` |

`Take Me Home` stays on 404 only.

**Improve panel.** `answer/AnswerImprovement.tsx` stays. Remove the `OptionImprovement` mount in `switch/Switch.tsx`. `AnswerImprovement` already respects the add-answers rule for both rating UIs, already uses the `improve.*` keys, and already steps aside for Popper-Hebbian mode. Today both panels render on the same tab.

## 4. Hierarchy

Unchanged. Depth is from Home.

Role: participant and host
0 Home
1   Question (stage bar + cue)
2     Background · Discussion · Answers · Questions · Results · Maps
3       Answer (its own Discussion, with the improve panel)
3       Written agreement (under Results)
3       Topics and combined answers (under Maps)
3       Mind map · Topics map · Agreement map · Disagreement map · Questions map

Role: host, additionally
2     Host tools sheet (over any tab)
3       Host hub sections

## 5. Navigation model

- Global: unchanged.
- Local: tabs unchanged. The cue is a line of text with one link, not a navigation level.
- Contextual: "How it works" goes to the Background tab. On Results, the gate button goes to Answers.
- Back paths: unchanged. The Topics map from the menu now has the same back button as from the Maps tab.
- Deep links: `?tab=` and `focusId` unchanged. Signing in from 401 returns to the original URL including `?tab=` (plan 1.8).

## 6. Task flows

Participant, know what to do (1 step): read the cue under the stage bar on any tab.

Participant, add an answer on a phone (3 steps):
1. Answers tab: tap "+", labelled Add an answer.
2. Sheet: write.
3. Sheet: tap Add.

Participant, rate (2 steps per answer):
1. Answers tab: read the card.
2. Tap a rating. The cue counts down.

Participant, understand a score (1 step): tap the number and read the tooltip.

Host, change stage (3 steps):
1. Header: open Host tools.
2. Tap a stage. The preset applies.
3. Read the status line.

Host, undo overrides (2 steps):
1. Host tools.
2. Restore stage settings.

## 7. Screen inventory

| Screen | Route | Single job | Empty | Loading | Error | No permission | Done |
|---|---|---|---|---|---|---|---|
| Answers tab | `?tab=options` | Add and rate | §3.1 empty states | existing | existing | No add steps; cue says what remains | `ratedAll` or `voted` |
| Results tab | `?tab=results` | Read where things stand | "Still collecting" text | existing | existing | Rate-first gate; "Results are hidden for now." | `over` |
| Background tab | `?tab=background` | Understand the question and process | existing | existing | existing | none | none |
| Discussion of an answer | `?tab=chat` | Discuss and improve | existing | existing | existing | Improve form hidden | New answer opens |
| Maps tab | `?tab=maps` | Choose a map | existing | existing | existing | none | none |
| Full-screen map | `/statement-screen/:id/<map>` | Read a map | existing | existing | existing | Hidden message on the two score maps | none |
| Host tools sheet | sheet | Run the session | none | none | none | Hosts only | Status line |
| 401 | `/401` | Get in | none | none | none | Two variants, §3.6 | Returns to the original URL |

## 8. Findability

Not changed by this pass. Sorting of the Answers list stays. Fair exposure is plan 3.5.

## 9. Open questions and assumptions

- Assumption: the 13-year-old test applies to hosts' switches too, which is why they are full sentences.
- Assumption: `single-like` questions keep "Rate" in the cue. The verb stays general even though the control is one tap.
- Owner decision 2026-11-10: ratings stay ON during Collecting. The "Add only" row in §3.2 applies only when a host turns rating off by hand.
- The voted state must come from the votes slice, not from `ratedCount`. See the bug listed in §11.

## 10. Handoff to UX

Fixed by this spec: every word above; the cue selection order; one improve panel; one in-app route for the Topics map; no "%" on scores.

Yours to decide:
- How the cue line and its link look and wrap at phone width in Hebrew.
- How tooltips open on touch.
- Where the status line and restore action sit among the switches.
- How numbers with a minus sign render in RTL (keep the existing `dir="ltr"` isolation).

## 11. Not in this pass

- The written agreement has three names: agreement, covenant, אמנה ("Our covenant", "Our agreements", "Draft agreement").
- Host has two Hebrew names: מארח and מנחה; "Facilitator" appears in English.
- `StatementVote.tsx` keeps `getVoteFromDB` at module level, so only the first question in a session loads the person's vote. The Voting cue depends on this. Fix it before or with 1.4.
- Votes are loaded only on the Answers tab, so the Voting cue on other tabs needs its own load.
- `LiveMapWorkspace` hides results only on two maps; `ClusterCard` on the Topics map shows scores regardless, and `/map/:id` has no gate (plan 2.4).
- `ViewsDropdown` has no Topics map.
- The compact Live strip has no add-answers switch.
- On the Answers tab with adding closed, "+" asks a new question. The label is now honest, but the action may surprise.
- Two add surfaces with different prompts (`AddAnswerSheet`, `AddStatementSheet`).
- `ClusterMap` inside the workspace repeats the title and Share.
- `MapExplorer` default export and `AgreementHub` view `maps` look unreachable.
- `getSortChips` has no caller and its `question.sort*` keys do not exist.
- HE value of `Evaluations` is "הצעות" (wrong word, `ResearchDashboard`).
- `PolarizationIndex` zone label "Consensus / Everyone agrees" is a separate concept that needs its own name.
- Formula caveat from the source: the score does not separately penalise a divided group; a split shows up only through a low average. The wording above claims no more than that.
