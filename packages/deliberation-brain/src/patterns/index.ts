import type { ChallengeDiagnosis } from '@freedi/shared-types';
import type { DeliberationPattern, PatternMatch, PatternPredicate } from '../types';
import { questionFirstAgreement } from './questionFirstAgreement';
import { draftFirstAgreement } from './draftFirstAgreement';
import { materialFirstAgreement } from './materialFirstAgreement';
import { bridgeContestedIssue } from './bridgeContestedIssue';
import { budgetAllocation } from './budgetAllocation';
import { quickPulse } from './quickPulse';

/**
 * The playbook (PLAYBOOK.md §3). Order matters: with an empty diagnosis every
 * pattern scores 0 and the sort is stable, so the entry-rule patterns come
 * first (question-first is the default: nothing written yet).
 */
export const PATTERNS: readonly DeliberationPattern[] = [
	questionFirstAgreement,
	draftFirstAgreement,
	materialFirstAgreement,
	bridgeContestedIssue,
	budgetAllocation,
	quickPulse,
];

export const DEFAULT_PATTERN_ID = questionFirstAgreement.patternId;

export function getPattern(patternId: string): DeliberationPattern | undefined {
	return PATTERNS.find((pattern) => pattern.patternId === patternId);
}

function predicateMatches(predicate: PatternPredicate, diagnosis: ChallengeDiagnosis): boolean {
	const value = diagnosis[predicate.field];
	if (value === undefined || value === null) return false;
	if (Array.isArray(value) && value.length === 0) return false;
	if (predicate.max !== undefined) {
		return typeof value === 'number' && value <= predicate.max;
	}
	if (predicate.oneOf) {
		return typeof value === 'string' && predicate.oneOf.includes(value);
	}

	return true;
}

/** Scores every pattern against the diagnosis; sorted by score desc (stable). */
export function matchPatterns(
	diagnosis: ChallengeDiagnosis | undefined,
	limit = 3,
): PatternMatch[] {
	const matches: PatternMatch[] = PATTERNS.map((pattern) => {
		if (!diagnosis) return { pattern, score: 0, reasons: [] };
		let score = 0;
		const reasons: string[] = [];
		for (const predicate of pattern.applicability) {
			if (predicateMatches(predicate, diagnosis)) {
				score += predicate.weight;
				if (predicate.note) reasons.push(predicate.note);
			}
		}

		return { pattern, score, reasons };
	});
	matches.sort((a, b) => b.score - a.score);

	return matches.slice(0, Math.max(0, limit));
}

export {
	questionFirstAgreement,
	draftFirstAgreement,
	materialFirstAgreement,
	bridgeContestedIssue,
	budgetAllocation,
	quickPulse,
};
