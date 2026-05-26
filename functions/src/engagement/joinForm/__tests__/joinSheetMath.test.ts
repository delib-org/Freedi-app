import type { Creator, Statement } from '@freedi/shared-types';
import { StatementType } from '@freedi/shared-types';
import {
	buildLiveMemberKeys,
	buildRowFromHeader,
	buildSheetExistingKeys,
	columnIndexToA1,
	computeMembershipEvents,
	diffMembers,
	findOrphanRowIndices,
	findRowIndex,
	findUserMembershipsInOptions,
	planV1ToV2Migration,
} from '../joinSheetMath';

function user(uid: string, displayName?: string): Creator {
	return {
		uid,
		displayName: displayName ?? uid,
		email: null,
		photoURL: null,
		isAnonymous: false,
	};
}

describe('joinSheetMath', () => {
	describe('diffMembers', () => {
		it('handles undefined / empty inputs', () => {
			expect(diffMembers(undefined, undefined)).toEqual({ added: [], removed: [] });
			expect(diffMembers([], [])).toEqual({ added: [], removed: [] });
			expect(diffMembers([user('a')], undefined)).toEqual({
				added: [],
				removed: [user('a')],
			});
			expect(diffMembers(undefined, [user('a')])).toEqual({
				added: [user('a')],
				removed: [],
			});
		});

		it('returns disjoint changes', () => {
			const before = [user('a'), user('b')];
			const after = [user('b'), user('c')];
			const diff = diffMembers(before, after);
			expect(diff.added.map((c) => c.uid)).toEqual(['c']);
			expect(diff.removed.map((c) => c.uid)).toEqual(['a']);
		});

		it('returns empty diff for identical arrays (different ordering)', () => {
			const before = [user('a'), user('b')];
			const after = [user('b'), user('a')];
			expect(diffMembers(before, after)).toEqual({ added: [], removed: [] });
		});

		it('skips entries with no uid', () => {
			const before = [user('a'), { uid: '' as string } as Creator];
			const after = [user('a')];
			expect(diffMembers(before, after)).toEqual({ added: [], removed: [] });
		});
	});

	describe('computeMembershipEvents', () => {
		const stmt = (overrides: Partial<Statement> = {}): Statement =>
			({
				statementId: 'opt1',
				statement: 'opt1 title',
				...overrides,
			}) as Statement;

		it('emits join event when user is added to joined', () => {
			const before = stmt({ joined: [], organizers: [] });
			const after = stmt({ joined: [user('a')], organizers: [] });
			expect(computeMembershipEvents(before, after)).toEqual([
				{ action: 'joined', role: 'activist', user: user('a') },
			]);
		});

		it('emits leave event when user is removed from joined', () => {
			const before = stmt({ joined: [user('a')], organizers: [] });
			const after = stmt({ joined: [], organizers: [] });
			expect(computeMembershipEvents(before, after)).toEqual([
				{ action: 'left', role: 'activist', user: user('a') },
			]);
		});

		it('emits both join+leave events for a role swap on same option', () => {
			const before = stmt({ joined: [user('a')], organizers: [] });
			const after = stmt({ joined: [], organizers: [user('a')] });
			const events = computeMembershipEvents(before, after);
			expect(events).toContainEqual({ action: 'left', role: 'activist', user: user('a') });
			expect(events).toContainEqual({
				action: 'joined',
				role: 'organizer',
				user: user('a'),
			});
			expect(events).toHaveLength(2);
		});

		it('returns empty array when before/after are identical', () => {
			const before = stmt({ joined: [user('a')], organizers: [user('b')] });
			const after = stmt({ joined: [user('a')], organizers: [user('b')] });
			expect(computeMembershipEvents(before, after)).toEqual([]);
		});

		it('captures option deletion as leave events', () => {
			const before = stmt({ joined: [user('a')], organizers: [user('b')] });
			expect(computeMembershipEvents(before, undefined)).toEqual([
				{ action: 'left', role: 'activist', user: user('a') },
				{ action: 'left', role: 'organizer', user: user('b') },
			]);
		});
	});

	describe('buildRowFromHeader', () => {
		const ctx = {
			userId: 'uid1',
			displayName: 'Alice',
			role: 'activist' as const,
			optionId: 'opt1',
			optionTitle: 'Option One',
			submittedAt: '2026-05-10T12:00:00Z',
			questionId: 'q1',
			formValues: { Phone: '0501234567', Email: 'a@b.co' },
		};

		it('lays out values for the new 10-col schema', () => {
			const header = [
				'Phone',
				'Email',
				'userId',
				'displayName',
				'role',
				'optionId',
				'optionTitle',
				'submittedAt',
				'questionId',
			];
			expect(buildRowFromHeader(header, ctx)).toEqual([
				'0501234567',
				'a@b.co',
				'uid1',
				'Alice',
				'activist',
				'opt1',
				'Option One',
				'2026-05-10T12:00:00Z',
				'q1',
			]);
		});

		it('lays out values for the legacy 9-col schema (no optionId)', () => {
			const header = [
				'Phone',
				'Email',
				'userId',
				'displayName',
				'role',
				'optionTitle',
				'submittedAt',
				'questionId',
			];
			expect(buildRowFromHeader(header, ctx)).toEqual([
				'0501234567',
				'a@b.co',
				'uid1',
				'Alice',
				'activist',
				'Option One',
				'2026-05-10T12:00:00Z',
				'q1',
			]);
		});

		it('fills empty string for unknown header columns', () => {
			const header = ['userId', 'unknownCol', 'role'];
			expect(buildRowFromHeader(header, ctx)).toEqual(['uid1', '', 'activist']);
		});

		it('trims header cell whitespace before matching', () => {
			const header = ['  userId  ', ' role'];
			expect(buildRowFromHeader(header, ctx)).toEqual(['uid1', 'activist']);
		});

		it('uses form-field LABEL as the lookup key (not field id)', () => {
			const header = ['Phone', 'NotInFormValues'];
			expect(buildRowFromHeader(header, ctx)).toEqual(['0501234567', '']);
		});
	});

	describe('findRowIndex', () => {
		const newSchemaHeader = [
			'Phone',
			'userId',
			'displayName',
			'role',
			'optionId',
			'optionTitle',
			'submittedAt',
			'questionId',
		];
		const legacyHeader = [
			'Phone',
			'userId',
			'displayName',
			'role',
			'optionTitle',
			'submittedAt',
			'questionId',
		];

		const newRow = (
			phone: string,
			uid: string,
			role: 'activist' | 'organizer',
			optionId: string,
			optionTitle: string,
		): string[] => [phone, uid, uid, role, optionId, optionTitle, 'ts', 'q1'];

		const legacyRow = (
			phone: string,
			uid: string,
			role: 'activist' | 'organizer',
			optionTitle: string,
		): string[] => [phone, uid, uid, role, optionTitle, 'ts', 'q1'];

		it('returns -1 for empty / header-only sheet', () => {
			expect(
				findRowIndex([], {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'opt1',
				}),
			).toBe(-1);
			expect(
				findRowIndex([newSchemaHeader], {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'opt1',
				}),
			).toBe(-1);
		});

		it('finds an exact (uid, role, optionId) match in the new schema', () => {
			const rows = [
				newSchemaHeader,
				newRow('p1', 'a', 'activist', 'opt1', 'Option One'),
				newRow('p2', 'b', 'activist', 'opt1', 'Option One'),
				newRow('p3', 'a', 'activist', 'opt2', 'Option Two'),
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt2',
					optionTitle: 'Option Two',
				}),
			).toBe(3);
			expect(
				findRowIndex(rows, {
					userId: 'b',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(2);
		});

		it('falls back to optionTitle in legacy schema (no optionId column)', () => {
			const rows = [
				legacyHeader,
				legacyRow('p1', 'a', 'activist', 'Option One'),
				legacyRow('p2', 'a', 'activist', 'Option Two'),
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt2',
					optionTitle: 'Option Two',
				}),
			).toBe(2);
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(1);
		});

		it('returns -1 when neither option column exists (refuses to match)', () => {
			const rows = [
				['Phone', 'userId', 'displayName', 'role'],
				['p1', 'a', 'a', 'activist'],
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(-1);
		});

		it('refuses to match when role differs', () => {
			const rows = [newSchemaHeader, newRow('p1', 'a', 'organizer', 'opt1', 'Option One')];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(-1);
		});

		it('iterates bottom-up (returns the most recent of duplicates)', () => {
			const rows = [
				newSchemaHeader,
				newRow('p1', 'a', 'activist', 'opt1', 'Option One'),
				newRow('p2', 'a', 'activist', 'opt1', 'Option One'),
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(2);
		});

		it('refuses to match when optionId is empty AND optionTitle is empty', () => {
			const rows = [
				newSchemaHeader,
				// Row with empty optionId AND empty optionTitle
				['p1', 'a', 'a', 'activist', '', '', 'ts', 'q1'],
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(-1);
		});

		it('does NOT confuse two options with identical user but different titles', () => {
			const rows = [
				legacyHeader,
				legacyRow('p1', 'a', 'activist', 'מחאה'),
				legacyRow('p2', 'a', 'activist', 'צוות תוכן'),
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'irrelevant-because-legacy',
					optionTitle: 'מחאה',
				}),
			).toBe(1);
		});

		it('refuses to match a row with empty role cell against a non-empty target role', () => {
			// Defensive: legacy data could have rows with missing role values.
			// We must NOT match such a row when caller specifies a real role.
			const rows = [newSchemaHeader, ['p1', 'a', 'a', '', 'opt1', 'Option One', 'ts', 'q1']];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(-1);
		});

		it('returns -1 when userId column is missing', () => {
			const rows = [
				['Phone', 'displayName', 'role', 'optionTitle'],
				['p1', 'a', 'activist', 'Option One'],
			];
			expect(
				findRowIndex(rows, {
					userId: 'a',
					role: 'activist',
					optionId: 'opt1',
					optionTitle: 'Option One',
				}),
			).toBe(-1);
		});
	});

	describe('findUserMembershipsInOptions', () => {
		const opt = (overrides: Partial<Statement> = {}): Statement =>
			({
				statementId: 'opt-default',
				statement: 'Default Option',
				statementType: StatementType.option,
				joined: [],
				organizers: [],
				...overrides,
			}) as Statement;

		it('returns empty for empty option list', () => {
			expect(findUserMembershipsInOptions([], 'u1')).toEqual([]);
		});

		it('returns empty for empty userId', () => {
			const options = [opt({ joined: [user('u1')] })];
			expect(findUserMembershipsInOptions(options, '')).toEqual([]);
		});

		it('finds an activist membership', () => {
			const options = [opt({ statementId: 'o1', statement: 'T1', joined: [user('u1')] })];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([
				{ optionId: 'o1', optionTitle: 'T1', role: 'activist' },
			]);
		});

		it('finds an organizer membership', () => {
			const options = [opt({ statementId: 'o2', statement: 'T2', organizers: [user('u1')] })];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([
				{ optionId: 'o2', optionTitle: 'T2', role: 'organizer' },
			]);
		});

		it('returns both roles when user is in joined AND organizers on the same option', () => {
			const options = [
				opt({
					statementId: 'o3',
					statement: 'T3',
					joined: [user('u1')],
					organizers: [user('u1')],
				}),
			];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([
				{ optionId: 'o3', optionTitle: 'T3', role: 'activist' },
				{ optionId: 'o3', optionTitle: 'T3', role: 'organizer' },
			]);
		});

		it('walks multiple options and returns all memberships', () => {
			const options = [
				opt({ statementId: 'o1', statement: 'T1', joined: [user('u1'), user('u2')] }),
				opt({ statementId: 'o2', statement: 'T2', organizers: [user('u1')] }),
				opt({ statementId: 'o3', statement: 'T3', joined: [user('u2')] }),
			];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([
				{ optionId: 'o1', optionTitle: 'T1', role: 'activist' },
				{ optionId: 'o2', optionTitle: 'T2', role: 'organizer' },
			]);
		});

		it('skips cluster docs (no real membership state)', () => {
			const options = [
				opt({ statementId: 'cluster1', isCluster: true, joined: [user('u1')] }),
				opt({ statementId: 'o2', joined: [user('u1')] }),
			];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([
				{ optionId: 'o2', optionTitle: 'Default Option', role: 'activist' },
			]);
		});

		it('skips hidden integrated-cluster members', () => {
			const options = [
				opt({
					statementId: 'int1',
					joined: [user('u1')],
					// integratedInto isn't on the shared Statement type — cast on
					// the consumer side mirrors the trigger code.
					...({ integratedInto: 'cluster-x' } as Partial<Statement>),
				}),
				opt({ statementId: 'o2', joined: [user('u1')] }),
			];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([
				{ optionId: 'o2', optionTitle: 'Default Option', role: 'activist' },
			]);
		});

		it('handles undefined joined/organizers arrays defensively', () => {
			const options = [
				opt({ statementId: 'o1', joined: undefined as unknown as Creator[] }),
				opt({ statementId: 'o2', organizers: undefined as unknown as Creator[] }),
			];
			expect(findUserMembershipsInOptions(options, 'u1')).toEqual([]);
		});
	});

	describe('buildLiveMemberKeys', () => {
		it('emits both id-keyed and title-keyed tuples per membership', () => {
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(keys.has('u1|activist|o1')).toBe(true);
			expect(keys.has('u1|activist|T1')).toBe(true);
			expect(keys.size).toBe(2);
		});

		it('skips empty optionId and empty optionTitle independently', () => {
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'organizer', optionId: 'o1', optionTitle: '' },
				{ userId: 'u2', role: 'activist', optionId: '', optionTitle: 'T2' },
			]);
			expect(keys.has('u1|organizer|o1')).toBe(true);
			expect(keys.has('u2|activist|T2')).toBe(true);
			expect(keys.size).toBe(2);
		});

		it('skips entries with no userId', () => {
			const keys = buildLiveMemberKeys([
				{ userId: '', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(keys.size).toBe(0);
		});

		it('deduplicates identical memberships', () => {
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
				{ userId: 'u1', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(keys.size).toBe(2);
		});
	});

	describe('buildSheetExistingKeys', () => {
		it('returns empty set for header-only or empty sheets', () => {
			expect(buildSheetExistingKeys([])).toEqual(new Set());
			expect(buildSheetExistingKeys([['userId', 'role', 'optionId']])).toEqual(new Set());
		});

		it('returns empty set when no userId column exists', () => {
			const rows = [
				['col1', 'col2'],
				['a', 'b'],
			];
			expect(buildSheetExistingKeys(rows)).toEqual(new Set());
		});

		it('emits both id-keyed and title-keyed entries per v2 row', () => {
			const rows = [
				['userId', 'role', 'optionId', 'optionTitle'],
				['u1', 'activist', 'o1', 'T1'],
			];
			const keys = buildSheetExistingKeys(rows);
			expect(keys.has('u1|activist|o1')).toBe(true);
			expect(keys.has('u1|activist|T1')).toBe(true);
			expect(keys.size).toBe(2);
		});

		it('emits only title-keyed entries on v1 rows (no optionId column)', () => {
			const rows = [
				['userId', 'role', 'optionTitle'],
				['u1', 'activist', 'T1'],
			];
			const keys = buildSheetExistingKeys(rows);
			expect(keys.has('u1|activist|T1')).toBe(true);
			expect(keys.size).toBe(1);
		});

		it('skips rows with empty userId', () => {
			const rows = [
				['userId', 'role', 'optionId'],
				['', 'activist', 'o1'],
			];
			expect(buildSheetExistingKeys(rows)).toEqual(new Set());
		});

		it('handles multiple rows including duplicates', () => {
			const rows = [
				['userId', 'role', 'optionId', 'optionTitle'],
				['u1', 'activist', 'o1', 'T1'],
				['u2', 'organizer', 'o2', 'T2'],
				['u1', 'activist', 'o1', 'T1'], // duplicate
			];
			const keys = buildSheetExistingKeys(rows);
			// Set dedups naturally — duplicate row collapses to same keys.
			expect(keys.size).toBe(4);
		});
	});

	describe('findOrphanRowIndices', () => {
		const v2Header = ['name', 'userId', 'displayName', 'role', 'optionId', 'optionTitle'];

		it('returns empty for header-only or empty sheets', () => {
			expect(findOrphanRowIndices([], new Set())).toEqual([]);
			expect(findOrphanRowIndices([v2Header], new Set())).toEqual([]);
		});

		it('refuses to operate on sheets with no userId column', () => {
			const rows = [
				['col1', 'col2'],
				['a', 'b'],
			];
			expect(findOrphanRowIndices(rows, new Set(['anything|activist|o1']))).toEqual([]);
		});

		it('refuses to operate when neither option column exists', () => {
			const rows = [
				['userId', 'role'],
				['u1', 'activist'],
			];
			expect(findOrphanRowIndices(rows, new Set(['u1|activist|o1']))).toEqual([]);
		});

		it('keeps rows that match by optionId in v2 sheets', () => {
			const rows = [v2Header, ['Alice', 'u1', 'Alice', 'activist', 'o1', 'T1']];
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(findOrphanRowIndices(rows, keys)).toEqual([]);
		});

		it('keeps rows that match by optionTitle in v1 sheets (no optionId column)', () => {
			const v1Header = ['name', 'userId', 'displayName', 'role', 'optionTitle'];
			const rows = [v1Header, ['Alice', 'u1', 'Alice', 'activist', 'T1']];
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(findOrphanRowIndices(rows, keys)).toEqual([]);
		});

		it('flags rows with no matching membership as orphans', () => {
			const rows = [
				v2Header,
				['Alice', 'u1', 'Alice', 'activist', 'o1', 'T1'], // live → keep
				['Bob', 'u2', 'Bob', 'activist', 'o2', 'T2'], // not in liveKeys → orphan
				['Carol', 'u3', 'Carol', 'organizer', 'o3', 'T3'], // not in liveKeys → orphan
			];
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'activist', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(findOrphanRowIndices(rows, keys)).toEqual([2, 3]);
		});

		it('catches user-left case (uid still in sheet, no live membership)', () => {
			const rows = [v2Header, ['Alice', 'u1', 'Alice', 'activist', 'o1', 'T1']];
			expect(findOrphanRowIndices(rows, new Set())).toEqual([1]);
		});

		it('catches role-change case (sheet has activist, live has organizer)', () => {
			const rows = [v2Header, ['Alice', 'u1', 'Alice', 'activist', 'o1', 'T1']];
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'organizer', optionId: 'o1', optionTitle: 'T1' },
			]);
			expect(findOrphanRowIndices(rows, keys)).toEqual([1]);
		});

		it('catches option-change case (sheet has o1, live has o2)', () => {
			const rows = [v2Header, ['Alice', 'u1', 'Alice', 'activist', 'o1', 'T1']];
			const keys = buildLiveMemberKeys([
				{ userId: 'u1', role: 'activist', optionId: 'o2', optionTitle: 'T2' },
			]);
			expect(findOrphanRowIndices(rows, keys)).toEqual([1]);
		});

		it('skips rows with empty userId (manual notes / blank rows)', () => {
			const rows = [v2Header, ['Alice', '', '', '', '', ''], ['note', '', 'free text', '', '', '']];
			expect(findOrphanRowIndices(rows, new Set())).toEqual([]);
		});
	});

	describe('planV1ToV2Migration', () => {
		const v1Header = ['name', 'userId', 'displayName', 'role', 'optionTitle'];

		it('is a no-op on empty sheets', () => {
			const plan = planV1ToV2Migration([], new Map());
			expect(plan.needsMigration).toBe(false);
		});

		it('is a no-op when the header already has optionId (already v2)', () => {
			const rows = [
				['userId', 'displayName', 'role', 'optionId', 'optionTitle'],
				['u1', 'Alice', 'activist', 'o1', 'T1'],
			];
			const plan = planV1ToV2Migration(rows, new Map([['T1', 'o1']]));
			expect(plan.needsMigration).toBe(false);
		});

		it('plans appending optionId column at the right edge', () => {
			const rows = [v1Header, ['Alice', 'u1', 'Alice', 'activist', 'T1']];
			const plan = planV1ToV2Migration(rows, new Map([['T1', 'o1']]));
			expect(plan.needsMigration).toBe(true);
			expect(plan.newHeader).toEqual([...v1Header, 'optionId']);
			expect(plan.optionIdColumnIndex).toBe(5);
			expect(plan.optionIdsByRow).toEqual(['o1']);
		});

		it('resolves multiple rows against the title map', () => {
			const rows = [
				v1Header,
				['Alice', 'u1', 'Alice', 'activist', 'T1'],
				['Bob', 'u2', 'Bob', 'organizer', 'T2'],
				['Carol', 'u3', 'Carol', 'activist', 'T1'],
			];
			const plan = planV1ToV2Migration(
				rows,
				new Map([
					['T1', 'o1'],
					['T2', 'o2'],
				]),
			);
			expect(plan.optionIdsByRow).toEqual(['o1', 'o2', 'o1']);
		});

		it('leaves null for rows whose title is not in the map (option deleted/renamed)', () => {
			const rows = [
				v1Header,
				['Alice', 'u1', 'Alice', 'activist', 'T1'],
				['Bob', 'u2', 'Bob', 'activist', 'T-gone'],
			];
			const plan = planV1ToV2Migration(rows, new Map([['T1', 'o1']]));
			expect(plan.optionIdsByRow).toEqual(['o1', null]);
		});

		it('leaves null for rows with empty optionTitle', () => {
			const rows = [v1Header, ['Alice', 'u1', 'Alice', 'activist', '']];
			const plan = planV1ToV2Migration(rows, new Map([['T1', 'o1']]));
			expect(plan.optionIdsByRow).toEqual([null]);
		});

		it('handles sheets with no optionTitle column (every row null)', () => {
			const rows = [
				['userId', 'displayName', 'role'],
				['u1', 'Alice', 'activist'],
				['u2', 'Bob', 'organizer'],
			];
			const plan = planV1ToV2Migration(rows, new Map([['T1', 'o1']]));
			expect(plan.needsMigration).toBe(true);
			expect(plan.optionIdsByRow).toEqual([null, null]);
		});

		it('trims whitespace when matching titles', () => {
			const rows = [v1Header, ['Alice', 'u1', 'Alice', 'activist', '  T1  ']];
			const plan = planV1ToV2Migration(rows, new Map([['T1', 'o1']]));
			expect(plan.optionIdsByRow).toEqual(['o1']);
		});
	});

	describe('columnIndexToA1', () => {
		it('maps single-letter columns', () => {
			expect(columnIndexToA1(0)).toBe('A');
			expect(columnIndexToA1(1)).toBe('B');
			expect(columnIndexToA1(25)).toBe('Z');
		});

		it('handles the Z → AA boundary correctly (the easy bug)', () => {
			expect(columnIndexToA1(26)).toBe('AA');
			expect(columnIndexToA1(27)).toBe('AB');
			expect(columnIndexToA1(51)).toBe('AZ');
			expect(columnIndexToA1(52)).toBe('BA');
		});

		it('handles further wraps', () => {
			expect(columnIndexToA1(701)).toBe('ZZ');
			expect(columnIndexToA1(702)).toBe('AAA');
		});

		it('returns empty string for invalid inputs (defensive)', () => {
			expect(columnIndexToA1(-1)).toBe('');
			expect(columnIndexToA1(1.5)).toBe('');
			expect(columnIndexToA1(NaN)).toBe('');
		});
	});
});
