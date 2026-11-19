import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Statement } from '@freedi/shared-types';

/**
 * Trello btMVQMM5: the side goes to the private classSides doc (the flag on the
 * first pick, same batch), and nothing is written once the lesson is at Vote or
 * Summary, where the rules freeze the sides.
 */

const fb = vi.hoisted(() => ({
	batchSet: vi.fn(),
	batchUpdate: vi.fn(),
	commit: vi.fn(() => Promise.resolve()),
	setDoc: vi.fn(() => Promise.resolve()),
	getDoc: vi.fn(),
	main: null as Statement | null,
}));

vi.mock('../../firebase', () => ({
	db: {},
	doc: (_db: unknown, ...path: string[]) => path.join('/'),
	getDoc: fb.getDoc,
	setDoc: fb.setDoc,
	updateDoc: vi.fn(() => Promise.resolve()),
	writeBatch: () => ({ set: fb.batchSet, update: fb.batchUpdate, commit: fb.commit }),
}));
vi.mock('../../store', () => ({
	getMainStatement: () => fb.main,
	getCustomDisplayName: () => 'Dana',
}));
vi.mock('../../user', () => ({ getUserState: () => ({ user: { uid: 'u1', isAnonymous: true } }) }));
vi.mock('../../sentry', () => ({ captureException: vi.fn() }));

import { setMyDecisionSupport, setMySide } from '../studentWrites';

const STEPS = ['waiting', 'opening', 'side', 'tables', 'vote', 'summary'];

function lessonAt(step: string): Statement {
	return {
		statementId: 'm',
		statementSettings: { lessonPlan: { steps: STEPS, stepIndex: STEPS.indexOf(step) } },
	} as unknown as Statement;
}

function subscription(extra: object = {}): void {
	fb.getDoc.mockResolvedValue({
		exists: () => true,
		data: () => ({ userId: 'u1', statementId: 'm', user: { displayName: 'Dana' }, ...extra }),
	});
}

describe('setMySide', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		subscription();
	});

	it('writes side and camp on the private doc and flags the first pick in the same batch', async () => {
		fb.main = lessonAt('side');
		await setMySide('m', 22.4);
		expect(fb.batchSet).toHaveBeenCalledWith(
			'classSides/u1--m',
			expect.objectContaining({ userId: 'u1', mainId: 'm', side: 22, camp: 'a' }),
			{ merge: true },
		);
		expect(fb.batchUpdate).toHaveBeenCalledWith('statementsSubscribe/u1--m', {
			sidePickedAt: expect.any(Number),
		});
		expect(fb.commit).toHaveBeenCalledTimes(1);
	});

	it('does not touch the subscription again once it carries the flag', async () => {
		fb.main = lessonAt('side');
		subscription({ sidePickedAt: 5 });
		await setMySide('m', 80);
		expect(fb.batchUpdate).not.toHaveBeenCalled();
	});

	it('writes nothing at Vote or Summary', async () => {
		for (const step of ['vote', 'summary']) {
			fb.main = lessonAt(step);
			await setMySide('m', 80);
		}
		expect(fb.batchSet).not.toHaveBeenCalled();
		expect(fb.commit).not.toHaveBeenCalled();
	});
});

describe('setMyDecisionSupport', () => {
	it('still writes at Summary, on the private doc only', async () => {
		vi.clearAllMocks();
		subscription();
		fb.main = lessonAt('summary');
		await setMyDecisionSupport('m', 2);
		expect(fb.setDoc).toHaveBeenCalledWith(
			'classSides/u1--m',
			expect.objectContaining({ decisionSupport: 1 }),
			{ merge: true },
		);
	});
});
