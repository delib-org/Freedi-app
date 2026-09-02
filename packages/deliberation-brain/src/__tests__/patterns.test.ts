import { describe, expect, it } from 'vitest';
import type { ChallengeDiagnosis } from '@freedi/shared-types';
import { DEFAULT_PATTERN_ID, PATTERNS, getPattern, matchPatterns } from '../patterns';

describe('matchPatterns', () => {
	const table: Array<{ name: string; diagnosis: ChallengeDiagnosis; first: string }> = [
		{
			name: 'a text exists → draftFirstAgreement',
			diagnosis: { hasDraft: 'text', decisionBody: 'assembly', audienceSize: 'community', decisionType: 'gatherIdeas' },
			first: 'draftFirstAgreement',
		},
		{
			name: 'nothing written → questionFirstAgreement',
			diagnosis: { hasDraft: 'nothing', decisionType: 'gatherIdeas', audienceSize: 'community', facilitationCapacity: 'none' },
			first: 'questionFirstAgreement',
		},
		{
			name: 'material but no text → materialFirstAgreement',
			diagnosis: { hasDraft: 'material', desiredOutput: 'agreedText', audienceSize: 'community' },
			first: 'materialFirstAgreement',
		},
		{
			name: 'contested issue → bridgeContestedIssue',
			diagnosis: { hasDraft: 'nothing', decisionType: 'gatherIdeas', audienceSize: 'community', polarization: 'contested' },
			first: 'bridgeContestedIssue',
		},
		{
			name: 'hostile bridgeConflict → bridgeContestedIssue',
			diagnosis: { decisionType: 'bridgeConflict', polarization: 'hostile', audienceSize: 'public', hasDraft: 'text' },
			first: 'bridgeContestedIssue',
		},
		{
			name: 'allocate → budgetAllocation',
			diagnosis: { decisionType: 'allocate', audienceSize: 'community', existingOptions: ['park', 'road'], hasDraft: 'nothing' },
			first: 'budgetAllocation',
		},
		{
			name: 'team + ideas + 5 days → quickPulse',
			diagnosis: { audienceSize: 'team', desiredOutput: 'ideas', timeHorizonDays: 5, decisionType: 'gatherIdeas' },
			first: 'quickPulse',
		},
		{
			name: 'vision folded in: choose + council + text → draftFirstAgreement',
			diagnosis: { decisionType: 'choose', decisionBody: 'council', hasDraft: 'text', desiredOutput: 'decision' },
			first: 'draftFirstAgreement',
		},
	];

	it.each(table)('$name', ({ diagnosis, first }) => {
		const matches = matchPatterns(diagnosis);
		expect(matches[0].pattern.patternId).toBe(first);
		expect(matches[0].score).toBeGreaterThan(0);
		expect(matches[0].reasons.length).toBeGreaterThan(0);
	});

	it('returns the entry-rule patterns first with no diagnosis (question-first is the default)', () => {
		const matches = matchPatterns(undefined);
		expect(matches).toHaveLength(3);
		expect(matches.map((match) => match.pattern.patternId)).toEqual([
			'questionFirstAgreement',
			'draftFirstAgreement',
			'materialFirstAgreement',
		]);
		expect(matches.every((match) => match.score === 0)).toBe(true);
		expect(DEFAULT_PATTERN_ID).toBe('questionFirstAgreement');
	});

	it('returns the default first with an empty diagnosis', () => {
		expect(matchPatterns({})[0].pattern.patternId).toBe('questionFirstAgreement');
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
	it('has six patterns with unique ids and 1–5 steps each', () => {
		expect(PATTERNS).toHaveLength(6);
		const ids = new Set(PATTERNS.map((pattern) => pattern.patternId));
		expect(ids.size).toBe(6);
		for (const pattern of PATTERNS) {
			expect(pattern.sequence.length).toBeGreaterThanOrEqual(1);
			expect(pattern.sequence.length).toBeLessThanOrEqual(5);
			expect(pattern.risks.length).toBeGreaterThan(0);
			expect(pattern.successSignals.length).toBeGreaterThan(0);
		}
	});

	it('no retired pattern survives', () => {
		for (const retired of ['widenConvergeDecide', 'visionStrategy', 'policyConsultation']) {
			expect(getPattern(retired)).toBeUndefined();
		}
	});

	it('every multi-step process ends with decide/ratify, comments before converging, and drafts documents from earlier steps', () => {
		for (const pattern of PATTERNS) {
			const steps = pattern.sequence;
			if (steps.length === 1) continue;
			expect(['decide', 'ratify'], pattern.patternId).toContain(steps[steps.length - 1].role);
			const firstLive = steps.findIndex((step) => step.engine === 'liveSession');
			const firstComment = steps.findIndex((step) => step.engine === 'document');
			if (firstLive >= 0) expect(firstComment, pattern.patternId).toBeLessThan(firstLive);
			steps.forEach((step, index) => {
				if (step.engine !== 'document') {
					expect(step.draftFrom, `${pattern.patternId}#${index}`).toBeUndefined();

					return;
				}
				for (const source of step.draftFrom ?? []) expect(source, `${pattern.patternId}#${index}`).toBeLessThan(index);
				if (step.draftFrom || step.draftFromExisting) expect(step.openNow, `${pattern.patternId}#${index}`).toBe(false);
			});
		}
	});

	it('draftFirstAgreement opens the existing text now and runs one room per segment', () => {
		const pattern = getPattern('draftFirstAgreement')!;
		expect(pattern.sequence[0]).toMatchObject({ engine: 'document', role: 'comment', openNow: true });
		expect(pattern.sequence[1]).toMatchObject({ engine: 'liveSession', role: 'converge', perSegment: true });
		expect(pattern.sequence[2].draftFrom).toEqual([1]);
	});

	it('questionFirstAgreement skips the second comment round under three weeks', () => {
		const pattern = getPattern('questionFirstAgreement')!;
		expect(pattern.sequence[0].engine).toBe('crowdSurvey');
		expect(pattern.sequence[1].draftFrom).toEqual([0]);
		expect(pattern.sequence[2].skipWhen).toEqual({ field: 'timeHorizonDays', below: 21 });
	});

	it('materialFirstAgreement drafts from the existing activities and makes the room optional', () => {
		const pattern = getPattern('materialFirstAgreement')!;
		expect(pattern.sequence[0].draftFromExisting).toBe(true);
		expect(pattern.sequence[1].skipWhen).toEqual({ field: 'facilitationCapacity', oneOf: ['none'] });
	});

	it('bridgeContestedIssue frames the survey around needs', () => {
		const bridge = getPattern('bridgeContestedIssue')!;
		expect(bridge.sequence[0].questionTemplate).toMatch(/need/i);
		expect(bridge.sequence[0].survey?.minEvaluationsPerQuestion).toBe(5);
		expect(bridge.rationale).toMatch(/variance/i);
		expect(bridge.sequence.map((step) => step.engine)).toEqual(['crowdSurvey', 'document', 'liveSession', 'document', 'discussion']);
	});

	it('quickPulse is one survey and ends without a document', () => {
		const pulse = getPattern('quickPulse')!;
		expect(pulse.sequence).toHaveLength(1);
		expect(pulse.sequence[0].engine).toBe('crowdSurvey');
	});
});
