/**
 * The fixed prose of the baseline report: how each number is obtained and what
 * the emulators cannot show. Kept apart from report.ts so the arithmetic stays
 * readable.
 */
import type { RunResult } from './baseline';

export function renderMethod(full: RunResult, small: RunResult): string {
	return `## How to read these numbers

**measured** means counted during the run. **derived** means a measured number multiplied up, and the note says by what.

- **Function reads and writes (measured).** \`scripts/scale/trace-shim.cjs\` is preloaded into every functions emulator worker. It wraps the Admin SDK's query, document-read and commit calls and logs documents per invocation, so "docs read per rating" and "question doc writes" are exact counts, with no change to application code. A query returning nothing counts as one read, as Firestore bills it. Retried transactions count again, as Firestore bills them.
- **Client downloads (measured on a sample).** ${full.config.sampleClients} real client-SDK connections sign in anonymously through the Auth emulator and run the app's own query shapes, under the real security rules. Documents counted are \`docChanges()\` per listener, or the result size of one-shot reads. Sources: \`useStatementListeners\`, \`listenToSubStatements\` (head start of 10, then newest 30), \`useOnlineUsers\` (off for large questions), \`getQuestionProgress\`, \`useAnswerBatch\` (the \`getAnswerBatch\` callable, above 30 answers) and \`fetchTopAnswers\`.
- **Multiplying up (derived).** Per-participant counts are multiplied by 1,000, and a write's fan-out is writes x listeners. The sample shows each listener receives each write; it does not run 1,000 sockets.
- **Exposure.** Up to 30 answers the query is real and asked at each simulated arrival; above that each person rates the batches the server's sampler picks, with the same code and inputs, and the callable itself is measured separately. Arrival order and ${full.config.ratingsPerMember} ratings each are a model.
- **Pacing.** Trigger-firing writes go ${'in batches of 5'}, waiting for the emulator to go quiet between batches, so a backlog does not swamp the counts. The \`rate-simultaneous\` phase is the exception: its ratings land at once.
- **Rating model.** Burst raters are returning participants (already counted) who rate one card each, rotating across the newest 30 with mixed values (+1 to -1). The \`rate-first-time\` phase measures a person's first rating separately, which also moves the evaluator counters. How often a rating changes the top results depends on the rating pattern, so that part of the question-document cost is model-dependent. Ratings on answers outside the newest 30 deliver no answer document to anyone. Above 30 answers a burst rater's card comes from the sampler over answers not yet stable (a mid-session rating), so ratings spread across all answers instead of the newest 30. Once every answer is stable (30 ratings each here) the sampler offers nothing more.
- **Seeding** runs with background triggers disabled, then the question's counters are written directly so the burst meets a realistic question. Burst phases run with triggers on, after one warm-up action of each kind whose cost is not counted.

## What this baseline cannot show

- **Billing.** The emulator does not bill. Counts mirror the billing rules, but index-entry reads for aggregations, listener resume costs and offline-cache hits are not modelled.
- **Real concurrency.** Workers on one machine, run ${full.config.burst.simultaneousRatings} at most in the simultaneous phase. No per-document write-rate limits; the emulator's transaction locking is pessimistic, unlike production's optimistic retries. So contention on the question document under real load is not visible here.
- **Cold starts and instance behaviour.** Workers are warmed first and never freeze after returning. So a fire-and-forget write always finishes here, and "credits complete" proves little. What it can show is how many credit writes land after the trigger returned: those are the ones at risk in production. Per-instance caches (the 30 s cache for plan item 3.5) are not exercised.
- **Listeners at full scale.** ${full.config.sampleClients} listeners, not 1,000. Coalescing of snapshots and delivery latency under 1,000 sockets are unknown.
- **Durations** are local and useful only for comparing triggers within one run.
- **Excluded on purpose.** AI, email and Sentry traffic: \`functions/.env.local\` blanks the keys during the run and turns live synthesis off, so live-synthesis and embedding-generation costs are not included. Push sends are not exercised (seeded subscribers hold no tokens); in-app notification writes are.
- **Not sampled on open.** The four demographic listeners (questions and answers, statement and group) and \`listenToInAppNotifications\`. On a question with no demographic survey each costs about one read.

## Growth with size

The "small" column is ${small.config.members} subscribers and ${small.config.answers} answers against ${full.config.members} and ${full.config.answers}. Compare the two columns above: costs that scale with answers or subscribers change between them; per-action costs that do not depend on size stay flat.

## Rerun

\`\`\`bash
npm run scale:baseline
\`\`\`

It regenerates this file (or, with \`SCALE_REPORT_NAME\`, a file under that name) and \`main-1000-baseline.data.json\`. Compare with \`git diff\`. It needs the functions built (\`npm --prefix functions run build\`) and ports 9119, 8101, 5021, 5022 and 4420 free.`;
}
