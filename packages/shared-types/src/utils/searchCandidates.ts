import { StatementType } from '../models/TypeEnums';
import { Role } from '../models/user/UserSettings';
import type { SearchCandidate } from '../models/search/searchModel';

/**
 * Turn statements and subscriptions into search candidates — one mapping for
 * the main app and the `searchStatements` callable, so both agree on what is
 * searchable.
 *
 * The input shapes are deliberately loose: the server reads these docs with
 * `select()` (only the fields search needs), and legacy docs miss fields.
 */

/** Child text and Sign documents are not destinations of their own in the main app. */
export const NON_SEARCHABLE_STATEMENT_TYPES: ReadonlySet<StatementType> = new Set([
	StatementType.paragraph,
	StatementType.document,
]);

const INACTIVE_SUBSCRIPTION_ROLES: ReadonlySet<Role> = new Set([Role.banned, Role.unsubscribed]);

export interface SearchableStatement {
	statementId: string;
	statement: string;
	statementType: StatementType;
	parentId?: string;
	topParentId?: string;
	description?: string;
	lastUpdate?: number;
	createdAt?: number;
	hide?: boolean;
}

export interface SearchableSubscription {
	statementId: string;
	role?: Role;
	parentId?: string;
	topParentId?: string;
	statementType?: StatementType;
	lastUpdate?: number;
	isDocument?: boolean;
	statement?: {
		statement?: string;
		description?: string;
		statementType?: StatementType;
		parentId?: string;
		lastUpdate?: number;
		createdAt?: number;
	};
}

const TOP = 'top';

export function statementToSearchCandidate(statement: SearchableStatement): SearchCandidate | null {
	if (!statement.statementId || typeof statement.statement !== 'string') return null;
	// `hide === undefined` means visible — only an explicit true hides.
	if (statement.hide === true) return null;
	if (!statement.statementType || NON_SEARCHABLE_STATEMENT_TYPES.has(statement.statementType)) {
		return null;
	}

	const parentId = statement.parentId || TOP;
	const topParentId =
		statement.topParentId || (parentId === TOP ? statement.statementId : parentId);

	return {
		statementId: statement.statementId,
		title: statement.statement,
		description: statement.description || undefined,
		statementType: statement.statementType,
		parentId,
		topParentId,
		lastUpdate: statement.lastUpdate ?? statement.createdAt ?? 0,
	};
}

export function subscriptionToSearchCandidate(
	subscription: SearchableSubscription,
): SearchCandidate | null {
	if (subscription.isDocument) return null;
	if (subscription.role && INACTIVE_SUBSCRIPTION_ROLES.has(subscription.role)) return null;

	const embedded = subscription.statement;
	if (!embedded || typeof embedded.statement !== 'string') return null;

	const statementType = subscription.statementType ?? embedded.statementType;
	if (!statementType) return null;

	return statementToSearchCandidate({
		statementId: subscription.statementId,
		statement: embedded.statement,
		description: embedded.description,
		statementType,
		parentId: subscription.parentId ?? embedded.parentId,
		topParentId: subscription.topParentId,
		lastUpdate: subscription.lastUpdate ?? embedded.lastUpdate ?? embedded.createdAt,
	});
}

export function isTopLevelSearchCandidate(candidate: SearchCandidate): boolean {
	return candidate.parentId === TOP;
}

export function isSearchCandidate(value: SearchCandidate | null): value is SearchCandidate {
	return value !== null;
}
