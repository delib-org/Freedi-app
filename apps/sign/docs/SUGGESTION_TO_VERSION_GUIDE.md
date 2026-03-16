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
| 1 | **Accept Top / Accept** | A good suggestion exists - accept it from the Admin Action Bar or per-suggestion | Simplest |
| 2 | **AI Synthesize** | Many suggestions - AI combines the best ideas, you review and accept in one step | Simple |
| 3 | **Review Queue** | Auto-surface suggestions that reach consensus threshold | Medium |
| 4 | **AI Version Generation** | Revise the entire document at once based on all feedback | Advanced |

---

## The Admin Action Bar

When an admin opens a Suggestion Thread, the **Admin Action Bar** appears at the top. It replaces the old Phase Controls + separate AI Synthesis Panel with a single, guided interface.

### What it shows

The bar adapts based on the state of community feedback:

**Collecting** (few/no suggestions, or low consensus):
```
📊 2 suggestions · Top consensus: 15%
Waiting for more community input
```
No action buttons — just status. Wait for more community votes.

**Ready to Review** (suggestions exist with consensus >= 30%):
```
📊 5 suggestions · Top consensus: 78%
[✓ Accept Top]  [⚡ AI Synthesize]  [···]
```
Two primary actions appear:
- **Accept Top** — accept the highest-consensus suggestion (with inline diff preview)
- **AI Synthesize** — combine top suggestions with AI, edit, then accept the result directly
- **[···]** overflow menu — "Enter Refinement Phase" (advanced workflow, requires Refinement enabled in settings)

### How the actions work

Each action flows through inline panels — no separate modals or pages needed.

---

## Pathway 1: Accept Top / Accept Suggestion

**Best for:** A paragraph has a suggestion you like. Two clicks to make it official.

### Via the Admin Action Bar ("Accept Top")

1. Open the document and click on a paragraph to open its **Suggestion Thread**
2. The **Admin Action Bar** at the top shows suggestion count and top consensus score
3. Click **"Accept Top"** (or just **"Accept"** when there's only 1 suggestion)
4. The bar expands to show an **inline diff**:
   - **Current** (red) — the existing paragraph text
   - **New** (green) — the top suggestion text
5. Click **"Confirm Accept"**
6. The bar briefly shows a success message, then returns to status

### Via individual suggestion ("Accept" button)

Each suggestion card also has a green **"Accept"** button (admin-only). Clicking it shows a confirmation dialog and accepts that specific suggestion.

### What happens on accept

- Old paragraph text -> **version history** (preserved, not lost)
- Suggestion text -> **new official paragraph**
- Accepted suggestion -> marked "promoted", disappears from suggestions list
- Other suggestions -> marked "for old version", no longer shown
- Votes -> **reset to zero** on the new paragraph text
- Version number -> incremented (e.g., v1 -> v2)

---

## Pathway 2: AI Synthesize

**Best for:** A paragraph has many suggestions. AI combines the best ideas into one text that you review and accept in a single flow.

### Steps

1. Open the **Suggestion Thread** for a paragraph
2. In the **Admin Action Bar**, click **"AI Synthesize"**
3. The bar shows a loading state while AI processes the top suggestions
4. When done, the bar expands with:
   - An **editable textarea** containing the AI-synthesized text
   - A **"Show AI Reasoning"** toggle to see why the AI made its choices
5. **Edit** the synthesized text if you want to adjust it
6. Click **"Accept Synthesis"**
7. The system creates the suggestion and accepts it in one step (versioning, history, and evaluation reset all happen automatically)
8. The bar briefly shows a success message

### Key difference from the old workflow

Previously, AI synthesis was a multi-step process: Synthesize → Publish as AI Suggestion → Wait for votes → Accept. Now it's a single flow: Synthesize → Edit → Accept. The admin decides right away.

### Refinement Phase (advanced, optional)

For admins who want the community to vote on the AI synthesis before accepting, the overflow menu (**[···]**) offers **"Enter Refinement Phase"**. This requires Refinement to be enabled in Settings.

In refinement mode:
- Low-consensus suggestions are **hidden** from regular users
- Only top suggestions + AI synthesis remain visible
- Users can still **vote**, **comment**, and **add new suggestions** (shown with a "Late Addition" badge)
- Use **"Improve with AI"** on any suggestion to refine it based on its comments
- Click **"End Refinement"** to restore normal mode

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

- **Start with the Admin Action Bar** - it guides you with the right actions based on community feedback state
- **Accept Top** when a clear winner emerges (high consensus)
- **AI Synthesize** when multiple suggestions have good ideas you want combined
- **Refinement Phase** (overflow menu) when you want the community to vote on the AI synthesis first
- **Use Pathway 3 (Review Queue)** when you want a more structured, ongoing workflow
- **Use Pathway 4 (AI Versions)** for periodic comprehensive revisions (e.g., monthly review)
- The **consensus score** reflects community agreement: higher = more net support
- Actions appear only when consensus reaches 30% — below that, the bar shows "Waiting for more community input"
- After accepting a suggestion, the community **votes again** on the new text - this creates a continuous improvement loop
- You can view **version history** for any paragraph to see how it evolved over time
