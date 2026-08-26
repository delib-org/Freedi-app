/**
 * Tests for mind-map drag-and-drop resolution. The map used to persist nothing
 * on drag because it read the wrong operation payload, and it only ever
 * re-parented the dragged node itself — these helpers cover both the target
 * resolution and the branch collection that fixed it.
 */

jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		statement: 'statement',
		option: 'option',
		question: 'question',
		group: 'group',
	},
}));

jest.mock('@/controllers/general/helpers', () => ({
	validateStatementTypeHierarchy: (
		parent: { statementType: string },
		childType: string,
	): { allowed: boolean; reason?: string } => {
		const disallowed: Record<string, string[]> = { option: ['option'], group: ['option'] };
		if (disallowed[parent.statementType]?.includes(childType)) {
			return { allowed: false, reason: 'Options cannot contain other options' };
		}

		return { allowed: true };
	},
}));

import {
	collectSubtree,
	computeSiblingOrder,
	flattenResults,
	resolveNewParent,
	validateMove,
} from '../mapHelpers/moveBranch';
import { sortSiblings } from '../mapHelpers/siblingOrder';
import { StatementType } from '@freedi/shared-types';
import type { Results, Statement } from '@freedi/shared-types';

function s(id: string, statementType: StatementType, parentId?: string): Statement {
	return { statementId: id, statement: id, statementType, parentId } as unknown as Statement;
}

function node(statement: Statement, sub: Results[] = []): Results {
	return { top: statement, sub };
}

//        root (question)
//        ├── q1 (question)
//        │   ├── o1 (option)
//        │   └── q2 (question)
//        │       └── o2 (option)
//        └── g1 (group)
const root = s('root', StatementType.question);
const q1 = s('q1', StatementType.question, 'root');
const o1 = s('o1', StatementType.option, 'q1');
const q2 = s('q2', StatementType.question, 'q1');
const o2 = s('o2', StatementType.option, 'q2');
const g1 = s('g1', StatementType.group, 'root');

const tree: Results = node(root, [node(q1, [node(o1), node(q2, [node(o2)])]), node(g1)]);

const all = flattenResults(tree);

describe('flattenResults', () => {
	it('returns every statement in the tree', () => {
		expect(all.map((statement) => statement.statementId).sort()).toEqual([
			'g1',
			'o1',
			'o2',
			'q1',
			'q2',
			'root',
		]);
	});
});

describe('collectSubtree', () => {
	it('collects descendants by parentId, excluding the root of the branch', () => {
		expect(
			collectSubtree(all, 'q1')
				.map((statement) => statement.statementId)
				.sort(),
		).toEqual(['o1', 'o2', 'q2']);
	});

	it('returns an empty list for a leaf', () => {
		expect(collectSubtree(all, 'o2')).toEqual([]);
	});

	it('does not loop forever on a parentId cycle', () => {
		const a = s('a', StatementType.question, 'b');
		const b = s('b', StatementType.question, 'a');
		expect(collectSubtree([a, b], 'a').map((statement) => statement.statementId)).toEqual(['b']);
	});
});

describe('resolveNewParent', () => {
	it('makes the target the parent for an "in" drop', () => {
		expect(resolveNewParent(all, 'q2', 'in')?.statementId).toBe('q2');
	});

	it('uses the target’s parent for a "before" drop', () => {
		expect(resolveNewParent(all, 'o1', 'before')?.statementId).toBe('q1');
	});

	it('uses the target’s parent for an "after" drop', () => {
		expect(resolveNewParent(all, 'q2', 'after')?.statementId).toBe('q1');
	});

	it('returns null when dropped next to the map root, which has no parent here', () => {
		expect(resolveNewParent(all, 'root', 'before')).toBeNull();
	});

	it('returns null for an unknown target', () => {
		expect(resolveNewParent(all, 'nope', 'in')).toBeNull();
	});
});

describe('validateMove', () => {
	it('allows a legal re-parent', () => {
		expect(validateMove(q2, g1, collectSubtree(all, 'q2'))).toEqual({ allowed: true });
	});

	it('refuses dropping a node onto itself', () => {
		expect(validateMove(q1, q1, collectSubtree(all, 'q1')).allowed).toBe(false);
	});

	it('refuses a move that changes nothing', () => {
		expect(validateMove(o1, q1, []).reasonKey).toBe('The statement is already here');
	});

	it('refuses moving a branch into its own descendant', () => {
		const result = validateMove(q1, o2, collectSubtree(all, 'q1'));
		expect(result.allowed).toBe(false);
		expect(result.reasonKey).toBe('A statement cannot be moved into its own branch');
	});

	it('refuses an option under a group, surfacing the hierarchy reason', () => {
		expect(validateMove(o1, g1, []).reasonKey).toBe('Options cannot contain other options');
	});

	it('refuses an option under another option', () => {
		expect(validateMove(o1, o2, []).allowed).toBe(false);
	});
});

describe('sortSiblings', () => {
	it('keeps the incoming order while no sibling has an explicit order', () => {
		const items = [s('b', StatementType.option), s('a', StatementType.option)];
		expect(sortSiblings(items, (item) => item).map((item) => item.statementId)).toEqual(['b', 'a']);
	});

	it('sorts by order once any sibling has one, putting unordered nodes last', () => {
		const first = { ...s('a', StatementType.option), order: 2 } as Statement;
		const second = { ...s('b', StatementType.option), order: 0 } as Statement;
		const unordered = s('c', StatementType.option);
		expect(
			sortSiblings([first, unordered, second], (item) => item).map((item) => item.statementId),
		).toEqual(['b', 'a', 'c']);
	});
});

describe('computeSiblingOrder', () => {
	const parent = s('p', StatementType.question);
	const c1 = s('c1', StatementType.option, 'p');
	const c2 = s('c2', StatementType.option, 'p');
	const c3 = s('c3', StatementType.option, 'p');
	const outsider = s('x', StatementType.option, 'other');
	const pool = [parent, c1, c2, c3, outsider];

	it('places a reordered node before its target and renumbers the whole set', () => {
		expect(computeSiblingOrder(pool, 'p', ['c3'], 'c1', 'before')).toEqual([
			{ statementId: 'c3', order: 0 },
			{ statementId: 'c1', order: 1 },
			{ statementId: 'c2', order: 2 },
		]);
	});

	it('places a reordered node after its target', () => {
		expect(computeSiblingOrder(pool, 'p', ['c1'], 'c2', 'after')).toEqual([
			{ statementId: 'c2', order: 0 },
			{ statementId: 'c1', order: 1 },
			{ statementId: 'c3', order: 2 },
		]);
	});

	it('appends an incoming node at the end when dropped into a parent', () => {
		expect(computeSiblingOrder([...pool, outsider], 'p', ['x'], 'p', 'in')).toEqual([
			{ statementId: 'c1', order: 0 },
			{ statementId: 'c2', order: 1 },
			{ statementId: 'c3', order: 2 },
			{ statementId: 'x', order: 3 },
		]);
	});

	it('respects existing order values when renumbering', () => {
		const ordered = [
			parent,
			{ ...c1, order: 2 } as Statement,
			{ ...c2, order: 1 } as Statement,
			{ ...c3, order: 0 } as Statement,
		];
		expect(computeSiblingOrder(ordered, 'p', ['c1'], 'c3', 'before')).toEqual([
			{ statementId: 'c1', order: 0 },
			{ statementId: 'c3', order: 1 },
			{ statementId: 'c2', order: 2 },
		]);
	});
});
