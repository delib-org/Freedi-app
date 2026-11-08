import { createAgoraCharacterReviewId, type AgoraCharacterReview } from '@freedi/shared-types';
import type { CastMember } from './scenarioCast';

/**
 * A character's existing AI verdict on a proposal, as the council's board
 * draws it: a portrait tile, a score, one line. The words are the review the
 * class already asked for ("show it to the Count") — never newly generated,
 * and it carries a proposal's NUMBER, never a student's name.
 */
export interface CouncilVoice {
	name: string;
	portraitUrl?: string;
	/** How acceptable the proposal is to this character, 0-100 */
	score: number;
	line: string;
}

const LINE_MAX = 78;

/** The first sentence of a verdict, trimmed to fit a tile */
export function verdictLine(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	const end = flat.search(/[.!?…](\s|$)/);
	const first = end > 0 ? flat.slice(0, end + 1) : flat;

	return first.length <= LINE_MAX ? first : `${first.slice(0, LINE_MAX - 1).trimEnd()}…`;
}

/** Up to one tile per character that has actually reviewed this proposal */
export function councilVoices(
	statementId: string,
	cast: readonly CastMember[],
	reviews: Readonly<Record<string, AgoraCharacterReview>>,
): CouncilVoice[] {
	return cast.flatMap((member) => {
		const review = reviews[createAgoraCharacterReviewId(statementId, member.characterId)];
		if (!review || review.verdictText.trim().length === 0) return [];

		return [
			{
				name: member.name,
				portraitUrl: member.portraitUrl,
				score: Math.round(review.acceptanceScore),
				line: verdictLine(review.verdictText),
			},
		];
	});
}
