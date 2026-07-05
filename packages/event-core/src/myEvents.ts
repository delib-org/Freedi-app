import {
	collection,
	getDocs,
	query,
	where,
	type Firestore,
} from 'firebase/firestore';
import { Collections, Role, StatementType } from '@freedi/shared-types';

/**
 * Event Control Center — "my events" query (framework-agnostic).
 *
 * A facilitator's events are the top-level `group` Statements they administer.
 * We read that straight from their subscriptions (`statementsSubscribe`) — no
 * Event sidecar needed for the list — filtering to admin/creator roles and
 * top-level groups. This is the zero-migration adoption path.
 */

export interface FacilitatorEvent {
	statementId: string;
	title: string;
	role: Role;
	createdAt: number;
	lastUpdate: number;
	imageURL?: string;
}

const FACILITATOR_ROLES: Role[] = [Role.admin, Role.creator];

interface SubscriptionLike {
	role?: Role;
	statementId?: string;
	lastUpdate?: number;
	createdAt?: number;
	statement?: {
		statementId?: string;
		statement?: string;
		statementType?: StatementType;
		parentId?: string;
		createdAt?: number;
		lastUpdate?: number;
		imageURL?: string;
	};
}

function isTopLevelGroup(sub: SubscriptionLike): boolean {
	const s = sub.statement;
	if (!s) return false;

	return s.statementType === StatementType.group && s.parentId === 'top';
}

/**
 * List the top-level group events the given user administers, newest first.
 */
export async function listFacilitatorEvents(
	db: Firestore,
	userId: string,
): Promise<FacilitatorEvent[]> {
	const subsRef = collection(db, Collections.statementsSubscribe);
	const q = query(
		subsRef,
		where('userId', '==', userId),
		where('role', 'in', FACILITATOR_ROLES),
	);

	const snapshot = await getDocs(q);
	const events: FacilitatorEvent[] = [];

	snapshot.forEach((docSnap) => {
		const sub = docSnap.data() as SubscriptionLike;
		if (!isTopLevelGroup(sub)) return;
		const s = sub.statement!;
		events.push({
			statementId: s.statementId ?? sub.statementId ?? '',
			title: s.statement ?? '',
			role: sub.role ?? Role.member,
			createdAt: s.createdAt ?? sub.createdAt ?? 0,
			lastUpdate: s.lastUpdate ?? sub.lastUpdate ?? 0,
			imageURL: s.imageURL,
		});
	});

	return events.sort((a, b) => b.lastUpdate - a.lastUpdate);
}
