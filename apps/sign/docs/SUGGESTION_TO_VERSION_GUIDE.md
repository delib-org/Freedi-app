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

## Overview: Five Pathways

| # | Pathway | Who uses it | When to use | Complexity |
|---|---------|-------------|------------|------------|
| 1 | **Accept Top / Accept** | Admin | A good suggestion exists - accept it from the Admin Action Bar or per-suggestion | Simplest |
| 2 | **AI Comment Assistant** | Suggestion author / Admin | Your suggestion received comments - AI helps you improve it based on the feedback | Simple |
| 3 | **AI Synthesize** | Admin | Many suggestions - AI combines the best ideas, you review and accept in one step | Simple |
| 3b | **AI Merge Selected** | Admin | Hand-pick specific suggestions, AI merges them, result is published as a new suggestion for community voting | Simple |
| 4 | **Review Queue** | Admin | Auto-surface suggestions that reach consensus threshold | Medium |
| 5 | **AI Version Generation** | Admin | Revise the entire document at once based on all feedback | Advanced |

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

## Pathway 2: AI Comment Assistant

**Best for:** Your suggestion received comments from the community. AI reads all the feedback and helps you write an improved version that addresses their concerns.

**Who can use it:** The suggestion author (logged in) or any admin. Requires 2+ comments on the suggestion.

### How it works

1. Open a paragraph's **Suggestion Thread** and find your suggestion
2. Click **"Comments"** to expand the comment thread
3. Below the comments, you'll see an AI assist bar:
   ```
   [sparkle] Improve your suggestion using community feedback    [Improve]
   ```
4. Click **"Improve"**
5. AI reads all comments and generates an improved version. You'll see a loading state:
   ```
   [sparkle] Reading 4 comments and generating improvements...   [Cancel]
   ```
6. When ready, an inline panel appears with:
   - **Changes list** — each improvement the AI made, linked to the comment that inspired it
   - **Editable textarea** — the improved suggestion text, fully editable
   - **"Regenerate"** link — try again if you want a different result
7. **Edit** the text however you like — the AI is a starting point, not the final word
8. Click **"Apply Changes"** to replace your suggestion with the improved version
9. A brief success message appears, then the panel collapses

### What the result looks like

```
[sparkle AI SUGGESTION]

Improvements based on feedback:
  * Changed "quarterly" to "monthly"
    -- Based on: "I think quarterly is too infrequent..."
  * Added emergency session provision
    -- Based on: "Consider adding emergency sessions..."
  * Clarified quorum requirements
    -- Based on: "The quorum requirements are unclear..."
  * Added chair authority to call meetings
    -- Based on: "Should specify who can call meetings."

[Regenerate]

┌──────────────────────────────────────────────┐
│ The committee shall convene monthly to       │
│ review progress. Emergency sessions may be   │
│ called by the chair with 48 hours notice.    │
│ A quorum of 60% of members is required...    │
│ (editable textarea)                          │
└──────────────────────────────────────────────┘

[ Apply Changes ]  [ Dismiss ]
```

### What happens when you apply

- Your **original suggestion is updated** in-place (same ID, same vote history, same comment thread)
- The `lastUpdate` timestamp refreshes so others see the suggestion changed
- The community can continue voting and commenting on the improved version
- No version history is affected — this is just an edit to an existing suggestion

### When you don't like the result

- **Edit it** — the textarea is fully editable, change whatever you want
- **Regenerate** — click "Regenerate" to get a fresh AI take with the same comments
- **Dismiss** — click "Dismiss" to close the panel with no changes at all

### Visibility rules

The AI assist bar only appears when:
- The suggestion has **2 or more comments** (one comment isn't enough signal)
- You are the **suggestion author** or an **admin**
- You are **logged in** (not anonymous/guest)
- The paragraph is **not in refinement phase** (use "Improve with AI" during refinement instead)

---

## Pathway 3: AI Synthesize

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

## Pathway 3b: AI Merge Selected

**Best for:** You want to hand-pick specific suggestions, have AI merge them, and let the community vote on the result before it becomes official.

### Key difference from AI Synthesize (Pathway 3)

| | AI Synthesize | AI Merge Selected |
|---|---|---|
| **Input** | Auto-selects top suggestions by consensus | Admin manually picks which suggestions |
| **Output** | Immediately accepted as new version | Published as a new suggestion for voting |
| **Community input** | Skipped — admin decides | Community votes on the merged suggestion |

### Steps

1. Open the **Suggestion Thread** for a paragraph
2. In the **Admin Action Bar**, click **"Select to Merge"**
3. Checkboxes appear on all suggestion cards — check the ones you want to combine (minimum 2)
4. The bar shows how many are selected and a **"AI Merge Selected (N)"** button appears
5. Click **"AI Merge Selected"** — AI processes and merges the selected suggestions
6. When done, an **editable textarea** appears with the merged text:
   - **Edit** the text however you like
   - **"Show AI Reasoning"** to see why the AI made its choices
7. Click **"Publish as Suggestion"** — the merged text appears as a new AI-generated suggestion
8. The community can now **vote** on the merged suggestion alongside the original ones
9. When it gains enough consensus, you can **Accept** it via Pathway 1

### What happens on publish

- A **new suggestion** is created in the thread (marked with the "AI Synthesis" badge)
- It is attributed to the admin who created it
- It starts with **zero votes** — the community evaluates it fresh
- The original selected suggestions remain unchanged
- The real-time listener picks it up instantly — all connected users see it immediately

### When to use this instead of AI Synthesize

- When you want **community buy-in** before accepting a change
- When the suggestions are from **different perspectives** and you want voters to weigh in on the merge
- When you want to **combine specific suggestions** rather than just the top ones by consensus
- When the document topic is **sensitive** and unilateral admin acceptance would be inappropriate

---

## Pathway 4: Review Queue

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

Same as Pathway 1 (version history, promoted suggestion, reset votes, version increment) plus:
- Suggestion creator receives an **in-app notification** ("Your suggestion was approved")
- An **audit trail entry** is created

---

## Pathway 5: AI Version Generation

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
- **AI Comment Assistant** (Pathway 2) - tell suggestion authors about this! When their suggestion gets feedback, they can use AI to improve it themselves instead of waiting for an admin
- **AI Synthesize** when multiple suggestions have good ideas you want combined
- **Refinement Phase** (overflow menu) when you want the community to vote on the AI synthesis first
- **Use Pathway 4 (Review Queue)** when you want a more structured, ongoing workflow
- **Use Pathway 5 (AI Versions)** for periodic comprehensive revisions (e.g., monthly review)
- The **consensus score** reflects community agreement: higher = more net support
- Actions appear only when consensus reaches 30% — below that, the bar shows "Waiting for more community input"
- After accepting a suggestion, the community **votes again** on the new text - this creates a continuous improvement loop
- You can view **version history** for any paragraph to see how it evolved over time

---

## AI Comment Assistant — Technical Implementation

### Component Architecture

```
CommentThread.tsx (modified)
  ├── Comment[]
  ├── AIAssistBar.tsx (NEW — trigger + loading state)
  │   └── AIAssistPanel.tsx (NEW — result + editing + actions)
  └── CommentForm
```

### New Files

| File | Purpose |
|------|---------|
| `src/components/comments/AIAssistBar.tsx` | Trigger button + loading/error states |
| `src/components/comments/AIAssistBar.module.scss` | Styles (BEM: `.ai-assist-bar`) |
| `src/components/comments/AIAssistPanel.tsx` | Result display + editable textarea + actions |
| `src/components/comments/AIAssistPanel.module.scss` | Styles (BEM: `.ai-assist-panel`) |
| `src/hooks/useAICommentAssist.ts` | Hook: manages AI call state, abort controller |

### API Endpoint

```
POST /api/suggestions/:paragraphId/ai-assist
Body: { suggestionId, suggestionContent, originalParagraphContent }
Response: { improvedText: string, changes: Array<{ description: string, fromComment?: string }> }
```

The server fetches comments internally (no need to send from client). Validates the requester is the suggestion author or an admin.

### State Machine

```
idle ──[click Improve]──> loading
loading ──[success]──> complete/reviewing
loading ──[failure]──> error
loading ──[click Cancel]──> idle
error ──[click Try Again]──> loading
error ──[click Dismiss]──> idle
reviewing ──[click Apply]──> saving
reviewing ──[click Dismiss]──> idle
reviewing ──[click Regenerate]──> loading
saving ──[success]──> success ──[1.5s auto]──> idle
saving ──[failure]──> save-error
```

### Props Flow

```typescript
// Suggestion.tsx passes to CommentThread:
<CommentThread
  paragraphId={suggestion.suggestionId}
  documentId={documentId}
  // ... existing props ...
  suggestionId={suggestion.suggestionId}         // NEW
  suggestionContent={suggestion.suggestedContent} // NEW
  isSuggestionOwner={isOwner}                     // NEW
  isAdmin={isAdmin}                               // NEW
  originalParagraphContent={originalContent}       // NEW
  onSuggestionImproved={() => {}}                 // NEW callback
/>
```

### Accessibility

- **Focus management**: On trigger -> focus Cancel; on result -> focus changes region; on complete -> focus Comments toggle
- **ARIA**: `role="region"` on bar, `aria-live="polite"` on loading, `aria-live="assertive"` on success/error
- **Keyboard**: Tab order flows naturally; Escape key dismisses the panel
- **Reduced motion**: Shimmer/slide animations replaced with instant visibility when `prefers-reduced-motion: reduce`
- **High contrast**: Uses existing high-contrast CSS variable overrides

### Translation Keys

All user-facing text uses `useTranslation()`. Keys to add to all language files:

| Key | English |
|-----|---------|
| `ai-assist-cta` | "Improve your suggestion using community feedback" |
| `ai-assist-button` | "Improve" |
| `ai-assist-loading` | "Reading {{count}} comments and generating improvements..." |
| `ai-assist-cancel` | "Cancel" |
| `ai-assist-error` | "Could not generate improvements. Please try again." |
| `ai-assist-try-again` | "Try Again" |
| `ai-assist-badge` | "AI Suggestion" |
| `ai-assist-changes-title` | "Improvements based on feedback:" |
| `ai-assist-change-source` | "Based on comment by {{name}}" |
| `ai-assist-edit-label` | "Review and edit the improved text" |
| `ai-assist-apply` | "Apply Changes" |
| `ai-assist-applying` | "Applying..." |
| `ai-assist-dismiss` | "Dismiss" |
| `ai-assist-regenerate` | "Regenerate" |
| `ai-assist-success` | "Changes applied successfully" |
| `ai-assist-save-error` | "Failed to apply changes. Please try again." |

### Edge Cases

- **Comments deleted during AI processing** — AI already captured them server-side, result is still valid
- **Another user edits suggestion while reviewing** — PUT overwrites; future: add `expectedLastUpdate` conflict detection
- **AI returns no meaningful changes** — Show "No significant improvements found" message, disable Apply
- **20+ comments** — All processed, loading may take 2-5 seconds instead of 1-2
- **User collapses comments during loading** — `AbortController` cancels the fetch on unmount
