/**
 * What is left of the round's client-side deal.
 *
 * The deal itself — which classmates' texts a reader gets — used to be
 * computed here and frozen in sessionStorage. It now lives on the server
 * (`agoraDealNotes` → `agoraHands`), where it can grow as late texts arrive
 * and be balanced across the class; the view reads it through lib/hands.ts
 * and lib/flows/handFlow.ts. The square's rule survives there: a stored
 * hand is kept intact and newcomers append, so a list never reshuffles
 * under a reading finger.
 */

/** How many of the dealt texts I have weighed */
export function roundRatedCount(deal: readonly string[], rated: ReadonlySet<string>): number {
	return deal.filter((statementId) => rated.has(statementId)).length;
}
