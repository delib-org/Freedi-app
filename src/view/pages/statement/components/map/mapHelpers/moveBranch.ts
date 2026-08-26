import { Results, Statement } from '@freedi/shared-types';
import { validateStatementTypeHierarchy } from '@/controllers/general/helpers';
import { sortSiblings } from './siblingOrder';

/**
 * Where MindElixir dropped the dragged node relative to the node it met.
 * `in` makes the target the new parent; `before`/`after` make the target's
 * parent the new parent (the node becomes a sibling of the target).
 */
export type DropKind = 'in' | 'before' | 'after';

/** Flatten the map's Results tree into a plain statement list. */
export function flattenResults(results: Results): Statement[] {
	const out: Statement[] = [results.top];
	results.sub.forEach((sub) => out.push(...flattenResults(sub)));

	return out;
}

/**
 * Every statement under `rootId`, walking `parentId` edges (the DB truth),
 * NOT the visual tree — clusters absorb their members visually while those
 * members keep `parentId = question`, so the visual tree would over-collect.
 * The root itself is not included. Cycle-safe.
 */
export function collectSubtree(all: Statement[], rootId: string): Statement[] {
	const childrenByParent = new Map<string, Statement[]>();
	all.forEach((statement) => {
		if (!statement.parentId) return;
		const siblings = childrenByParent.get(statement.parentId) ?? [];
		siblings.push(statement);
		childrenByParent.set(statement.parentId, siblings);
	});

	const collected: Statement[] = [];
	const seen = new Set<string>([rootId]);
	const queue = [rootId];

	while (queue.length > 0) {
		const currentId = queue.shift() as string;
		(childrenByParent.get(currentId) ?? []).forEach((child) => {
			if (seen.has(child.statementId)) return;
			seen.add(child.statementId);
			collected.push(child);
			queue.push(child.statementId);
		});
	}

	return collected;
}

/**
 * Resolve which statement becomes the new parent for a drop. Returns null when
 * the drop makes no sense (unknown ids, or dropping next to the map root, which
 * has no parent inside the map).
 */
export function resolveNewParent(
	all: Statement[],
	targetId: string,
	kind: DropKind,
): Statement | null {
	const target = all.find((statement) => statement.statementId === targetId);
	if (!target) return null;
	if (kind === 'in') return target;

	if (!target.parentId) return null;

	return all.find((statement) => statement.statementId === target.parentId) ?? null;
}

export interface MoveValidation {
	allowed: boolean;
	/** Translation key explaining the refusal. */
	reasonKey?: string;
}

/**
 * Client-side guard mirroring the hierarchy rules. Firestore stays the
 * authority; this only keeps the map from asking for a move it knows is
 * illegal.
 */
export function validateMove(
	dragged: Statement,
	newParent: Statement,
	subtree: Statement[],
): MoveValidation {
	if (dragged.statementId === newParent.statementId) {
		return { allowed: false, reasonKey: 'A statement cannot be moved into itself' };
	}

	if (dragged.parentId === newParent.statementId) {
		return { allowed: false, reasonKey: 'The statement is already here' };
	}

	if (subtree.some((child) => child.statementId === newParent.statementId)) {
		return { allowed: false, reasonKey: 'A statement cannot be moved into its own branch' };
	}

	const hierarchy = validateStatementTypeHierarchy(newParent, dragged.statementType);
	if (!hierarchy.allowed) {
		return { allowed: false, reasonKey: hierarchy.reason ?? 'This move is not allowed' };
	}

	return { allowed: true };
}

export interface SiblingOrder {
	statementId: string;
	order: number;
}

/**
 * Renumber a destination parent's children so the dragged nodes sit exactly
 * where they were dropped. The whole sibling set is renumbered (rather than
 * squeezing a fractional index in) so a set that had no explicit order at all
 * ends up fully ordered in one write — which is what makes the sort in the
 * transform take effect.
 */
export function computeSiblingOrder(
	all: Statement[],
	newParentId: string,
	draggedIds: string[],
	targetId: string,
	kind: DropKind,
): SiblingOrder[] {
	const draggedSet = new Set(draggedIds);
	const dragged = draggedIds
		.map((id) => all.find((candidate) => candidate.statementId === id))
		.filter((candidate): candidate is Statement => Boolean(candidate));

	const rest = sortSiblings(
		all.filter((candidate) => candidate.parentId === newParentId),
		(candidate) => candidate,
	).filter((candidate) => !draggedSet.has(candidate.statementId));

	// Dropping *into* a node appends to that node's children; dropping next to a
	// sibling lands immediately before or after it.
	let insertAt = rest.length;
	if (kind !== 'in') {
		const targetIndex = rest.findIndex((candidate) => candidate.statementId === targetId);
		if (targetIndex !== -1) {
			insertAt = kind === 'before' ? targetIndex : targetIndex + 1;
		}
	}

	const ordered = [...rest.slice(0, insertAt), ...dragged, ...rest.slice(insertAt)];

	return ordered.map((statement, index) => ({ statementId: statement.statementId, order: index }));
}
