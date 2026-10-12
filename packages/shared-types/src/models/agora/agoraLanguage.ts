import { AGORA_POINTS } from './agoraConstants';
import type { AgoraParticipant, AgoraPoints } from './agoraParticipant';

/**
 * Where a refused text was being written. Stored on the thread line as a
 * plain optional string (not a picklist in the schema) so a place added
 * later never makes an older console drop the whole line.
 */
export const AGORA_LANGUAGE_PLACES = ['note', 'answer', 'improvement', 'chat'] as const;
export type AgoraLanguagePlace = (typeof AGORA_LANGUAGE_PLACES)[number];

export function isAgoraLanguagePlace(value: unknown): value is AgoraLanguagePlace {
	return typeof value === 'string' && (AGORA_LANGUAGE_PLACES as readonly string[]).includes(value);
}

/** What one refused text does to the participant doc — the fields to write */
export interface LanguageStrikeOutcome {
	points: AgoraPoints;
	languageStrikes: number;
	lastLanguageStrikeAt: number;
	/** Coins actually taken: the penalty, or whatever was left above zero */
	deducted: number;
}

/**
 * The language strike, as arithmetic. Shared so the callable that charges it
 * and any screen that explains it agree on the one number — the same reason
 * every other point the student sees is computed here and not in a view.
 *
 * Floors at 0 like every balance in the game: a penalty that could go
 * negative would tax the lesson's future work, and a student with nothing
 * left still has the strike counted against them where the teacher looks.
 */
export function applyLanguageStrike(
	participant: Pick<AgoraParticipant, 'points' | 'languageStrikes'>,
	now: number,
): LanguageStrikeOutcome {
	const total = Math.max(0, participant.points.total);
	const deducted = Math.min(AGORA_POINTS.LANGUAGE_PENALTY, total);
	const points: AgoraPoints = {
		...participant.points,
		penalties: (participant.points.penalties ?? 0) + deducted,
		total: total - deducted,
	};

	return {
		points,
		languageStrikes: (participant.languageStrikes ?? 0) + 1,
		lastLanguageStrikeAt: now,
		deducted,
	};
}
