import { doc, setDoc, type Firestore } from 'firebase/firestore';
import {
	Collections,
	Role,
	StatementType,
	Access,
	createStatementObject,
	statementToSimpleStatement,
	getStatementSubscriptionId,
	getRandomUID,
	type User,
} from '@freedi/shared-types';
import type { FacilitatorEvent } from './myEvents';

/**
 * Event Control Center — create a new event (framework-agnostic).
 *
 * An event is a top-level `group` Statement. Creating one writes the group plus
 * a creator subscription so it immediately shows up in the facilitator's
 * "My Events" (which reads subscriptions). No Event sidecar yet — this is the
 * zero-migration model; activities are added as child statements afterward.
 */

export interface CreateEventUser {
	uid: string;
	displayName?: string | null;
	email?: string | null;
	photoURL?: string | null;
}

export interface CreateEventInput {
	title: string;
	user: CreateEventUser;
}

export async function createEvent(
	db: Firestore,
	input: CreateEventInput,
): Promise<FacilitatorEvent> {
	const title = input.title.trim();
	if (!title) throw new Error('Event title is required');

	const creator: User = {
		uid: input.user.uid,
		displayName: input.user.displayName || 'Facilitator',
		email: input.user.email || '',
		photoURL: input.user.photoURL || '',
		isAnonymous: false,
	};

	const statementId = getRandomUID();
	// NOTE: do NOT set `creatorRole` on the statement — Firestore rules block
	// creates that set it (`setsCreatorRoleOnCreate`). The creator's role is
	// established by the subscription below.
	const group = createStatementObject({
		statement: title,
		statementType: StatementType.group,
		parentId: 'top',
		topParentId: statementId,
		statementId,
		creatorId: creator.uid,
		creator,
	});
	if (!group) throw new Error('Failed to build the event');

	// Event group is open for participants to join by default.
	group.membership = { access: Access.openToAll };

	await setDoc(doc(db, Collections.statements, statementId), group).catch((e: unknown) => {
		const err = e as { code?: string; message?: string };
		throw Object.assign(new Error(`event-group write failed: ${err?.message ?? e}`), {
			code: err?.code,
			step: 'group',
		});
	});

	// Creator subscription so the event appears in "My Events".
	const subId = getStatementSubscriptionId(statementId, creator);
	if (!subId) throw new Error('Failed to build subscription id');

	const now = Date.now();
	const subscription = {
		role: Role.creator,
		userId: creator.uid,
		statementId,
		statementsSubscribeId: subId,
		statement: statementToSimpleStatement(group),
		user: creator,
		lastUpdate: now,
		createdAt: now,
		parentId: 'top',
		statementType: StatementType.group,
		topParentId: statementId,
		getInAppNotification: true,
	};
	await setDoc(doc(db, Collections.statementsSubscribe, subId), subscription).catch(
		(e: unknown) => {
			const err = e as { code?: string; message?: string };
			throw Object.assign(new Error(`event-subscription write failed: ${err?.message ?? e}`), {
				code: err?.code,
				step: 'subscription',
			});
		},
	);

	return {
		statementId,
		title,
		role: Role.creator,
		createdAt: now,
		lastUpdate: now,
	};
}
