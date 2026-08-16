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
