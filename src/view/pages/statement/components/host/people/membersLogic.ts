import { Role, StatementSubscription } from '@freedi/shared-types';

/**
 * Pure rules of the Members list (UX main-people-settings §3.3, §4.4): who a
 * row is, which chip it falls under, the order, and what a host may do to it.
 */

export const MEMBER_FILTERS = ['all', 'hosts', 'members', 'waiting', 'blocked'] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export type MemberKind = 'creator' | 'host' | 'member' | 'waiting' | 'blocked';

/** The writes a Members row offers; Let in / Decline go through Waiting's decisions. */
export type RoleAction = 'makeHost' | 'removeHost' | 'block' | 'unblock';
export type MemberAction = RoleAction | 'letIn' | 'decline';

export interface MemberEntry {
	subscription: StatementSubscription;
	id: string;
	uid: string;
	name: string;
	photoURL?: string | null;
	kind: MemberKind;
	isSelf: boolean;
}

export interface MemberContext {
	creatorUid: string | undefined;
	selfUid: string | undefined;
	/** Optimistic roles by subscription id, while a write is in flight. */
	roleOverrides?: ReadonlyMap<string, Role>;
	/** Shown for someone whose name is not known (yet). */
	unnamedLabel?: string;
}

const KIND_BY_ROLE: Partial<Record<Role, MemberKind>> = {
	[Role.creator]: 'creator',
	[Role.admin]: 'host',
	[Role.member]: 'member',
	[Role.waiting]: 'waiting',
	[Role.banned]: 'blocked',
};

const KINDS_BY_FILTER: Record<Exclude<MemberFilter, 'all'>, ReadonlyArray<MemberKind>> = {
	hosts: ['creator', 'host'],
	members: ['member'],
	waiting: ['waiting'],
	blocked: ['blocked'],
};

/** Creator at the top, then hosts, then everyone else; blocked sink to the bottom. */
const SORT_RANK: Record<MemberKind, number> = {
	creator: 0,
	host: 1,
	member: 2,
	waiting: 2,
	blocked: 3,
};

/** Unsubscribed (and unknown) roles are not people of this space: never listed or counted. */
export function kindOf(
	role: Role | undefined,
	uid: string,
	creatorUid: string | undefined,
): MemberKind | null {
	if (creatorUid && uid === creatorUid) return 'creator';

	return role ? (KIND_BY_ROLE[role] ?? null) : null;
}

/**
 * The person a subscription belongs to is `userId`, the field its doc id is
 * built from. `user` may hold someone else: server-written admin subscriptions
 * store the statement's creator there, so it only describes this person when
 * its uid agrees. A doc with no `userId` is a legacy one: `user` is all it has.
 */
export function subscriberUid(subscription: StatementSubscription): string | undefined {
	return subscription.userId || subscription.user?.uid;
}

export function toMemberEntries(
	subscriptions: ReadonlyArray<StatementSubscription>,
	{ creatorUid, selfUid, roleOverrides, unnamedLabel = '' }: MemberContext,
): MemberEntry[] {
	return subscriptions.flatMap((subscription) => {
		const uid = subscriberUid(subscription);
		if (!uid) return [];
		const id = subscription.statementsSubscribeId;
		const role = roleOverrides?.get(id) ?? subscription.role;
		const kind = kindOf(role, uid, creatorUid);
		if (!kind) return [];
		const ownUser = subscription.user?.uid === uid ? subscription.user : undefined;

		return [
			{
				subscription,
				id,
				uid,
				name: ownUser?.displayName?.trim() || unnamedLabel,
				photoURL: ownUser?.photoURL,
				kind,
				isSelf: uid === selfUid,
			},
		];
	});
}

/** Everyone the Members list counts under All (unsubscribed and unknown roles excluded). */
export function countPeople(
	subscriptions: ReadonlyArray<StatementSubscription>,
	creatorUid: string | undefined,
): number {
	return subscriptions.filter((subscription) => {
		const uid = subscriberUid(subscription);

		return !!uid && kindOf(subscription.role, uid, creatorUid);
	}).length;
}

export function matchesFilter(kind: MemberKind, filter: MemberFilter): boolean {
	return filter === 'all' || KINDS_BY_FILTER[filter].includes(kind);
}

export function countByFilter(entries: ReadonlyArray<MemberEntry>): Record<MemberFilter, number> {
	const counts = Object.fromEntries(MEMBER_FILTERS.map((filter) => [filter, 0])) as Record<
		MemberFilter,
		number
	>;
	entries.forEach((entry) => {
		MEMBER_FILTERS.forEach((filter) => {
			if (matchesFilter(entry.kind, filter)) counts[filter] += 1;
		});
	});

	return counts;
}

export function compareMembers(a: MemberEntry, b: MemberEntry): number {
	const byRank = SORT_RANK[a.kind] - SORT_RANK[b.kind];

	return byRank !== 0 ? byRank : a.name.localeCompare(b.name);
}

/** The rows a chip and a search show, in list order. */
export function selectMembers(
	entries: ReadonlyArray<MemberEntry>,
	filter: MemberFilter,
	search: string,
): MemberEntry[] {
	const needle = search.trim().toLowerCase();

	return entries
		.filter((entry) => matchesFilter(entry.kind, filter))
		.filter((entry) => !needle || entry.name.toLowerCase().includes(needle))
		.sort(compareMembers);
}

const ACTIONS_BY_KIND: Record<MemberKind, ReadonlyArray<MemberAction>> = {
	creator: [],
	// Hosts cannot be blocked: canBanUser, the Firestore rules and the
	// validateRoleChange trigger all refuse to ban an admin.
	host: ['removeHost'],
	member: ['makeHost', 'block'],
	waiting: ['letIn', 'decline'],
	blocked: ['unblock'],
};

/** Nothing on the creator's row or your own: you never demote or block yourself here. */
export function actionsFor(entry: MemberEntry, canManage: boolean): ReadonlyArray<MemberAction> {
	if (!canManage || entry.isSelf) return [];

	return ACTIONS_BY_KIND[entry.kind];
}

/** The role each write sets. */
export const TARGET_ROLE: Record<RoleAction, Role> = {
	makeHost: Role.admin,
	removeHost: Role.member,
	block: Role.banned,
	unblock: Role.member,
};

export function isRoleAction(action: MemberAction): action is RoleAction {
	return action in TARGET_ROLE;
}
