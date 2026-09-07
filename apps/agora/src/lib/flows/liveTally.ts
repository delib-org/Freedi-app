/**
 * What the teacher can see before the server has finished counting.
 *
 * Every figure on a text — the mean, the hearts, how many weighed it — is
 * written by the trigger that aggregates the evaluations, never by a client:
 * the class and the server once counted differently, and the projector and the
 * phones disagreed about the same proposal. That rule stands. But the trigger
 * takes a round-trip, and until it lands the teacher's list says "not rated
 * yet" about texts the room has just spent a minute rating — so the teacher
 * asks a class that is working whether anything is happening.
 *
 * The evaluations themselves are direct client writes, and the teacher already
 * streams their anonymous timeline (evaluator ids, never values). That count is
 * instant. It is NOT a score and is never shown as one: it says how many
 * people have weighed in, so silence and lag look different.
 *
 * Pure: no Mithril, no Firestore.
 */

export type RowTally =
	/** Nobody has weighed this text. The list may say so plainly. */
	| { readonly state: 'none' }
	/** People have weighed it; the figure has not landed yet. */
	| { readonly state: 'counting'; readonly weighed: number }
	/** A figure is showing, and more weighings are already on their way. */
	| { readonly state: 'behind'; readonly pending: number }
	/** The figure on screen is the whole story. */
	| { readonly state: 'settled' };

/**
 * @param counted  raters in the server-written aggregate (`numberOfEvaluators`)
 * @param weighed  evaluations seen on the live timeline for this text
 */
export function tallyRow(counted: number, weighed: number): RowTally {
	const server = Math.max(0, counted);
	const live = Math.max(0, weighed);

	if (server === 0) return live === 0 ? { state: 'none' } : { state: 'counting', weighed: live };

	// live < server is normal for a moment after a retraction, and whenever the
	// timeline is trimmed — trust the server's number and say nothing.
	return live > server ? { state: 'behind', pending: live - server } : { state: 'settled' };
}

/** statementId → how many evaluations the live timeline has seen for it */
export function liveWeighings(
	timeline: Readonly<Record<string, readonly { evaluatorId: string }[]>>,
	statementIds: readonly string[],
): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const statementId of statementIds) {
		const raters = timeline[statementId] ?? [];
		// One person, one weighing — a re-rating is an update, not a second voice
		counts.set(statementId, new Set(raters.map((rater) => rater.evaluatorId)).size);
	}

	return counts;
}
