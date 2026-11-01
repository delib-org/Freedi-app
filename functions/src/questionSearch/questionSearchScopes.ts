import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { Collections, Role } from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';

/**
 * Who may see which questions in "search by meaning", and how hits are merged.
 *
 * A question is in the caller's scope when the caller created it, or when the
 * caller holds the ADMIN role on its tree's top statement (whole tree) or on
 * the question itself / one of its ancestors (that sub-tree only). Nothing
 * else, whatever the question's membership settings.
 */

export const QUESTION_SEARCH_LIMITS = {
	/** Nearest neighbours fetched per findNearest call (creator scope and each tree). */
	NEAREST_PER_SCOPE: 20,
	/** Admin trees searched per call — the most recently active ones. */
	MAX_ADMIN_TREES: 10,
	/** Admin subscriptions read to choose those trees. */
	MAX_ADMIN_SUBSCRIPTIONS_SCANNED: 50,
	/** Cosine similarity floor; below it a hit is noise. */
	MIN_SIMILARITY: 0.3,
	/** Hits re-checked against the live statement, beyond the requested limit. */
	VERIFY_SLACK: 10,
} as const;

/** gRPC FAILED_PRECONDITION — typically a composite index not built yet. */
const FAILED_PRECONDITION = 9;

/** The caller's admin access inside one tree. */
export interface AdminTreeScope {
	topParentId: string;
	/** Admin on the tree's top statement: every question in the tree. */
	wholeTree: boolean;
	/** Otherwise: admin on these statements, so their sub-trees only. */
	roots: Set<string>;
	lastUpdate: number;
}

export interface QuestionScopes {
	uid: string;
	trees: AdminTreeScope[];
}

/** The fields of a question (vector mirror or live statement) access depends on. */
export interface ScopedQuestion {
	statementId: string;
	creatorId?: string;
	topParentId?: string;
	parents?: string[];
	hide?: boolean;
}

export interface QuestionHit {
	statementId: string;
	similarity: number;
	/** The mirrored fields on the vector doc (pre-filter only, not trusted). */
	mirror: ScopedQuestion;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

interface AdminSubscription {
	statementId: string;
	topParentId: string;
	isTop: boolean;
	lastUpdate: number;
}

/** A subscription's tree, from its own fields or its copy of the statement. */
export function toAdminSubscription(data: DocumentData): AdminSubscription | null {
	const statementId = data.statementId;
	if (!isNonEmptyString(statementId)) return null;

	const copy = (data.statement ?? {}) as Record<string, unknown>;
	const parentId = data.parentId ?? copy.parentId;
	// Legacy data sometimes stores 'top' as the top parent: not a real tree id.
	const declaredTop =
		[data.topParentId, copy.topParentId].find(
			(value): value is string => isNonEmptyString(value) && value !== 'top',
		) ?? null;
	// A top-level statement is always its own tree, whatever topParentId says.
	const isTop = parentId === 'top' || declaredTop === statementId;
	const topParentId = isTop ? statementId : declaredTop;
	if (!topParentId) return null;

	return {
		statementId,
		topParentId,
		isTop,
		lastUpdate: typeof data.lastUpdate === 'number' ? data.lastUpdate : 0,
	};
}

/** Group admin subscriptions into trees, most recent first, capped. */
export function groupAdminTrees(
	subscriptions: readonly AdminSubscription[],
	maxTrees: number = QUESTION_SEARCH_LIMITS.MAX_ADMIN_TREES,
): AdminTreeScope[] {
	const byTree = new Map<string, AdminTreeScope>();
	for (const sub of subscriptions) {
		const tree = byTree.get(sub.topParentId) ?? {
			topParentId: sub.topParentId,
			wholeTree: false,
			roots: new Set<string>(),
			lastUpdate: 0,
		};
		if (sub.isTop) tree.wholeTree = true;
		else tree.roots.add(sub.statementId);
		tree.lastUpdate = Math.max(tree.lastUpdate, sub.lastUpdate);
		byTree.set(sub.topParentId, tree);
	}

	return [...byTree.values()].sort((a, b) => b.lastUpdate - a.lastUpdate).slice(0, maxTrees);
}

const SUBSCRIPTION_FIELDS = [
	'statementId',
	'parentId',
	'topParentId',
	'lastUpdate',
	'statement.parentId',
	'statement.topParentId',
] as const;

/**
 * The trees the caller administers. Prefers the most recently active ones
 * (needs the userId+role+lastUpdate index); until that index exists it falls
 * back to an unordered read so the search still works.
 */
export async function loadAdminTrees(firestore: Firestore, uid: string): Promise<AdminTreeScope[]> {
	const base = firestore
		.collection(Collections.statementsSubscribe)
		.where('userId', '==', uid)
		.where('role', '==', Role.admin);
	const max = QUESTION_SEARCH_LIMITS.MAX_ADMIN_SUBSCRIPTIONS_SCANNED;

	let docs: DocumentData[];
	try {
		const snap = await base
			.select(...SUBSCRIPTION_FIELDS)
			.orderBy('lastUpdate', 'desc')
			.limit(max)
			.get();
		docs = snap.docs.map((doc) => doc.data());
	} catch (error) {
		const code = (error as { code?: unknown } | null)?.code;
		if (code !== FAILED_PRECONDITION) throw error;

		logError(error, {
			operation: 'questionSearchScopes.loadAdminTrees',
			userId: uid,
			metadata: { fallback: 'unordered admin subscriptions (index missing)' },
		});
		const snap = await base
			.select(...SUBSCRIPTION_FIELDS)
			.limit(max)
			.get();
		docs = snap.docs.map((doc) => doc.data());
	}

	const subscriptions = docs
		.map(toAdminSubscription)
		.filter((sub): sub is AdminSubscription => sub !== null);

	return groupAdminTrees(subscriptions);
}

/**
 * The one access rule, used twice: on the vector doc's mirror (cheap
 * pre-filter) and on the live statement (the real gate). Hidden questions are
 * never in scope.
 */
export function isQuestionInScope(question: ScopedQuestion, scopes: QuestionScopes): boolean {
	if (question.hide === true) return false;
	if (isNonEmptyString(question.creatorId) && question.creatorId === scopes.uid) return true;

	const tree = scopes.trees.find((scope) => scope.topParentId === question.topParentId);
	if (!tree) return false;
	if (tree.wholeTree) return true;
	if (tree.roots.has(question.statementId)) return true;

	return (question.parents ?? []).some((ancestor) => tree.roots.has(ancestor));
}

/** One list from many findNearest results: best similarity per question, best first. */
export function mergeQuestionHits(groups: ReadonlyArray<readonly QuestionHit[]>): QuestionHit[] {
	const best = new Map<string, QuestionHit>();
	for (const hit of groups.flat()) {
		const seen = best.get(hit.statementId);
		if (!seen || hit.similarity > seen.similarity) best.set(hit.statementId, hit);
	}

	return [...best.values()].sort(
		(a, b) => b.similarity - a.similarity || a.statementId.localeCompare(b.statementId),
	);
}
