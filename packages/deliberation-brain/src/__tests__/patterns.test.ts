import { describe, expect, it } from 'vitest';
import type { ChallengeDiagnosis } from '@freedi/shared-types';
import { PATTERNS, getPattern, matchPatterns } from '../patterns';

describe('matchPatterns', () => {
	const table: Array<{ name: string; diagnosis: ChallengeDiagnosis; first: string }> = [
		{
			name: 'contested issue → bridgeContestedIssue',
			diagnosis: { decisionType: 'gatherIdeas', audienceSize: 'community', polarization: 'contested' },
			first: 'bridgeContestedIssue',
		},
		{
			name: 'hostile bridgeConflict → bridgeContestedIssue',
			diagnosis: { decisionType: 'bridgeConflict', polarization: 'hostile', audienceSize: 'public' },
			first: 'bridgeContestedIssue',
		},
		{
			name: 'allocate → budgetAllocation',
			diagnosis: { decisionType: 'allocate', audienceSize: 'community', existingOptions: ['park', 'road'] },
			first: 'budgetAllocation',
		},
		{
			name: 'team + ideas + 5 days → quickPulse',
			diagnosis: { audienceSize: 'team', desiredOutput: 'ideas', timeHorizonDays: 5, decisionType: 'gatherIdeas' },
			first: 'quickPulse',
		},
		{
			name: 'public legitimize → policyConsultation',
			diagnosis: { decisionType: 'legitimize', audienceSize: 'public', desiredOutput: 'decision' },
			first: 'policyConsultation',
		},
		{
			name: 'team choose decision → visionStrategy',
			diagnosis: { decisionType: 'choose', audienceSize: 'team', desiredOutput: 'decision', timeHorizonDays: 30 },
			first: 'visionStrategy',
		},
		{
			name: 'community gatherIdeas → widenConvergeDecide',
			diagnosis: { decisionType: 'gatherIdeas', audienceSize: 'community', facilitationCapacity: 'canRunRoom' },
			first: 'widenConvergeDecide',
		},
	];

	it.each(table)('$name', ({ diagnosis, first }) => {
		const matches = matchPatterns(diagnosis);
		expect(matches[0].pattern.patternId).toBe(first);
		expect(matches[0].score).toBeGreaterThan(0);
		expect(matches[0].reasons.length).toBeGreaterThan(0);
	});

	it('returns the generic patterns first with no diagnosis', () => {
		const matches = matchPatterns(undefined);
		expect(matches).toHaveLength(3);
		expect(matches[0].pattern.patternId).toBe('widenConvergeDecide');
		expect(matches.every((match) => match.score === 0)).toBe(true);
	});

	it('returns the generic patterns first with an empty diagnosis', () => {
		expect(matchPatterns({})[0].pattern.patternId).toBe('widenConvergeDecide');
	});

	it('sorts descending and respects the limit', () => {
		const matches = matchPatterns({ polarization: 'contested', decisionType: 'allocate' }, 6);
		expect(matches).toHaveLength(PATTERNS.length);
		for (let i = 1; i < matches.length; i += 1) {
			expect(matches[i - 1].score).toBeGreaterThanOrEqual(matches[i].score);
		}
	});
});

describe('PATTERNS', () => {
	it('has six patterns with unique ids and 1–4 steps each', () => {
		expect(PATTERNS).toHaveLength(6);
		const ids = new Set(PATTERNS.map((pattern) => pattern.patternId));
		expect(ids.size).toBe(6);
		for (const pattern of PATTERNS) {
			expect(pattern.sequence.length).toBeGreaterThanOrEqual(1);
			expect(pattern.sequence.length).toBeLessThanOrEqual(4);
			expect(pattern.risks.length).toBeGreaterThan(0);
			expect(pattern.successSignals.length).toBeGreaterThan(0);
		}
	});

	it('getPattern finds by id', () => {
		expect(getPattern('quickPulse')?.name).toBe('Quick pulse');
		expect(getPattern('nope')).toBeUndefined();
	});

	it('bridgeContestedIssue frames the survey around needs', () => {
		const bridge = getPattern('bridgeContestedIssue');
		expect(bridge?.sequence[0].questionTemplate).toMatch(/need/i);
		expect(bridge?.sequence[0].survey?.minEvaluationsPerQuestion).toBe(5);
		expect(bridge?.rationale).toMatch(/variance/i);
	});
});
