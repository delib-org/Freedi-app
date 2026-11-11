import { PARTICIPATION } from '@/constants/common';

/**
 * What participants may see of a question's group progress. Hosts read raw
 * counts elsewhere, which is why this lives outside the atom.
 *
 * A count stays hidden below the k-anonymity floor: in a small group "2 people
 * rated" can identify someone, and a low number tells people nobody cares.
 */

export interface PublicParticipation {
	suggested?: number;
	evaluated?: number;
}

function atOrAboveFloor(count: number): number | undefined {
	return count >= PARTICIPATION.MIN_PUBLIC_COUNT ? count : undefined;
}

export function toPublicParticipation(counts: {
	suggested: number;
	evaluated: number;
}): PublicParticipation {
	return {
		suggested: atOrAboveFloor(counts.suggested),
		evaluated: atOrAboveFloor(counts.evaluated),
	};
}

/**
 * The count for "took part in this decision", or undefined below the floor.
 * The larger of the two is used because the union of the two groups is not
 * stored, and the larger one is the honest lower bound.
 */
export function publicDecidedCount(counts: {
	suggested: number;
	evaluated: number;
}): number | undefined {
	return atOrAboveFloor(Math.max(counts.suggested, counts.evaluated));
}

/** Whether a fresh read is due, given when the last one started. */
export function shouldRefreshProgress(lastFetchedAt: number, now: number): boolean {
	return now - lastFetchedAt >= PARTICIPATION.PROGRESS_REFRESH_MS;
}

export function formatCompactCount(value: number, locale: string): string {
	try {
		return new Intl.NumberFormat(locale, {
			notation: 'compact',
			maximumFractionDigits: 1,
		}).format(value);
	} catch {
		return String(value);
	}
}
