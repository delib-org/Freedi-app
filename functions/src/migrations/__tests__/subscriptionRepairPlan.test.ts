import {
	assessSubscription,
	buildRepairPatch,
	emptyRepairCounts,
	formatRepairReport,
	statementDateMillis,
	toMillis,
} from '../subscriptionRepairPlan';

const ID = 'u1--s1';
const own = { uid: 'u1', displayName: 'Host' };
const base = { userId: 'u1', statementId: 's1', role: 'admin' };

describe('assessSubscription', () => {
	it('leaves a dated doc holding its own person alone', () => {
		expect(assessSubscription(ID, { ...base, createdAt: 5, user: own })).toEqual({
			kind: 'current',
			hasNonNumberCreatedAt: false,
		});
	});

	it('wants createdAt when it is missing', () => {
		expect(assessSubscription(ID, { ...base, user: own })).toEqual({
			kind: 'repair',
			needsCreatedAt: true,
			needsUser: false,
			hasNonNumberCreatedAt: false,
		});
	});

	it('wants user when it holds somebody else, even with a date', () => {
		expect(
			assessSubscription(ID, { ...base, createdAt: 5, user: { uid: 'creator' } }),
		).toMatchObject({ kind: 'repair', needsCreatedAt: false, needsUser: true });
	});

	it('wants user when it has none', () => {
		expect(assessSubscription(ID, { ...base, createdAt: 5 })).toMatchObject({
			kind: 'repair',
			needsUser: true,
		});
	});

	it('wants both on the server shape of an inherited host', () => {
		expect(assessSubscription(ID, { ...base, user: { uid: 'creator' } })).toMatchObject({
			kind: 'repair',
			needsCreatedAt: true,
			needsUser: true,
		});
	});

	it.each([
		['a Timestamp', { seconds: 1 }],
		['a string', '2020'],
		['null', null],
	])('leaves a createdAt that is %s alone, and flags it', (_name, createdAt) => {
		expect(assessSubscription(ID, { ...base, createdAt, user: own })).toEqual({
			kind: 'current',
			hasNonNumberCreatedAt: true,
		});
		expect(assessSubscription(ID, { ...base, createdAt, user: { uid: 'x' } })).toMatchObject({
			kind: 'repair',
			needsCreatedAt: false,
			needsUser: true,
			hasNonNumberCreatedAt: true,
		});
	});

	it('never repairs a doc whose id disagrees with its fields', () => {
		expect(assessSubscription('evil--s1', base)).toEqual({ kind: 'id-mismatch' });
		expect(assessSubscription(ID, { statementId: 's1' })).toEqual({ kind: 'id-mismatch' });
		expect(assessSubscription(ID, { userId: 'u1', statementId: 'other' })).toEqual({
			kind: 'id-mismatch',
		});
	});

	it('is idempotent: applying its own patch makes the doc current', () => {
		const data = { ...base, user: { uid: 'creator' } };
		const assessment = assessSubscription(ID, data);
		if (assessment.kind !== 'repair') throw new Error('expected a repair');
		const patch = buildRepairPatch(assessment, 7, own);

		expect(assessSubscription(ID, { ...data, ...patch }).kind).toBe('current');
	});
});

describe('toMillis', () => {
	it('takes positive numbers', () => {
		expect(toMillis(1700000000000)).toBe(1700000000000);
		expect(toMillis(0)).toBeUndefined();
		expect(toMillis(Number.NaN)).toBeUndefined();
	});

	it('takes live and serialized Firestore Timestamps', () => {
		expect(toMillis({ toMillis: () => 123 })).toBe(123);
		expect(toMillis({ seconds: 2, nanoseconds: 0 })).toBe(2000);
		expect(toMillis({ _seconds: 3, _nanoseconds: 0 })).toBe(3000);
	});

	it('refuses everything else', () => {
		for (const value of ['2020', null, undefined, {}, true]) {
			expect(toMillis(value)).toBeUndefined();
		}
	});
});

describe('statementDateMillis', () => {
	it('prefers createdAt and falls back to lastUpdate', () => {
		expect(statementDateMillis({ createdAt: 1, lastUpdate: 2 })).toBe(1);
		expect(statementDateMillis({ lastUpdate: 2 })).toBe(2);
		expect(statementDateMillis({ createdAt: 'bad', lastUpdate: { seconds: 2 } })).toBe(2000);
		expect(statementDateMillis({})).toBeUndefined();
	});
});

describe('buildRepairPatch', () => {
	it('sets only the missing parts', () => {
		expect(buildRepairPatch({ needsCreatedAt: true, needsUser: false }, 7, own)).toEqual({
			createdAt: 7,
		});
		expect(buildRepairPatch({ needsCreatedAt: false, needsUser: true }, 7, own)).toEqual({
			user: own,
		});
		expect(buildRepairPatch({ needsCreatedAt: true, needsUser: true }, 7, own)).toEqual({
			createdAt: 7,
			user: own,
		});
	});

	it('writes nothing for a missing createdAt when the statement has no date', () => {
		expect(buildRepairPatch({ needsCreatedAt: true, needsUser: false }, undefined, own)).toEqual(
			{},
		);
	});

	it('never touches lastUpdate', () => {
		expect(buildRepairPatch({ needsCreatedAt: true, needsUser: true }, 7, own)).not.toHaveProperty(
			'lastUpdate',
		);
	});
});

describe('formatRepairReport', () => {
	it('prints counts, sample ids and failing fields', () => {
		const counts = { ...emptyRepairCounts(), scanned: 3, writes: 2, createdAtSet: 2, userSet: 1 };
		const report = formatRepairReport(
			counts,
			new Map([['writes', ['u1--s1']]]),
			new Map([['statement.creator', 4]]),
			{ dryRun: true, scannedByRole: { admin: 3 } },
		);

		expect(report).toContain('DRY RUN');
		expect(report).toContain('Would write 2 doc(s): createdAt on 2, user on 1');
		expect(report).toContain('admin=3');
		expect(report).toContain('u1--s1');
		expect(report).toContain('statement.creator: 4');
	});

	it('says wrote on a write run', () => {
		const report = formatRepairReport(emptyRepairCounts(), new Map(), new Map(), {
			dryRun: false,
			scannedByRole: {},
		});

		expect(report).toContain('Wrote 0 doc(s)');
	});
});
