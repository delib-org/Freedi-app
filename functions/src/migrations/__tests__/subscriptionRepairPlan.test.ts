import { StatementType } from '@freedi/shared-types';
import {
	assessSubscription,
	backfillRunRefusal,
	buildRepairPatch,
	emptyRepairCounts,
	formatRepairReport,
	resolveStatementType,
	statementDateMillis,
	toMillis,
} from '../subscriptionRepairPlan';
import { emptyEffectTally } from '../subscriptionRepairEffects';

const ID = 'u1--s1';
const own = { uid: 'u1', displayName: 'Host', isAnonymous: false };
const base = { userId: 'u1', statementId: 's1', role: 'admin', statementType: 'question' };
const noType = { userId: 'u1', statementId: 's1', role: 'admin' };

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
			needsStatementType: false,
			hasNonNumberCreatedAt: false,
		});
	});

	it('wants statementType alone on a doc needing nothing else', () => {
		expect(assessSubscription(ID, { ...noType, createdAt: 5, user: own })).toEqual({
			kind: 'repair',
			needsCreatedAt: false,
			needsUser: false,
			needsStatementType: true,
			hasNonNumberCreatedAt: false,
		});
	});

	it.each([
		['null', null],
		['an empty string', ''],
	])('treats a statementType of %s as missing', (_name, statementType) => {
		expect(assessSubscription(ID, { ...noType, statementType, createdAt: 5, user: own })).toEqual(
			expect.objectContaining({ kind: 'repair', needsStatementType: true }),
		);
	});

	it('leaves a stored statementType alone, document included', () => {
		expect(
			assessSubscription(ID, { ...noType, statementType: 'document', createdAt: 5, user: own }),
		).toMatchObject({ kind: 'current' });
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

	it('leaves a doc holding its own person with no isAnonymous alone: nothing to migrate', () => {
		const earlierRepair = { uid: 'u1', displayName: 'Host' };

		expect(assessSubscription(ID, { ...base, createdAt: 5, user: earlierRepair })).toEqual({
			kind: 'current',
			hasNonNumberCreatedAt: false,
		});
	});

	it('is idempotent: applying its own patch makes the doc current', () => {
		const data = { ...noType, user: { uid: 'creator' } };
		const assessment = assessSubscription(ID, data);
		if (assessment.kind !== 'repair') throw new Error('expected a repair');
		const patch = buildRepairPatch(assessment, 7, own, StatementType.group);

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

describe('resolveStatementType', () => {
	it('prefers the live statement', () => {
		expect(resolveStatementType('group', 'question')).toBe(StatementType.group);
	});

	it('falls back to the embedded copy', () => {
		expect(resolveStatementType(undefined, 'question')).toBe(StatementType.question);
		expect(resolveStatementType('not-a-type', 'question')).toBe(StatementType.question);
	});

	it('returns document as it is, so the Members filter can keep it out', () => {
		expect(resolveStatementType('document', 'question')).toBe(StatementType.document);
	});

	it('refuses anything outside the enum', () => {
		expect(resolveStatementType('nope', 7)).toBeUndefined();
		expect(resolveStatementType(undefined, undefined)).toBeUndefined();
	});
});

describe('buildRepairPatch', () => {
	it('sets only the missing parts', () => {
		const none = { needsCreatedAt: false, needsUser: false, needsStatementType: false };
		const type = StatementType.group;

		expect(buildRepairPatch({ ...none, needsCreatedAt: true }, 7, own, type)).toEqual({
			createdAt: 7,
		});
		expect(buildRepairPatch({ ...none, needsUser: true }, 7, own, type)).toEqual({ user: own });
		expect(buildRepairPatch({ ...none, needsStatementType: true }, 7, own, type)).toEqual({
			statementType: type,
		});
		expect(buildRepairPatch(none, 7, own, type)).toEqual({});
	});

	it('writes no statementType when none is known', () => {
		expect(
			buildRepairPatch(
				{ needsCreatedAt: false, needsUser: false, needsStatementType: true },
				7,
				own,
				undefined,
			),
		).toEqual({});
	});

	it('writes nothing for a missing createdAt when the statement has no date', () => {
		expect(
			buildRepairPatch(
				{ needsCreatedAt: true, needsUser: false, needsStatementType: false },
				undefined,
				own,
				undefined,
			),
		).toEqual({});
	});

	it('never writes lastUpdate, parentId or topParentId', () => {
		const patch = buildRepairPatch(
			{ needsCreatedAt: true, needsUser: true, needsStatementType: true },
			7,
			own,
			StatementType.question,
		);

		expect(Object.keys(patch).sort()).toEqual(['createdAt', 'statementType', 'user']);
	});
});

describe('backfillRunRefusal', () => {
	const real = {
		project: 'some-project',
		firestoreEmulator: false,
		authEmulator: false,
		dryRun: false,
		confirmProd: true,
	};

	it.each([
		['a confirmed write', real],
		['a dry run', { ...real, dryRun: true, confirmProd: false }],
		['the emulator', { ...real, firestoreEmulator: true, authEmulator: true, confirmProd: false }],
	])('allows %s that names its project', (_name, env) => {
		expect(backfillRunRefusal(env)).toBeUndefined();
	});

	it.each([
		['a confirmed write', real],
		['a dry run', { ...real, dryRun: true, confirmProd: false }],
		['the emulator', { ...real, firestoreEmulator: true, authEmulator: true }],
	])('refuses %s with no project, or a blank one', (_name, env) => {
		expect(backfillRunRefusal({ ...env, project: undefined })).toContain('GCLOUD_PROJECT');
		expect(backfillRunRefusal({ ...env, project: '  ' })).toContain('GCLOUD_PROJECT');
	});

	it('refuses a real write without --confirm-prod', () => {
		expect(backfillRunRefusal({ ...real, confirmProd: false })).toContain('--confirm-prod');
	});

	it('refuses one emulator without the other', () => {
		expect(backfillRunRefusal({ ...real, firestoreEmulator: true })).toContain('or neither');
		expect(backfillRunRefusal({ ...real, authEmulator: true })).toContain('or neither');
	});
});

describe('formatRepairReport', () => {
	const effects = emptyEffectTally();

	it('prints counts, sample ids and failing fields', () => {
		const counts = {
			...emptyRepairCounts(),
			scanned: 3,
			writes: 2,
			createdAtSet: 2,
			userSet: 1,
			statementTypeSet: 2,
			hiddenNoType: 1,
			hiddenNoDate: 2,
			hiddenTypeHeldBack: 3,
			hiddenByType: 4,
		};
		const report = formatRepairReport(
			counts,
			new Map([['writes', ['u1--s1']]]),
			new Map([['statement.creator', 4]]),
			{ dryRun: true, project: 'some-project', scannedByRole: { admin: 3 }, effects },
		);

		expect(report).toContain('Project: some-project');
		expect(report).toContain('DRY RUN');
		expect(report).toContain('Would write 2 doc(s): createdAt on 2, user on 1');
		expect(report).toContain('statementType on 2.');
		expect(report).toContain('Still hidden from Members after this run: 6');
		expect(report).toContain('type document or agreement: 4');
		expect(report).toContain('admin=3');
		expect(report).toContain('u1--s1');
		expect(report).toContain('statement.creator: 4');
	});

	it('says wrote on a write run', () => {
		const report = formatRepairReport(emptyRepairCounts(), new Map(), new Map(), {
			dryRun: false,
			project: 'p',
			scannedByRole: {},
			effects,
		});

		expect(report).toContain('Wrote 0 doc(s)');
	});
});
