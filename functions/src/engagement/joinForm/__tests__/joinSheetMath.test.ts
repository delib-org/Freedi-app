import type { Creator, Statement } from '@freedi/shared-types';
import {
	buildRowFromHeader,
	computeMembershipEvents,
	diffMembers,
	findRowIndex,
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
			formValues: { 'Phone': '0501234567', 'Email': 'a@b.co' },
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
			const rows = [
				newSchemaHeader,
				newRow('p1', 'a', 'organizer', 'opt1', 'Option One'),
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
			const rows = [
				newSchemaHeader,
				['p1', 'a', 'a', '', 'opt1', 'Option One', 'ts', 'q1'],
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
});
