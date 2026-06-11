Architecture & Mechanism Overview
The Goal
We are building a Dialectical Chat Platform designed to turn chaotic, emotional internet debates into structured, iterative, and constructive truth-seeking engines.

Unlike traditional flat or linear chat applications where users shout past each other, this platform forces users to strictly categorize their responses and uses AI to synthesize feedback into objectively better versions of the original statements.

1. Core UI & Interaction Mechanics
1.1 Strict Typology (The "Pill" System)
Every reply in the system must be categorized. A user cannot simply "reply"; they must choose an intent.

Standard (Gray): A neutral root statement or objective fact.
Strengthen (Green Pill): A comment that provides supporting evidence, logic, or reinforcement to the parent statement. Styled as a fully rounded pill with a green border and soft green glow.
Critique (Pink/Magenta Pill): A comment that points out flaws, counter-arguments, or edge cases in the parent statement. Styled with a dashed pink border and soft pink glow to stand out visually.
1.2 Infinite Nesting & Mobile Resilience
The UI uses recursive component rendering (MessageNode.svelte calling <svelte:self>) to allow infinite branching of debates.
A vertical thread line connects children to their parents.
Mobile Truncation: To prevent deeply nested threads from squishing off the screen on mobile devices, the UI automatically truncates nesting at Depth 2. It renders a "Continue Thread (X replies) →" button which, when tapped, pushes the user into Focus Mode.
Collapsing: Users can click "Collapse" or tap the vertical thread line to cleanly slide the entire sub-thread out of view.
1.3 Focus Mode
Users can click "Focus Thread" on any message. This transitions the entire UI into a focused view where the selected message becomes the absolute root of the screen, hiding all parallel discussions. A sticky "Back to Main Chat" header allows them to return.

2. The AI Synthesis & Revision Engine
The crown jewel of the platform is the Iterative Versioning Cycle.

2.1 AI Thread Summary
When a statement receives a significant number of critiques and strengthenings, an AI background agent (simulated in our current build) generates two things:

Thread Summary: A concise summary of the debate happening underneath the message.
Improvement Suggestion: A completely rewritten version of the original statement that incorporates the valid critiques and strengthens the weak points.
This is viewed by clicking the "✨ AI Summary" button on the message, which slides open a beautifully styled panel showing the summary and the amber-highlighted "Suggested Revision".

2.2 The "Accept Revision" Flow (Evolving Statements)
When the original author (or a moderator) clicks the "Accept Revision" button:

The message's text is instantly replaced with the improvementSuggestion.
A v2 (or subsequent version) badge appears next to the timestamp.
The Clean Slate: Because the new text explicitly addresses the old critiques, the old critiques are now "Resolved". They are stripped from the main UI, giving v2 a clean slate to receive new critiques.
2.3 The History Drawer & Time Travel
The old text and its resolved critiques are not deleted. They are moved into a "Past Versions & Resolved Debates" drawer at the bottom of the revised message.

Users can slide open this drawer to see exactly what v1 said and read the debate that forced it to evolve into v2.
A "Focus Version" button exists inside this history drawer, allowing users to enter Focus Mode on the historical snapshot, treating v1 and its old comments as a full-screen root for deep historical reading.
3. Data Structure & Backend Logic
The application uses WebSockets (Socket.io) to synchronize state instantly across all clients.

3.1 The Message Schema
javascript

{
  id: "m1",
  text: "Original statement",
  sender: "Username",
  timestamp: "ISO_STRING",
  parentId: null, // ID of parent, or null if root
  type: "standard" | "strengthen" | "critique",
  evaluations: { "userId": 1, "userId2": -0.5 }, // Voting system
  
  // AI Generated Fields
  summary: "Summary of children debates",
  improvementSuggestion: "The revised text",
  
  // Versioning
  version: 2, // Only exists if revised
  history: [
    {
      version: 1,
      text: "Original statement",
      snapshotId: "m1_v1",
      timestamp: "ISO_STRING"
    }
  ]
}
3.2 Tree Building Logic (Client-Side)
The frontend receives a flat array of all messages and builds a nested tree in MessageList.svelte.

When a revision is accepted, the server takes all messages where parentId === targetMsg.id and changes their parentId to the new snapshotId (e.g., m1_v1).
Because m1_v1 is a synthetic ID that does not exist in the root array, the standard tree-builder safely ignores these messages, effectively hiding them from the main feed.
The history-drawer uses a custom recursive builder (getHistoryChildren) that explicitly searches the flat array for messages matching the snapshotId, allowing it to render the resolved comments securely tucked away in history.