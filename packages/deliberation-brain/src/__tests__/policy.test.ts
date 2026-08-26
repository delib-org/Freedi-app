import { describe, expect, it } from 'vitest';
import { nextMove } from '../policy';
import { makeCtx, plan } from './helpers';

describe('nextMove', () => {
	it('turn 0 with an empty diagnosis → askClarifying with the top 2 critical fields', () => {
		const move = nextMove(makeCtx({ userTurns: 0 }));
		expect(move.move).toBe('askClarifying');
		expect(move.askFields).toEqual(['decisionType', 'audienceSize']);
	});

	it('low confidence counts as missing', () => {
		const move = nextMove(
			makeCtx({
				userTurns: 0,
				diagnosis: {
					decisionType: 'gatherIdeas',
					audienceSize: 'community',
					confidence: { decisionType: 0.3 },
				},
			}),
		);
		expect(move.move).toBe('askClarifying');
		expect(move.askFields[0]).toBe('decisionType');
	});

	it('proposes when the critical fields are known even on turn 0', () => {
		const move = nextMove(
			makeCtx({
				userTurns: 0,
				diagnosis: {
					decisionType: 'gatherIdeas',
					audienceSize: 'community',
					hardDeadline: '2030-01-01',
					polarization: 'low',
					facilitationCapacity: 'none',
					desiredOutput: 'ideas',
				},
			}),
		);
		expect(move.move).toBe('propose');
		expect(move.askFields).toEqual([]);
	});

	it('turn 2 with no plan → propose regardless of missing fields (≤ 2 asks ride along)', () => {
		const move = nextMove(makeCtx({ userTurns: 2 }));
		expect(move.move).toBe('propose');
		expect(move.askFields.length).toBeLessThanOrEqual(2);
	});

	it('turn 3 with a clean plan → confirm', () => {
		const move = nextMove(makeCtx({ userTurns: 3, currentPlan: plan() }));
		expect(move.move).toBe('confirm');
		expect(move.askFields).toEqual([]);
	});

	it('problems on the current plan → revise', () => {
		const move = nextMove(makeCtx({ userTurns: 5, currentPlan: plan(), problems: ['Nudge without message'] }));
		expect(move.move).toBe('revise');
	});

	it('plan exists early in the conversation → revise (mid-negotiation)', () => {
		expect(nextMove(makeCtx({ userTurns: 1, currentPlan: plan() })).move).toBe('revise');
	});
});
