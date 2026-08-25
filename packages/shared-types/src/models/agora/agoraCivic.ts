/**
 * Civic mode — the track an Odyssey island opens onto.
 *
 * A classroom session asks students where they stand on a two-character scale
 * and stores the answer as `campPosition`. A civic participant has already
 * answered that question, one stance at a time, back on the island: this is
 * how those answers become the same 0-100 position, so bridging works
 * identically on both tracks without asking anyone the same thing twice.
 */

/** Neutral position — what an unanswered or unanchored island resolves to. */
export const AGORA_CIVIC_CENTER_POSITION = 50;

/** The narrowest thing this needs from an evaluation doc. */
export interface CivicStanceEvaluation {
	/** The stance Statement this attitude was recorded on */
	statementId: string;
	/** Standard agree-disagree value, -1…1 */
	evaluation: number;
}

/**
 * Where a participant stands on one island, as an Agora `campPosition` (0-100).
 *
 * The island's two anchor stances are the poles. Backing the right-hand pole
 * and rejecting the left-hand one reads 100; the reverse reads 0; agreeing (or
 * disagreeing) with both equally reads 50, which is the honest answer — someone
 * who can live with either pole is not in either wing.
 *
 * An unrated anchor counts as 0 rather than dropping the participant out of the
 * scale: a player who answered one pole and skipped the other still leaned, and
 * the lean is what the camp is for. With no anchors configured at all there is
 * no scale to place them on, so they land in the centre.
 */
export function deriveCivicCampPosition(
	evaluations: ReadonlyArray<CivicStanceEvaluation>,
	leftAnchorStanceId?: string | null,
	rightAnchorStanceId?: string | null,
): number {
	if (!leftAnchorStanceId || !rightAnchorStanceId) {
		return AGORA_CIVIC_CENTER_POSITION;
	}

	const attitudeOn = (stanceId: string): number =>
		evaluations.find((e) => e.statementId === stanceId)?.evaluation ?? 0;

	// −2 (all the way left) … +2 (all the way right)
	const lean = attitudeOn(rightAnchorStanceId) - attitudeOn(leftAnchorStanceId);
	const position = Math.round(((lean + 2) / 4) * 100);

	return Math.min(100, Math.max(0, position));
}

/** What the spectrum derivation needs to know about one island stance. */
export interface CivicStanceMeta {
	statementId: string;
	/** Presentation order — the stances are AUTHORED as a spectrum from the
	 *  left pole to the right pole, which is what lets a middle stance carry
	 *  a lean of its own. */
	order?: number;
}

/**
 * Where a participant stands, read from EVERY island stance they marked —
 * not only the two poles.
 *
 * The anchor-only derivation asks "did you rate the two extremes?", and a
 * voyager who marked only middle stances answers "no" — then gets shown the
 * positioning bridge and asked to repeat what the island already recorded.
 * But the island's stances are authored as an ordered spectrum, so every
 * marked stance carries a lean: each stance gets a polarity from its order
 * relative to the anchors (left pole −1, right pole +1, middles interpolated),
 * and the position is the evaluation-weighted mean of the polarities the
 * player actually marked — supporting a stance pulls toward its pole,
 * opposing it pushes away.
 *
 * Prefers the anchors when the player marked either of them (the poles are
 * the strongest, least-inferred signal and this keeps existing standings
 * byte-identical). Returns null when there is no signal at all — no anchors
 * configured, or nothing marked — so the caller can still choose to ask.
 */
export function deriveCivicCampPositionFromIsland(
	evaluations: ReadonlyArray<CivicStanceEvaluation>,
	stances: ReadonlyArray<CivicStanceMeta>,
	leftAnchorStanceId?: string | null,
	rightAnchorStanceId?: string | null,
): number | null {
	if (!leftAnchorStanceId || !rightAnchorStanceId) return null;

	const markedAnchor = evaluations.some(
		(entry) =>
			entry.statementId === leftAnchorStanceId || entry.statementId === rightAnchorStanceId,
	);
	if (markedAnchor) {
		return deriveCivicCampPosition(evaluations, leftAnchorStanceId, rightAnchorStanceId);
	}

	const orderOf = new Map(stances.map((stance) => [stance.statementId, stance.order]));
	const leftOrder = orderOf.get(leftAnchorStanceId);
	const rightOrder = orderOf.get(rightAnchorStanceId);
	if (typeof leftOrder !== 'number' || typeof rightOrder !== 'number' || leftOrder === rightOrder) {
		return null;
	}

	let weighted = 0;
	let weight = 0;
	for (const entry of evaluations) {
		const order = orderOf.get(entry.statementId);
		if (typeof order !== 'number' || entry.evaluation === 0) continue;
		const polarity = Math.min(
			1,
			Math.max(-1, (2 * (order - leftOrder)) / (rightOrder - leftOrder) - 1),
		);
		weighted += entry.evaluation * polarity;
		weight += Math.abs(entry.evaluation);
	}
	if (weight === 0) return null;

	const lean = weighted / weight; // −1 (left pole) … +1 (right pole)

	return Math.min(100, Math.max(0, Math.round(((lean + 1) / 2) * 100)));
}
