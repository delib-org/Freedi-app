import type { Firestore } from 'firebase-admin/firestore';
import { Collections, OPEN_ACCESS_SCOPE, Role, type Statement } from '@freedi/shared-types';

/** What it takes to tell whether a level was planted inside a private one. */
export type LevelOrigin = Pick<Statement, 'statementId'> &
	Partial<Pick<Statement, 'accessScope' | 'creatorId' | 'topParentId'>>;

const ACTIVE_ROLES: readonly string[] = [Role.member, Role.admin, Role.creator];
const HOST_ROLES: readonly string[] = [Role.admin, Role.creator];

export function levelOriginOf(statement: Statement): LevelOrigin {
	return {
		statementId: statement.statementId,
		accessScope: statement.accessScope,
		creatorId: statement.creatorId,
		topParentId: statement.topParentId,
	};
}

/** A level governed by a private level above it, made by someone, so it could be a plant. */
function mayBePlanted(origin: LevelOrigin | undefined): origin is LevelOrigin & {
	accessScope: string;
	creatorId: string;
} {
	const scope = origin?.accessScope;

	return (
		Boolean(origin?.creatorId) &&
		Boolean(scope) &&
		scope !== OPEN_ACCESS_SCOPE &&
		scope !== origin?.statementId
	);
}

/**
 * The levels made inside a private level by someone with no way into it. Before
 * the create rule checked the parent, anyone could create a statement under a
 * private level and so hold a host role there, its creator's. Such a level is
 * no host source. Its creator must be an active member of the private level
 * governing it, or a host of the top. A level with no creator was written by the
 * server and is trusted.
 */
export async function findPlantedLevels(
	firestore: Firestore,
	origins: readonly (LevelOrigin | undefined)[],
): Promise<Set<string>> {
	const candidates = origins.filter(mayBePlanted);
	if (candidates.length === 0) return new Set();

	const ids = [
		...new Set(
			candidates.flatMap(({ creatorId, accessScope, topParentId }) => [
				`${creatorId}--${accessScope}`,
				...(topParentId && topParentId !== 'top' ? [`${creatorId}--${topParentId}`] : []),
			]),
		),
	];
	const subscriptions = firestore.collection(Collections.statementsSubscribe);
	const snaps = await firestore.getAll(...ids.map((id) => subscriptions.doc(id)));
	const roles = new Map(
		ids.map((id, index) => [id, (snaps[index].data() as { role?: string } | undefined)?.role]),
	);

	return new Set(
		candidates
			.filter(({ creatorId, accessScope, topParentId }) => {
				const atScope = roles.get(`${creatorId}--${accessScope}`);
				const atTop = roles.get(`${creatorId}--${topParentId}`);
				const isTrusted =
					(atScope !== undefined && ACTIVE_ROLES.includes(atScope)) ||
					(atTop !== undefined && HOST_ROLES.includes(atTop));

				return !isTrusted;
			})
			.map(({ statementId }) => statementId),
	);
}

/** Whether one statement is a planted level. */
export async function isPlantedLevel(firestore: Firestore, statement: Statement): Promise<boolean> {
	const planted = await findPlantedLevels(firestore, [levelOriginOf(statement)]);

	return planted.has(statement.statementId);
}

interface RoleAtLevel {
	role: string | undefined;
}

/**
 * The same levels with any host role on a planted level taken away. A ban stays:
 * it only ever refuses. Reads only when a host role sits on a level that could be
 * a plant.
 */
export async function withoutPlantedHosts<T extends RoleAtLevel>(
	firestore: Firestore,
	levels: readonly T[],
	origins: readonly (LevelOrigin | undefined)[],
): Promise<T[]> {
	const hosted = levels
		.map((level, index) =>
			level.role && HOST_ROLES.includes(level.role) ? origins[index] : undefined,
		)
		.filter((origin): origin is LevelOrigin => Boolean(origin));
	const planted = await findPlantedLevels(firestore, hosted);
	if (planted.size === 0) return [...levels];

	return levels.map((level, index) => {
		const id = origins[index]?.statementId;

		return id && planted.has(id) && level.role && HOST_ROLES.includes(level.role)
			? { ...level, role: undefined }
			: level;
	});
}
