import { describe, it, expect } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';

jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));

import {
	classifySubscription,
	formatIdentityScan,
	identityScanExitCode,
	scanSubscriptionIdentity,
} from '../scanSubscriptionIdentity';

type Row = { id: string; data: Record<string, unknown> };

/** A minimal fake of collection().select().orderBy(docId).limit().startAfter().get(). */
function fakeFirestore(rows: Row[]): { db: Firestore; reads: number[] } {
	const sorted = [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const reads: number[] = [];
	const makeQuery = (after: string, max: number) => ({
		select: () => makeQuery(after, max),
		orderBy: () => makeQuery(after, max),
		limit: (n: number) => makeQuery(after, n),
		startAfter: (id: string) => makeQuery(id, max),
		get: async () => {
			const docs = sorted
				.filter((r) => !after || r.id > after)
				.slice(0, max)
				.map((r) => ({ id: r.id, data: () => r.data }));
			reads.push(docs.length);

			return { docs, size: docs.length };
		},
	});
	const db = { collection: () => makeQuery('', Number.MAX_SAFE_INTEGER) } as unknown as Firestore;

	return { db, reads };
}

describe('classifySubscription', () => {
	it('passes a sound subscription', () => {
		expect(
			classifySubscription('u1--s1', {
				userId: 'u1',
				statementId: 's1',
				role: 'admin',
				user: { uid: 'u1' },
			}),
		).toBeUndefined();
	});

	it('flags a forged id (way A) and a moved statementId (way B) as hits', () => {
		const a = classifySubscription('t--jcClass_x', {
			userId: 't',
			statementId: 's',
			role: 'admin',
		});
		expect(a).toMatchObject({ verdict: 'hit', problems: ['id-mismatch'] });
		const b = classifySubscription('t--s', {
			userId: 't',
			statementId: 'jcClass_x',
			role: 'admin',
		});
		expect(b).toMatchObject({ verdict: 'hit', problems: ['id-mismatch'] });
		const c = classifySubscription('t--s', {
			userId: 't',
			statementId: 's',
			role: 'admin',
			user: { uid: 'someone' },
		});
		expect(c?.verdict).toBe('hit');
	});

	it('flags id-mismatch on a MEMBER doc too (way C: promoted later)', () => {
		const f = classifySubscription('a--x', {
			userId: 'a',
			statementId: 'own',
			role: 'member',
			user: { uid: 'a' },
		});
		expect(f).toMatchObject({ verdict: 'hit', problems: ['id-mismatch'], role: 'member' });
	});

	it('ignores user-mismatch on non-elevated roles', () => {
		expect(
			classifySubscription('a--x', {
				userId: 'a',
				statementId: 'x',
				role: 'member',
				user: { uid: 'creator' },
			}),
		).toBeUndefined();
		const both = classifySubscription('a--y', {
			userId: 'a',
			statementId: 'x',
			role: 'member',
			user: { uid: 'creator' },
		});
		expect(both?.problems).toEqual(['id-mismatch']);
	});

	it('reports the server shape (user = the statement creator) without making it a hit', () => {
		const f = classifySubscription('t--s', {
			userId: 't',
			statementId: 's',
			role: 'admin',
			user: { uid: 'owner' },
			statement: { creatorId: 'owner' },
		});
		expect(f).toMatchObject({ verdict: 'server-shape', problems: ['user-mismatch'] });
	});
});

describe('scanSubscriptionIdentity', () => {
	const rows: Row[] = [
		{ id: 'a--s1', data: { userId: 'a', statementId: 's1', role: 'member', user: { uid: 'a' } } },
		{ id: 'a--x', data: { userId: 'a', statementId: 'own', role: 'member', user: { uid: 'a' } } },
		{
			id: 'b--s1',
			data: {
				userId: 'b',
				statementId: 's1',
				role: 'admin',
				user: { uid: 'owner' },
				statement: { creatorId: 'owner' },
			},
		},
		{
			id: 'c--s1',
			data: {
				userId: 'c',
				statementId: 's1',
				role: 'admin',
				user: { uid: 'owner' },
				statement: { creatorId: 'owner' },
			},
		},
		{ id: 'd--s1', data: { userId: 'd', statementId: 's1', role: 'admin', user: { uid: 'x' } } },
	];

	it('pages the whole collection, prints counts for server-shape and a line per hit', async () => {
		const { db, reads } = fakeFirestore(rows);
		const result = await scanSubscriptionIdentity(db, { pageSize: 2 });
		expect(reads).toEqual([2, 2, 1]);
		expect(result).toMatchObject({ scanned: 5, lastDocId: 'd--s1', complete: true });
		expect(result.hits.map((h) => h.subscriptionId)).toEqual(['a--x', 'd--s1']);
		expect(result.serverShapeByRole).toEqual({ admin: 2 });
		expect(identityScanExitCode(result)).toBe(2);
		const report = formatIdentityScan(result);
		expect(report).toContain('- HIT a--x role=member');
		expect(report).not.toContain('b--s1');
		expect(report).toContain('Server-shape (counted, harmless): 2 (admin=2)');
		expect(report).toContain('id-mismatch: 1, elevated user-mismatch: 1');
		expect(report).toContain('Reached the end of the collection.');
	});

	it('runs in chunks with limit / startAfter', async () => {
		const { db } = fakeFirestore(rows);
		const first = await scanSubscriptionIdentity(db, { pageSize: 2, limit: 3 });
		expect(first).toMatchObject({ scanned: 3, lastDocId: 'b--s1', complete: false });
		expect(formatIdentityScan(first)).toContain('continue with --startAfter=b--s1');
		const second = await scanSubscriptionIdentity(db, { pageSize: 2, startAfter: first.lastDocId });
		expect(second).toMatchObject({ scanned: 2, lastDocId: 'd--s1', complete: true });
		expect(second.hits.map((h) => h.subscriptionId)).toEqual(['d--s1']);
	});

	it('exits 0 on a clean collection', async () => {
		const { db } = fakeFirestore([rows[0]]);
		const result = await scanSubscriptionIdentity(db);
		expect(identityScanExitCode(result)).toBe(0);
		expect(result.hits).toEqual([]);
	});
});
