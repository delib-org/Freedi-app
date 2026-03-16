# How to Update a Document Based on Community Suggestions

This guide explains the full lifecycle: community members suggest alternatives, vote on them, and the admin decides which suggestions become the new official text.

---

## The Core Model

Every paragraph in a document is an **official statement**. Community members can suggest **alternative versions** of any paragraph. Each suggestion collects votes (agree/disagree), producing a **consensus score** (higher = more community support).

When the admin **accepts** a suggestion, it doesn't simply overwrite the paragraph. Instead, the system **versions** the paragraph:

- The old text is saved in **version history**
- The suggestion text becomes the new official paragraph
- The accepted suggestion is marked as "promoted" and removed from the suggestions list
- All other suggestions are archived as "for the old version"
- Votes on the paragraph **reset** so the community can evaluate the new text fresh
- The paragraph's **version number** increments (v1 -> v2 -> v3...)

This means every paragraph change is tracked, reversible, and transparent.

---

## Overview: Four Pathways

| # | Pathway | When to use | Complexity |
|---|---------|------------|------------|
| 1 | **Accept Suggestion** | A good suggestion exists - accept it now | Simplest |
| 2 | **Refinement + AI Synthesis** | Many suggestions - use AI to combine the best ideas first | Medium |
| 3 | **Review Queue** | Auto-surface suggestions that reach consensus threshold | Medium |
| 4 | **AI Version Generation** | Revise the entire document at once based on all feedback | Advanced |

---

## Pathway 1: Accept Suggestion

**Best for:** A paragraph has a suggestion you like. One click to make it official.

### Steps

1. Open the document and click on a paragraph to open its **Suggestion Thread**
2. At the top you see the **Current Version** (the official paragraph text, also voteable)
3. Below it, see all **Suggested Alternatives** with their consensus scores
4. Click the green **"Accept Suggestion"** button on the one you want
5. Confirm in the dialog
6. Done - the paragraph updates for all users in real-time

### What happens

- Old paragraph text -> **version history** (preserved, not lost)
- Suggestion text -> **new official paragraph**
- Accepted suggestion -> marked "promoted", disappears from suggestions list
- Other suggestions -> marked "for old version", no longer shown
- Votes -> **reset to zero** on the new paragraph text
- Version number -> incremented (e.g., v1 -> v2)

### When NOT to use this

- When there are many competing suggestions and you're not sure which is best (use Pathway 2 instead)
- When you want to combine ideas from multiple suggestions (use Pathway 2 with AI synthesis)

---

## Pathway 2: Refinement + AI Synthesis

**Best for:** A paragraph has many suggestions. You want AI to combine the best ideas into one, then accept that.

### Setup (one-time)

1. Go to **Admin Panel > Settings**
2. Enable **"Suggestions"** (if not already on)
3. Enable **"Refinement"** (appears when suggestions are enabled)

### Workflow

#### Step A: Synthesize

1. Open the **Suggestion Thread** for a paragraph
2. You'll see **Phase Controls** at the top (admin-only)
3. Click **"Synthesize with AI"**
4. A panel expands showing:
   - A **consensus threshold slider** - controls which suggestions feed the AI (e.g., only suggestions with >20% consensus)
   - A **preview** of which suggestions are above the threshold
5. Click **"Generate"**
6. AI produces a **synthesized suggestion** combining the strongest ideas
7. **Edit** the result if you want to adjust it
8. Click **"Publish as AI Suggestion"** - this adds it to the thread with a blue "AI Synthesis" badge
9. The community can now vote on the AI synthesis alongside other suggestions

#### Step B: Refinement Phase (optional)

If you want to narrow the field before accepting:

1. Click **"Enter Refinement Phase"**
2. Low-consensus suggestions are **hidden** from regular users (you can still see them in a collapsed section)
3. Only top suggestions + the AI synthesis remain visible
4. Users can still:
   - **Vote** on the visible suggestions
   - **Comment** on them
   - **Add new suggestions** (shown with a "Late Addition" badge)
5. Use **"Improve with AI"** on any suggestion to refine it based on its comments

#### Step C: Accept

1. Once you're satisfied with a suggestion (AI-synthesized or community-written):
2. Click **"Accept Suggestion"** on it
3. Same versioning as Pathway 1 (history preserved, votes reset, version incremented)
4. Click **"End Refinement"** to restore normal mode for this paragraph

---

## Pathway 3: Review Queue

**Best for:** Hands-off approach. Suggestions automatically surface for your review once the community reaches consensus.

### Setup (one-time)

1. Go to **Admin Panel > Version Control**
2. Toggle **"Enable Version Control"** ON
3. Set the **Review Threshold** (e.g., 50% consensus)

### How it works

- When a suggestion's consensus score crosses your threshold, it **automatically enters the review queue**
- You get notified

### Review workflow

1. Go to **Admin Panel > Version Control** (the "Queue" tab)
2. See all suggestions that reached the threshold
3. Click **"Review"** on any item to open the review modal:
   - **Diff view**: word-level highlighting of what changes
   - **Side-by-side**: current text vs. suggested text
   - **Context**: surrounding paragraphs for reference
   - **Consensus score** and voter count
4. Choose:
   - **Approve** - paragraph is replaced (with full versioning)
   - **Approve with edits** - modify the text, then approve
   - **Reject** - keep current paragraph (must provide a reason; suggestion creator is notified)

### What happens on approval

Same as Pathway 1 (version history, promoted suggestion, reset votes, version increment), plus:
- Suggestion creator receives an **in-app notification** ("Your suggestion was approved")
- An **audit trail entry** is created

---

## Pathway 4: AI Version Generation

**Best for:** Periodic comprehensive revision of the entire document using all community feedback at once.

### When to use

- After a significant amount of community feedback has accumulated
- When you want to revise multiple paragraphs at once
- When you want AI to consider comments and rejection reasons (not just suggestions)

### Steps

1. Go to **Admin Panel > Versions**
2. Click **"Create New Version"** - creates a draft snapshot
3. Click **"Generate Changes"** - analyzes ALL feedback:
   - Suggestions with consensus scores
   - Comments on paragraphs
   - Paragraph approval/rejection votes
   - Document-level signatures and rejection reasons
4. Click **"Process with AI"** - Gemini AI proposes text changes per paragraph (takes 1-2 minutes)
5. **Review each proposed change:**
   - Original text vs. AI-proposed text
   - Which suggestions/comments influenced the change
   - AI's reasoning for the change
   - **Approve**, **Reject**, or **Edit** each change
6. Click **"Publish Version"** - all approved changes applied at once

### AI Strategies

The system picks a strategy automatically:

- **Amend Paragraphs** (default): AI improves each paragraph individually based on its specific feedback
- **Full Revision** (when rejection rate > 50%): AI considers the entire document holistically and can propose adding, removing, or restructuring paragraphs

---

## Admin Panel Navigation

| Page | Sidebar Link | What you do there |
|------|-------------|-------------------|
| Dashboard | Dashboard | Overview of document activity |
| Settings | Settings | Enable suggestions, refinement, version control |
| Content Editor | Content Editor | Edit paragraphs directly, import Google Docs |
| Version Control | Version Control | Review queue for auto-queued suggestions |
| Versions | Versions | AI-assisted full document versioning |

---

## How Versioning Works (Technical Summary)

Every paragraph tracks a `versionControl` object:

```
versionControl: {
  currentVersion: 3,              // Increments on each accepted suggestion
  appliedSuggestionId: "abc123",  // Which suggestion was accepted
  appliedAt: 1710000000000,       // When it was accepted
  finalizedBy: "admin_user_id",   // Who accepted it
}
```

When a suggestion is accepted:

1. **Version history entry** created as a hidden Statement document (`history_v2_paragraphId`)
   - Preserves the old text, consensus score, evaluation counts
2. **Paragraph updated** with new text, version incremented, evaluations reset
3. **Winning suggestion** gets `versionControl.promotedToVersion: 3` (filtered from suggestion list)
4. **Other suggestions** get `versionControl.forVersion: 2` (archived as "for old version")

This means:
- No text is ever lost
- Every change is traceable to a specific suggestion and admin decision
- The community always votes fresh on the new text

---

## Tips

- **Start with Pathway 1** - it's the simplest and covers most cases
- **Use Pathway 2 (Refinement)** when a paragraph has 5+ competing suggestions
- **Use Pathway 3 (Review Queue)** when you want a more structured, ongoing workflow
- **Use Pathway 4 (AI Versions)** for periodic comprehensive revisions (e.g., monthly review)
- The **consensus score** reflects community agreement: higher = more net support
- After accepting a suggestion, the community **votes again** on the new text - this creates a continuous improvement loop
- You can view **version history** for any paragraph to see how it evolved over time
