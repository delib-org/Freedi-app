# Agora — Session Script

> **Continuing work in a new chat?** Read `apps/agora/docs/HANDOFF.md` first —
> it carries the current implementation state, how to run everything, and
> what's next. This file is the *pedagogical script*: what each beat teaches
> and why, grounded in *On Deliberation*.

**A 45-minute classroom deliberation, staged as a rescue mission through time.**
Grounded in *On Deliberation* (Tal Yaron) — every beat below cites the principle it teaches.
Running example: the French Revolution fixture (הרוזן דה-לה-רוש ↔ קמיל דופון).

> Master text is English for design discussion; production strings go through the app's
> i18n flow (Hebrew-first). Lines marked 🎙 are narrator/on-screen text usable verbatim.
> Lines marked 👩‍🏫 are **teacher cards** — suggested spoken lines shown only on the
> teacher's screen, because "deliberation is a craft, and like any craft it is learned";
> the game should scaffold the teacher-as-facilitator, not just the students.

---

## Cold open — The Alarm (lobby)

**Screen (projector):** black. A klaxon pulse. Then:

🎙 **"אזעקה. Your class has been chosen."**
🎙 "France, 1789. In four years, the guillotine will run day and night. Nobody wanted
that — not the king's men, not the revolutionaries. They fell into it because they
stopped talking and started winning."
🎙 "History sent many armies back. They all failed. This time it's sending a classroom —
because the weapon that was missing wasn't force. It was a way to decide together."

**Student action:** scan QR / enter code. Each student's anonymous traveler-marker pops
onto the era map as they join (already implemented — this is the hook moment; make each
arrival audible/visible on the projector).

👩‍🏫 Teacher card: *"You won't be yourselves in there. No names, no cliques — the ideas
travel, not the reputations. Ready to save France?"*

**Why (theory):** Anonymity removes status effects — "the question 'who gets heard?'…
has become a design decision." The mission frame creates a *genuine question*, and
"a genuine question produces curiosity, which is the cognitive state in which groups learn."

---

## Act I — Through the Tunnel (framing)

### Scene 1 · Mission brief (intro)
🎙 "Your mission is not to pick a winner. Winners are what France is about to try —
and it costs a million lives. Your mission is to find what nobody in 1789 could:
**a solution both sides can live with.**"

### Scene 2 · Time tunnel (video / animation)
Pure spectacle. Arrival portal on the map. Keep it short (≤20s).

### Scene 3 · The world you must understand (period explainer)
Frame the explainer as **equipment, not homework**:

🎙 "You cannot fix what you cannot forecast. Before you meet anyone — learn how this
world works: who eats, who pays, who decides. Every fact you carry is a tool you'll
need when you build your solution."

**Why (theory):** This is the **grounding** stage of grounded selection — building the
shared picture "reliable enough to forecast what candidate solutions would do." The
plausibility rubric at the end of the game scores exactly this, so the script should
tell students up front that knowledge is ammunition: "forecasting is what deciding is
made of."

> **Engagement option (discuss):** let students collect 3–5 "evidence cards" during the
> explainer (bread price, state debt, who votes…). The AI coach later references them:
> *"Your proposal costs money — which of your evidence cards pays for it?"*

---

## Act II — Two Sides, One Country (perspectives)

### Scenes 4–5 · The positions
Each character presents their **position** — filmed/dialogue, 3 arguments each, both
sympathetic, neither strawmanned.

- The Count: order, tradition, the throne holds France together.
- Camille: equality, liberty, the people must rule.

### The deadlock beat (new — one screen, ten seconds)
After both scenes, the map shows the two camps facing off, and:

🎙 "Two demands. One country. If one side simply wins — you already know how this story
ends. **A contest treats the situation as simpler than it is.**"

👩‍🏫 Teacher card: *"Don't ask yet who's right. Ask what each of them is afraid of losing."*

**Why (theory):** "Contest framing converts genuinely complex problems into stylised
two-sided arguments." The script must let students *feel* the deadlock before offering
the way out — the needs reveal lands only if positions have visibly collided first.

---

## Act III — Beneath the Positions (needs) — *the pedagogical pivot*

### Scene 6 · The question (make it interactive — currently a passive scene)
🎙 "Here is the secret weapon history never used. A **position** is a demand — one way
of getting something. Beneath every position there is a **need**. Positions collide.
Needs can often *both* be met. Find the needs, and you find the door."

**Student action (proposed change):** before the needs videos play, each student/team
writes, in their own words: *"What does the Count actually need? What does Camille
actually need?"* The AI — **in character** — responds:

- הרוזן: *"Almost. It is not the palace I cannot lose — it is the certainty that
  tomorrow resembles today. Say it back to me again."* → until *"Yes. You have
  understood me."* (small point award, portrait warms)

**Why (theory):** This is the book's **theory-of-mind discipline** verbatim: "each party
states the others' needs back to them **until the others agree they have been
understood**." Watching a video about needs teaches *about* empathy; being told
*"you have understood me"* by the person themselves — that's the practice. It is the
single highest-leverage change to the current flow.

### Scenes 7–8 · The needs reveal
The characters again — but no podium now: the Count by candlelight, Camille in a
bare room. Human, vulnerable, specific ("at the level where a tired woman with a
newborn describes her nights").

### The needs board (implemented — replaces the value-identification stage)
When the needs scenes end, **both characters' needs appear side by side** and stay on
screen — and from positioning and every deliberation phase the student can reopen them
with one tap ("Remind me what both sides need"). The needs are the raw material of
every good proposal; they must be re-readable at the moment of writing, not a memory.

*(The free-text value-identification stage was removed from the flow — Tal: too much
cognitive load, a heavy writing task right before the proposal writing. The AI value
grading infrastructure remains for possible later use.)*

👩‍🏫 Teacher card: *"Notice: nobody asked you to agree with them. You were asked to
**see** them. Nobody is asked to renounce a worldview at the door — only to let its
parts be examined one at a time."*

---

## Act IV — Where Do You Stand? (positioning)

Student places their marker on the bridge between palace and assembly (0–100 → camp).
The scale ends are labeled with the **character names** (camp in parentheses) — students
met the Count and Camille, not "Royalists" and "Jacobins".

🎙 "Be honest — this is not a quiz. The game rewards you for building bridges *from*
where you actually stand, not for standing in the middle."

**Why (theory):** the bridging score needs true camps to mean anything; and honesty here
sets up the payoff — cross-camp support is worth ~2× same-camp (CROSS_W 0.65 vs
SAME_W 0.35). Deliberate **heterogeneity** is the correction for shared blind spots:
"each mind's blind spot covered by another's sight."

---

## Act V — The Agora (personal deliberation cycles)

The town square. Proposals appear as **idea lanterns** — brightness = support,
color blend = cross-camp support. The core mechanic must be *felt*: when someone from
the other camp supports your idea, your lantern visibly blends both camps' colors.

**Structure (implemented): each student runs their own cycle, self-paced — 5 laps of
*my proposal → evaluate others → help someone*.** No teacher-synchronized phases; the
teacher opens the square and later decides when it closes. Rating is attention-fair
(least-rated proposals first, per-student ordering) and capped per lap; help targets
favor proposals with the fewest open suggestions. The join code stays on the teacher
board through every stage so latecomers can always enter.

### Step 1 · My proposal — *independent first, then improve each lap*
🎙 "Before you see anyone else's idea — write your own. **A solution I propose, that we
could do together.** Which need of the Count does it serve? Which need of Camille?"

- The proposal editor carries that phrasing as its scaffold (sentence starter).
- **Lanterns stay dark/blurred until the propose phase ends** (proposed change).
- AI coach (existing writing assistant), retuned to challenge on the theory's three
  evaluation levels: *Can this be trusted in 1789? What does it cost against what it
  returns? Whose needs does it serve?*

**Why (theory):** the independent-write discipline "breaks cascades" — "early visible
answers erase the diversity of independent estimates." The required phrasing makes
proposals owned and addressed to joint action.

### Step 2 · Rate (implemented — five levels, attention-fair)
Students rate up to 3 proposals per lap (own excluded) on the MC-style scale:
😠 ממש לא בעד (−1) · 🙁 לא בעד (−0.5) · 😐 נמנעים (0) · 🙂 בעד (+0.5) ·
😍 מאוד בעד (+1). Candidates are served **least-rated first** with a
per-student ordering, so attention spreads instead of piling on the earliest
proposal ("early proposals win by timing, not merit" — countered).

🎙 "You are not voting for a winner. You are telling France what it could live with."

👩‍🏫 Teacher card: *"Criticism is addressed to the proposal, never the proposer.
'This plan underestimates the bread problem' keeps us working on the plan."*

### Step 3 · Help — *criticism as service* (implemented)
One suggestion per lap for a classmate's proposal (targets with the fewest
open suggestions come first), or skip. Accepting pays the suggester (points +
credit) and fires the **glitter celebration** quoting their improvement — the
loudest moment in the game belongs to making someone else's idea better.

🎙 "Pick a lantern and make it burn brighter. Your job is not to attack it —
**it is to make it the best version of itself.**"

Accepting or thanking a suggestion pays the *suggester* (existing: helping points +
credit + notification). Say so explicitly:

🎙 "In the Agora, the person who improves someone else's idea is paid as well as the
person who had it. A proposal under heavy criticism has already improved the
deliberation."

### The characters judge your lantern (implemented)
In the "my proposal" panel, the student can **show their proposal to each character**:

🎙 "Show your lantern to the Count. He will tell you, in his own voice, what would
make him accept it — and his verdict counts in the square like three travelers."

The AI answers **in character** (verdict, 0–100 acceptance, concrete advice keyed to
that character's needs), and its rating enters the *real* evaluation pipeline as
3 synthetic raters in the character's camp — so winning over the *other* side's
character visibly blends your lantern's colors, exactly like cross-camp classmates
would. Five asks per character per session ("improve first, then ask again") —
feedback → revise → verify, the theory's improvement loop in miniature. A verdict
older than the proposal's latest edit is **visibly stale** ("הנוסח השתנה") and
re-asking becomes the primary action; improving your own proposal keeps you on
this screen so the advisors can see the new text immediately.

### Laps repeat (mine → rate → help) × 5, self-paced, fuse for the whole square.
*(Proposed, not yet built)*: between laps, a one-screen **lap result**: the leading
lanterns, the camp-blend of each, and one narrator line tracking convergence —
"telling motion from progress."

> **Obstacle events (discuss, v2):** at round 2, inject a bias event the class must
> survive — e.g. a demagogue NPC posts an anchoring proposal with fake early support
> ("everyone already agrees — abolish X!"), and the class earns a bonus if it keeps
> rating on merit. The book's five biases are a ready-made deck of such events.

---

## Act VI — The Verdict (results)

1. **The forecast.** The leading proposal is fed to the simulation; the health-metric
   bars move (bread price, stability, rights, treasury) and **the map itself transforms**
   — banners and lights, or smoke and fire.
   🎙 "Reality is now present in the room as the most persuasive participant."
2. **The verdict.** Success is not "your side won" — it is **expanding agreement**:
   🎙 "In 1789 they had ways to pass a decision at 51 to 49. That is how you get a
   country where half the people are waiting for revenge. You needed more."
3. **Three endings (implemented — outcome rule: success = class score clears the
   threshold; honest disagreement = no success, but ≥2 proposals were rated by both
   camps AND ≥50% of positioned students rated; otherwise collapse. Non-success
   endings include a warm AI class debrief: what went well, what to try next time):**
   - **Success** — a proposal clears the expanding-agreement bar with real cross-camp
     support → the Terror never happens; the characters, together, thank the class.
   - **Honest disagreement** — no proposal cleared the bar, but the class mapped
     precisely where the sides differ and why → *not a failure screen*:
     🎙 "You did not save France today. But you did something France never managed:
     you found out exactly where the disagreement really lives. **Honest disagreement
     is itself an achievement** — and it is where the next attempt begins."
     (Sets up a second lesson — the book: "the genuinely creative solution — the one
     nobody brought to the first meeting — appears at the second or third.")
   - **Collapse** — the class converged on a one-sided "winner" or didn't converge and
     didn't map the disagreement → failure ending.
4. **Score breakdown** shown as *class* achievement first, personal points second:
   "a group is for each of its members, not for the mean of them."

👩‍🏫 Closing teacher card: *"Where in your own life is there a position you're defending —
and what's the need underneath it?"* (the transfer question; one minute, no answers
collected.)

---

## Deltas vs. current implementation (what this script asks for)

| # | Change | Size | Theory basis |
|---|--------|------|--------------|
| 1 | **Interactive needs check**: student states each character's needs; AI-in-character confirms ("you have understood me") | New stage or upgrade of `needsQuestion` scene + a grader like `agoraGradeValueIdentification` | Theory-of-mind discipline, ch. 9 |
| 2 | Deadlock beat between perspectives and needs (one narrator screen) | Tiny — one scene kind or scripted interstitial | Contest framing pitfall |
| 3 | Proposal phrasing scaffold: "a solution I propose, that we could do together" + needs-of-both prompt | Tiny — ProposalWrite copy + coach prompt | Owned proposals, ch. 9 |
| 4 | ✅ EFFECTIVELY DONE — the personal cycle writes first, rates after; others' texts aren't visible while writing | Shipped via cycles | Independent-first / anti-cascade |
| 5 | ✅ DONE — Third ending: **honest disagreement** (mapped divergence ≠ collapse) + AI debrief + in-character proposal review | Shipped | "Honest disagreement is itself an achievement" |
| 6 | Teacher cards: per-stage suggested spoken lines on the teacher screen | Small — content + TeacherSession UI | Facilitation is a craft; culture beats rules |
| 7 | Narrator layer: the 🎙 lines above as scene/interstitial copy in the topic package | Content — extend fixture + generator prompt | Curiosity as pedagogy |
| 8 | (v2) Evidence cards in the explainer, referenced by the coach | Medium | Grounding → forecasting |
| 9 | (v2) Bias obstacle events deck (anchoring demagogue, cascade, groupthink) | Medium | Ch. 4 five biases |

**Shipped beyond this table** (see `HANDOFF.md` for commits): needs board
side-by-side + one-tap recall everywhere; value-identification stage removed
(cognitive load); character names on the positioning scale; auto-start of the
deliberation square; personal 5-lap cycles; five-level rating; glitter
celebrations for improvements; my-proposal workshop redesign (hero lantern,
"what does the square say", character chips); game-feel pass (world strip on
every screen, HUD lantern pips, star field, beveled gold buttons); stale
verdict marking; join code always on the teacher board.

## Open design questions (to discuss)

1. **Rating scale.** Currently binary agree/disagree (±1). The book prescribes a
   continuous −1…+1 graded judgment plus a confidence-adjusted score where *strong
   opposition hurts more than moderate opposition* ("the score structurally rewards the
   solution that minimises harm"). Binary is faster for kids; graded is truer and feeds
   bridging better. Middle option: 5-step scale (−−, −, 0, +, ++).
2. **Success criterion.** Current: composite class score ≥70 (0.45 bridging + 0.25
   points + 0.3 plausibility). The book's bar is one proposal at **~80% net support
   across camps**. Composite rewards effort; the book's bar rewards the actual thing.
   Proposal: success = expanding agreement on a proposal; composite becomes the
   *grade*, not the *verdict*.
3. **Where does the interactive needs check sit** — replace valueIdentification,
   precede it, or merge (one stage: "needs, then values")? Two AI-graded writing stages
   may be one too many for 45 minutes.
4. **One lesson or two?** The book insists on incubation ("the best solutions walk back
   in with the coffee"). A two-lesson arc — lesson 1 ends at honest-disagreement,
   lesson 2 reopens the agora — may be the *intended* design rather than a fallback.
5. **Personal hook.** The protocol's Round 1 is "tell your own experience, no comments."
   Is there room for a 60-second personal connect before the tunnel ("when were you
   last in a fight where both sides had a point?") — or does it break the fiction?
6. **Team mode as the default?** The diagram notes 2–3 students per device "so they
   think together." The book's unit is the table of 3–7 with equal speaking time.
   Team-of-3 per device is closer to the theory than solo play — should individual
   mode be the exception?
