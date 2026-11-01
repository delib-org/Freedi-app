import { describe, it, expect } from '@jest/globals';
import type { Firestore } from 'firebase-admin/firestore';
import { Collections, Role } from '@freedi/shared-types';
import { recordDiscussionActivity } from '../recordDiscussionActivity';
import { FakeFirestore } from './fakeFirestore';

/**
 * Instrumented operation counts for ONE activity in a top-level discussion
 * with N members, before vs after. Feeds the table in
 * docs/architecture/firebase-cost-2026-10/lane-a-feed.md.
 *
 * Membership trigger invocations are derived from the subscription writes:
 *  - before: every subscription UPDATE woke 3 triggers
 *    (handleWaitingRoleSubscriptions, validateRoleChange, updateStatementMemberCount)
 *  - after:  2 (updateStatementMemberCount moved to create/delete only)
 *  - userFeed has no triggers.
 */

const DISCUSSION = 'discussion-1';
const T0 = 1_800_000_000_000;
const LEGACY_LIMIT = 500;
const LEGACY_GUARD_MS = 1000;
const TRIGGERS_PER_SUBSCRIPTION_UPDATE_BEFORE = 3;
const TRIGGERS_PER_SUBSCRIPTION_UPDATE_AFTER = 2;

/**
 * Faithful replica of the removed updateTopParentSubscriptions (fn_statement_updates.ts
 * on dev ce6089543), which ran for every nested content OR consensus change.
 */
async function legacyUpdateTopParentSubscriptions(
	db: FakeFirestore,
	topParentId: string,
	now: number,
): Promise<void> {
	const topParentRef = db.collection(Collections.statements).doc(topParentId);
	const topParentDoc = await topParentRef.get();
	if (!topParentDoc.exists) return;
	const lastUpdate = (topParentDoc.data()?.lastUpdate as number) || 0;
	if (now - lastUpdate < LEGACY_GUARD_MS) return;
	await topParentRef.update({ lastUpdate: now });
	const subscriptions = await db
		.collection(Collections.statementsSubscribe)
		.where('statementId', '==', topParentId)
		.limit(LEGACY_LIMIT)
		.get();
	const batch = db.batch();
	subscriptions.docs.forEach((doc) => batch.update(doc.ref, { lastUpdate: now }));
	await batch.commit();
}

function seedDiscussion(members: number): FakeFirestore {
	const db = new FakeFirestore();
	db.seed(Collections.statements, DISCUSSION, {
		statementId: DISCUSSION,
		parentId: 'top',
		lastUpdate: 0,
	});
	for (let i = 0; i < members; i++) {
		const id = `u${i}--${DISCUSSION}`;
		db.seed(Collections.statementsSubscribe, id, {
			userId: `u${i}`,
			statementId: DISCUSSION,
			role: Role.member,
			lastUpdate: 0,
		});
		db.seed(Collections.userFeed, id, {
			userId: `u${i}`,
			statementId: DISCUSSION,
			subscriptionId: id,
			lastActivity: 0,
		});
	}
	db.resetCounters();

	return db;
}

interface Row {
	scenario: string;
	n: number;
	reads: number;
	writes: number;
	membershipInvocations: number;
	statementTriggerWrites: number;
}

function row(db: FakeFirestore, scenario: string, n: number, perSubscriptionUpdate: number): Row {
	return {
		scenario,
		n,
		reads: db.reads,
		writes: db.writes,
		membershipInvocations:
			db.writesTo(Collections.statementsSubscribe, 'update') * perSubscriptionUpdate,
		statementTriggerWrites: db.writesTo(Collections.statements),
	};
}

describe('operation counts per activity (instrumented)', () => {
	const rows: Row[] = [];

	it.each([10, 100, 1000])('N = %i members', async (n) => {
		const before = seedDiscussion(n);
		await legacyUpdateTopParentSubscriptions(before, DISCUSSION, T0);
		rows.push(
			row(
				before,
				'before: per nested edit OR consensus change',
				n,
				TRIGGERS_PER_SUBSCRIPTION_UPDATE_BEFORE,
			),
		);

		const phase1 = seedDiscussion(n);
		await recordDiscussionActivity(phase1 as unknown as Firestore, DISCUSSION, {
			now: T0,
			stampSubscriptions: true,
		});
		rows.push(
			row(
				phase1,
				'after phase 1: first activity in a minute',
				n,
				TRIGGERS_PER_SUBSCRIPTION_UPDATE_AFTER,
			),
		);

		const phase2 = seedDiscussion(n);
		await recordDiscussionActivity(phase2 as unknown as Firestore, DISCUSSION, {
			now: T0,
			stampSubscriptions: false,
		});
		rows.push(
			row(
				phase2,
				'after phase 2: first activity in a minute',
				n,
				TRIGGERS_PER_SUBSCRIPTION_UPDATE_AFTER,
			),
		);

		phase2.resetCounters();
		await recordDiscussionActivity(phase2 as unknown as Firestore, DISCUSSION, {
			now: T0 + 1000,
			stampSubscriptions: false,
		});
		rows.push(
			row(
				phase2,
				'after: further activity in the same minute',
				n,
				TRIGGERS_PER_SUBSCRIPTION_UPDATE_AFTER,
			),
		);

		const capped = Math.min(n, LEGACY_LIMIT);
		expect(before.reads).toBe(1 + capped);
		expect(before.writes).toBe(1 + capped);
		expect(phase1.writesTo(Collections.statementsSubscribe)).toBe(n);
		expect(phase1.writesTo(Collections.userFeed)).toBe(n);
		expect(phase2.writesTo(Collections.statementsSubscribe)).toBe(0);
		expect(phase2.reads).toBe(1);
		expect(phase2.writes).toBe(0);
	});

	it('prints the table', () => {
		console.info(
			[
				'scenario | N | reads | writes | membership trigger invocations | statement writes (wake ~15 statement triggers each)',
			]
				.concat(
					rows.map(
						(r) =>
							`${r.scenario} | ${r.n} | ${r.reads} | ${r.writes} | ${r.membershipInvocations} | ${r.statementTriggerWrites}`,
					),
				)
				.join('\n'),
		);
		expect(rows).toHaveLength(12);
	});
});
