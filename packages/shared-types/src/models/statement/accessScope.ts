import { Access } from '../TypeEnums';

/**
 * Who may read a statement, as one value the database rules can check.
 *
 * Firestore list rules see only what a query filters on, so a tree query
 * (`parents array-contains X`) cannot be checked against X. Every statement
 * therefore carries `accessScope`, and every list filters on it: either
 * `'open'`, or the id of the statement whose access setting governs this one.
 *
 * Mirrors `functions/src/utils/statementAccess.ts`: a statement's own setting
 * wins, otherwise the nearest ancestor's. No setting at any level means open.
 */
export const OPEN_ACCESS_SCOPE = 'open';

const OPEN_ACCESS_VALUES: ReadonlySet<string> = new Set([
	Access.public,
	Access.open,
	Access.openToAll,
	Access.openForRegistered,
]);

/** The fields of one level of the tree that decide its scope. */
export interface AccessScopeLevel {
	statementId: string;
	membership?: { access?: string } | null;
	statementSettings?: { classHome?: unknown } | null;
}

export function isOpenAccessValue(access: string): boolean {
	return OPEN_ACCESS_VALUES.has(access);
}

function isClassHome(level: AccessScopeLevel): boolean {
	return level.statementSettings?.classHome != null;
}

function scopeOfSetting(level: AccessScopeLevel, access: string): string {
	return isOpenAccessValue(access) ? OPEN_ACCESS_SCOPE : level.statementId;
}

/**
 * @param subject the statement being stamped
 * @param ancestorsNearestFirst its ancestors, parent first, top statement last
 *
 * A class home is a teachers-only container: it governs itself, and its access
 * is never inherited by the lessons filed under it.
 */
export function resolveAccessScope(
	subject: AccessScopeLevel,
	ancestorsNearestFirst: readonly AccessScopeLevel[],
): string {
	if (isClassHome(subject)) return subject.statementId;

	const own = subject.membership?.access;
	if (own) return scopeOfSetting(subject, own);

	const owner = ancestorsNearestFirst.find(
		(level) => !isClassHome(level) && Boolean(level.membership?.access),
	);
	const access = owner?.membership?.access;

	return owner && access ? scopeOfSetting(owner, access) : OPEN_ACCESS_SCOPE;
}

/** What a new statement needs from its parent to be stamped without reading the tree. */
export interface AccessScopeParent {
	accessScope?: string;
	statementSettings?: { classHome?: unknown } | null;
}

/** A statement being written, as far as stamping is concerned. */
interface StampableStatement extends AccessScopeLevel {
	parentId?: string;
	accessScope?: string;
}

/**
 * The scope of a statement that is about to be created, or undefined when it
 * cannot be known yet (the parent has not been stamped). An undefined result
 * leaves the field off, and the server's create trigger stamps it.
 */
export function newStatementAccessScope(
	statement: StampableStatement,
	parent?: AccessScopeParent | null,
): string | undefined {
	const isTop = !statement.parentId || statement.parentId === 'top';
	if (isTop || isClassHome(statement) || statement.membership?.access) {
		return resolveAccessScope(statement, []);
	}
	if (parent?.statementSettings?.classHome != null) return OPEN_ACCESS_SCOPE;

	return parent?.accessScope;
}

/** Returns the statement with its scope set; unchanged when the scope is not known yet. */
export function stampAccessScope<T extends StampableStatement>(
	statement: T,
	parent?: AccessScopeParent | null,
): T & { accessScope?: string } {
	const accessScope = newStatementAccessScope(statement, parent);

	return accessScope === undefined ? statement : { ...statement, accessScope };
}

/** For an object literal built from a parent: `{ ...inheritedAccessScope(parent) }`. */
export function inheritedAccessScope(
	parent?: AccessScopeParent | null,
): { accessScope: string } | Record<string, never> {
	if (parent?.statementSettings?.classHome != null) return { accessScope: OPEN_ACCESS_SCOPE };

	return parent?.accessScope ? { accessScope: parent.accessScope } : {};
}

/**
 * The filter values for reading under a statement: open content plus the one
 * restricted scope governing it. Rules allow one restricted scope per query
 * (each can cost up to eight document reads against a limit of ten), so further
 * scopes need their own query.
 */
export function readScopesOf(statement?: { accessScope?: string } | null): string[] {
	const scope = statement?.accessScope;

	return scope && scope !== OPEN_ACCESS_SCOPE ? [OPEN_ACCESS_SCOPE, scope] : [OPEN_ACCESS_SCOPE];
}

/**
 * For a root whose id is itself the only level that can govern its tree (a top
 * statement, a lesson): no need to read it first. The rules accept a root that
 * turns out to be open, and nothing is stamped with its id in that case.
 */
export function readScopesOfRoot(rootId: string): string[] {
	return [OPEN_ACCESS_SCOPE, rootId];
}
