import { Role, StatementType } from '@freedi/shared-types';
import type { RepairCandidate, RepairPatch } from './subscriptionRepairPlan';

/**
 * What a repair changes for people, beyond the doc itself. Pure, so a dry run
 * can print it before anybody decides to write.
 *
 * `statementType` is the field with a reach. Three readers key on it:
 *   - membersOfStatementQuery (membersPage.ts): the goal.
 *   - getNewStatementsFromSubscriptions and fetchOlderDiscussionSubscriptions
 *     (getSubscriptions.ts): the Home listener. It is the only listener that
 *     reaches a NESTED subscription, so these docs reach the Redux store, and so
 *     every screen built on it, for the first time.
 *   - updateMemberCount (fn_subscriptionLifecycle.ts): counts `!= document`, and
 *     Firestore's `!=` skips a doc lacking the field, so the count rises at the
 *     next join or leave in that statement.
 *
 * `parentId` and `topParentId` are never written. Neither is needed, and:
 *   - parentId can flip isTopLevelSubscription where the embedded copy is stale,
 *     which runs reconcileUserFeedEntry and writes userFeed.
 *   - topParentId would widen revokeHomeAdminCopies (classHome.ts) and the
 *     lesson move (moveClassLessonsHome.ts), both of which query on it.
 *
 * The type lists below mirror the client, which functions cannot import:
 * NON_DOCUMENT_STATEMENT_TYPES (statementTypeHelpers.ts, pinned by the test
 * beside this file) and HIDDEN_TYPES (homeModel.ts).
 */

const STATEMENT_TYPES: ReadonlySet<unknown> = new Set(Object.values(StatementType));

export function isStatementType(value: unknown): value is StatementType {
	return STATEMENT_TYPES.has(value);
}

export const MEMBERS_EXCLUDED_TYPES: readonly StatementType[] = [
	StatementType.document,
	StatementType.agreement,
];

const HOME_QUESTIONS_EXCLUDED_TYPES: readonly StatementType[] = [
	StatementType.document,
	StatementType.paragraph,
	StatementType.option,
];

/** The elevated roles the Home listener asks for (it also asks for `member`, never scanned here). */
const HOME_LISTENER_ROLES: ReadonlySet<unknown> = new Set([Role.admin, Role.creator]);

export type RepairSurface =
	| 'membersList'
	| 'homeQuestions'
	| 'homeSpaces'
	| 'sideMenu'
	| 'askSpacePicker'
	| 'homeNoRow'
	| 'memberCount';

/** Same test the Home screen applies: the doc's own parentId wins over its frozen copy. */
export function isTopLevelDoc(data: RepairCandidate): boolean {
	return (data.parentId || data.statement?.parentId) === 'top';
}

function isListedType(type: unknown): boolean {
	return isStatementType(type) && !MEMBERS_EXCLUDED_TYPES.includes(type);
}

/** The two fields the Members query needs, as they stand once the patch is applied. */
export function membersFieldsAfter(
	data: RepairCandidate,
	patch: RepairPatch,
): { statementType: unknown; createdAt: unknown } {
	return {
		statementType: data.statementType || patch.statementType,
		// A createdAt that is present stays, even a bad one: only a missing one is filled.
		createdAt: data.createdAt !== undefined ? data.createdAt : patch.createdAt,
	};
}

/** True when this doc could reach Home only through the type the repair adds. */
export function wouldJoinHomeListener(data: RepairCandidate, patch: RepairPatch): boolean {
	return (
		!!patch.statementType && isListedType(patch.statementType) && HOME_LISTENER_ROLES.has(data.role)
	);
}

interface EffectInput {
	data: RepairCandidate;
	patch: RepairPatch;
	/** The doc already has a userFeed entry, so Home already shows it. */
	hasFeedEntry: boolean;
}

function homeSurfaces(data: RepairCandidate, type: StatementType): RepairSurface[] {
	const isTop = isTopLevelDoc(data);
	const surfaces: RepairSurface[] = [];
	if (!data.isDocument) {
		if (isTop && type === StatementType.group) surfaces.push('homeSpaces');
		const isQuestionRow =
			type === StatementType.question ||
			(isTop && type !== StatementType.group && !HOME_QUESTIONS_EXCLUDED_TYPES.includes(type));
		if (isQuestionRow) surfaces.push('homeQuestions');
	}
	// Both side lists read topSubscriptionsSelector, so nested docs never reach them.
	if (isTop && (type === StatementType.group || type === StatementType.question)) {
		surfaces.push('sideMenu');
	}
	if (isTop && type === StatementType.group) surfaces.push('askSpacePicker');

	return surfaces.length > 0 ? surfaces : ['homeNoRow'];
}

/** Every surface where this repair makes the doc appear or count for the first time. */
export function newlyVisibleOn({ data, patch, hasFeedEntry }: EffectInput): RepairSurface[] {
	const surfaces: RepairSurface[] = [];
	const { statementType: type, createdAt } = membersFieldsAfter(data, patch);
	const wasListed = isListedType(data.statementType) && data.createdAt !== undefined;
	if (!wasListed && isListedType(type) && createdAt !== undefined) surfaces.push('membersList');

	if (patch.statementType && patch.statementType !== StatementType.document) {
		surfaces.push('memberCount');
	}
	if (patch.statementType && wouldJoinHomeListener(data, patch) && !hasFeedEntry) {
		surfaces.push(...homeSurfaces(data, patch.statementType));
	}

	return surfaces;
}

export type MembersOutcome = 'listed' | 'byType' | 'typeHeldBack' | 'noType' | 'noDate';

interface OutcomeInput {
	/** The stored type once the patch is applied. */
	statementType: unknown;
	/** The stored createdAt once the patch is applied. */
	createdAt: unknown;
	typeHeldBack: boolean;
}

/** Where a doc stands in the Members query after this run, and why it is absent if it is. */
export function membersOutcome({
	statementType,
	createdAt,
	typeHeldBack,
}: OutcomeInput): MembersOutcome {
	if (typeHeldBack) return 'typeHeldBack';
	if (!isStatementType(statementType)) return 'noType';
	if (MEMBERS_EXCLUDED_TYPES.includes(statementType)) return 'byType';

	return createdAt === undefined ? 'noDate' : 'listed';
}

interface SurfaceCount {
	docs: number;
	users: Set<string>;
	statements: Set<string>;
}

export interface EffectTally {
	surfaces: Record<RepairSurface, SurfaceCount>;
	/** Repaired top-level docs Home already showed through their userFeed entry. */
	alreadyOnHome: number;
}

const newCount = (): SurfaceCount => ({ docs: 0, users: new Set(), statements: new Set() });

export function emptyEffectTally(): EffectTally {
	return {
		surfaces: {
			membersList: newCount(),
			homeQuestions: newCount(),
			homeSpaces: newCount(),
			sideMenu: newCount(),
			askSpacePicker: newCount(),
			homeNoRow: newCount(),
			memberCount: newCount(),
		},
		alreadyOnHome: 0,
	};
}

export function recordEffects(
	tally: EffectTally,
	surfaces: readonly RepairSurface[],
	userId: string,
	statementId: string,
): void {
	for (const surface of surfaces) {
		const count = tally.surfaces[surface];
		count.docs += 1;
		count.users.add(userId);
		count.statements.add(statementId);
	}
}

/** Counts only: uids and statement ids are held for the distinct totals and never printed. */
export function formatEffectLines(tally: EffectTally, dryRun: boolean): string[] {
	const line = (label: string, surface: RepairSurface): string => {
		const { docs, users } = tally.surfaces[surface];

		return `  ${label}: ${docs} doc(s), ${users.size} user(s).`;
	};
	const { memberCount, membersList } = tally.surfaces;

	return [
		`Newly listed in Members: ${membersList.docs} doc(s) in ${membersList.statements.size} statement(s).`,
		`Newly appears for hosts because of statementType (${dryRun ? 'would appear' : 'appeared'}; a top-level doc counts only if it has no userFeed entry):`,
		line('Home, Questions list', 'homeQuestions'),
		line('Home, Spaces list', 'homeSpaces'),
		line('Side menu', 'sideMenu'),
		line('Ask a question, space picker', 'askSpacePicker'),
		line('Home listener only, no row (still takes a slot in its page)', 'homeNoRow'),
		`  Already on Home through userFeed, no new row: ${tally.alreadyOnHome} doc(s).`,
		`numberOfMembers, at the next join or leave in that statement: +${memberCount.docs} across ${memberCount.statements.size} statement(s).`,
		'userFeed: no writes. The repair does not change role, parentId or the embedded statement, so feedRelevantChange stays false.',
	];
}
