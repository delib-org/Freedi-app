import { describe, it, expect } from '@jest/globals';
import { planSideMove, shouldLockLesson } from '../classSideMovePlan';

const NOW = 1_800_000_000_000;
const ID = 'u1--main1';

describe('planSideMove', () => {
	it('copies the legacy values to a new private doc and flags the pick', () => {
		const plan = planSideMove(
			ID,
			{
				userId: 'u1',
				statementId: 'main1',
				side: 20,
				camp: 'a',
				decisionSupport: 0.5,
				lastUpdate: 123,
			},
			undefined,
			NOW,
		);
		expect(plan).toEqual({
			privateWrite: {
				userId: 'u1',
				mainId: 'main1',
				side: 20,
				camp: 'a',
				decisionSupport: 0.5,
				lastUpdate: NOW,
			},
			sidePickedAt: 123,
			dropped: 0,
		});
	});

	it('never overwrites what the newer app already wrote on the private doc', () => {
		const plan = planSideMove(
			ID,
			{ userId: 'u1', statementId: 'main1', side: 90, camp: 'b', decisionSupport: -1 },
			{ side: 10, camp: 'a', lastUpdate: 7 },
			NOW,
		);
		expect(plan?.privateWrite).toEqual({
			userId: 'u1',
			mainId: 'main1',
			decisionSupport: -1,
			lastUpdate: 7,
		});
	});

	it('writes nothing private when the private doc holds everything, but still strips', () => {
		const plan = planSideMove(
			ID,
			{ userId: 'u1', statementId: 'main1', side: 90, camp: 'b', sidePickedAt: 5 },
			{ side: 10, camp: 'a', lastUpdate: 7 },
			NOW,
		);
		expect(plan).toEqual({ privateWrite: null, sidePickedAt: null, dropped: 0 });
	});

	it('does not flag a student who only rated (no camp)', () => {
		const plan = planSideMove(
			ID,
			{ userId: 'u1', statementId: 'main1', decisionSupport: 1 },
			undefined,
			NOW,
		);
		expect(plan?.sidePickedAt).toBeNull();
		expect(plan?.privateWrite).toMatchObject({ decisionSupport: 1 });
	});

	it('drops out-of-range values and counts them', () => {
		const plan = planSideMove(
			ID,
			{ userId: 'u1', statementId: 'main1', side: 140, camp: 'left' as never, decisionSupport: 3 },
			undefined,
			NOW,
		);
		expect(plan).toEqual({ privateWrite: null, sidePickedAt: null, dropped: 3 });
	});

	it('reads the identity from the id when the fields are missing, and refuses a mismatch', () => {
		expect(
			planSideMove(ID, { side: 50, camp: 'center' }, undefined, NOW)?.privateWrite,
		).toMatchObject({
			userId: 'u1',
			mainId: 'main1',
		});
		expect(
			planSideMove(ID, { userId: 'u2', statementId: 'main1', side: 50 }, undefined, NOW),
		).toBeNull();
		expect(planSideMove('weird', { side: 50 }, undefined, NOW)).toBeNull();
	});

	it('takes a Firestore Timestamp lastUpdate as ms', () => {
		const plan = planSideMove(
			ID,
			{ userId: 'u1', statementId: 'main1', camp: 'a', lastUpdate: { toMillis: () => 42 } },
			undefined,
			NOW,
		);
		expect(plan?.sidePickedAt).toBe(42);
	});
});

describe('shouldLockLesson', () => {
	const steps = ['waiting', 'side', 'tables', 'vote', 'summary'];
	it('locks a lesson at Vote / Summary or ended, nothing else', () => {
		expect(shouldLockLesson({ steps, stepIndex: 3 })).toBe(true);
		expect(shouldLockLesson({ steps, stepIndex: 4 })).toBe(true);
		expect(shouldLockLesson({ steps, stepIndex: 1, status: 'ended' })).toBe(true);
		expect(shouldLockLesson({ steps, stepIndex: 1 })).toBe(false);
		expect(shouldLockLesson({ steps, stepIndex: 2, status: 'paused' })).toBe(false);
		expect(shouldLockLesson(undefined)).toBe(false);
	});
});
