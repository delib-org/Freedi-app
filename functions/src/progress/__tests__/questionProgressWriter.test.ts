import { Collections, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from './fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../../db', () => ({
	get db() {
		return fake.db;
	},
}));

import { clearProgressCache, recordParticipation, touchActivity } from '../questionProgressWriter';
import { recordSuggestionProgress } from '../statementCreationHook';

const Q = 'question-1';
const TOP = 'group-1';
const UID = 'user-1';

beforeEach(() => {
	fake = createFakeDb();
	clearProgressCache();
	fake.seed(Collections.statements, TOP, {
		statementId: TOP,
		topParentId: TOP,
		organizationId: 'org-1',
	});
	fake.seed(Collections.statements, Q, { statementId: Q, topParentId: TOP });
});

describe('recordParticipation', () => {
	it('flips the unique marker once and always counts the event', async () => {
		await recordParticipation({
			statementId: Q,
			topParentId: TOP,
			userId: UID,
			kind: 'evaluated',
			eventCounter: 'evaluations',
			now: 1000,
		});

		const first = fake.read(Collections.questionProgress, Q);
		expect(first).toMatchObject({
			statementId: Q,
			topParentId: TOP,
			organizationId: 'org-1',
			entered: 0,
			suggested: 0,
			evaluated: 1,
			options: 0,
			evaluations: 1,
			lastActivity: 1000,
		});
		expect(fake.read(Collections.questionParticipation, `${Q}--${UID}`)).toEqual({
			statementId: Q,
			userId: UID,
			evaluated: true,
		});

		await recordParticipation({
			statementId: Q,
			topParentId: TOP,
			userId: UID,
			kind: 'evaluated',
			eventCounter: 'evaluations',
			now: 2000,
		});

		const second = fake.read(Collections.questionProgress, Q);
		expect(second?.evaluated).toBe(1);
		expect(second?.evaluations).toBe(2);
		expect(second?.lastActivity).toBe(2000);
	});

	it('bumps lastActivity on the top parent without creating counters there', async () => {
		await recordParticipation({
			statementId: Q,
			topParentId: TOP,
			userId: UID,
			kind: 'entered',
			now: 5,
		});

		expect(fake.read(Collections.questionProgress, TOP)).toEqual({
			statementId: TOP,
			topParentId: TOP,
			organizationId: 'org-1',
			lastActivity: 5,
			lastUpdate: 5,
		});
	});

	it('resolves topParentId and organizationId from Firestore when omitted', async () => {
		await recordParticipation({
			statementId: Q,
			userId: UID,
			kind: 'suggested',
			eventCounter: 'options',
		});

		expect(fake.read(Collections.questionProgress, Q)).toMatchObject({
			topParentId: TOP,
			organizationId: 'org-1',
			suggested: 1,
			options: 1,
		});
	});

	it('ignores the "top" sentinel', async () => {
		await recordParticipation({ statementId: 'top', userId: UID, kind: 'entered' });
		expect(fake.store.get(Collections.questionProgress)).toBeUndefined();
	});
});

describe('touchActivity', () => {
	it('merges lastActivity onto the statement and its top parent', async () => {
		await touchActivity({ statementId: Q, topParentId: TOP, now: 42 });
		expect(fake.read(Collections.questionProgress, Q)).toMatchObject({ lastActivity: 42 });
		expect(fake.read(Collections.questionProgress, TOP)).toMatchObject({ lastActivity: 42 });
	});
});

describe('recordSuggestionProgress', () => {
	const base = {
		statementId: 'opt-1',
		parentId: Q,
		topParentId: TOP,
		creatorId: UID,
		creator: { uid: UID, displayName: 'U' },
		statementType: StatementType.option,
		createdAt: 77,
	};

	it('counts a genuine option as a suggestion', async () => {
		await recordSuggestionProgress(base as never);
		expect(fake.read(Collections.questionProgress, Q)).toMatchObject({ suggested: 1, options: 1 });
	});

	it('only bumps activity for derived options', async () => {
		await recordSuggestionProgress({ ...base, isCluster: true } as never);
		const progress = fake.read(Collections.questionProgress, Q);
		expect(progress?.suggested).toBeUndefined();
		expect(progress?.lastActivity).toBe(77);
	});

	it('only bumps activity for non-option children', async () => {
		await recordSuggestionProgress({ ...base, statementType: StatementType.comment } as never);
		expect(fake.read(Collections.questionProgress, Q)?.suggested).toBeUndefined();
		expect(fake.read(Collections.questionProgress, TOP)?.lastActivity).toBe(77);
	});
});
