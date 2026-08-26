/**
 * Tests for the mind-map type switcher's client-side rules. These mirror the
 * server checks in `changeStatementType`; the point is that a target the server
 * would reject is never offered as clickable.
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
	TYPE_RESTRICTIONS: {
		option: {
			disallowedChildren: ['option'],
			reason: 'Options cannot contain other options',
		},
		group: {
			disallowedChildren: ['option'],
			reason: 'Groups cannot contain options',
		},
		statement: {},
		question: {},
	},
}));

import {
	findNodeContext,
	getTypeChangeChoices,
	hasAnyTypeChange,
} from '../mapHelpers/statementTypeChoices';
import { StatementType } from '@freedi/shared-types';
import type { Results, Statement } from '@freedi/shared-types';

function s(id: string, statementType: StatementType): Statement {
	return { statementId: id, statement: id, statementType } as unknown as Statement;
}

const node = (statement: Statement, sub: Results[] = []): Results => ({ top: statement, sub });

const choice = (choices: ReturnType<typeof getTypeChangeChoices>, type: StatementType) =>
	choices.find((c) => c.type === type)!;

describe('findNodeContext', () => {
	const tree = node(s('root', StatementType.question), [
		node(s('a', StatementType.question), [node(s('a1', StatementType.option))]),
		node(s('b', StatementType.option)),
	]);

	it('returns the statement with its parent and direct children', () => {
		const ctx = findNodeContext(tree, 'a');
		expect(ctx?.statement.statementId).toBe('a');
		expect(ctx?.parent?.statementId).toBe('root');
		expect(ctx?.children.map((c) => c.statementId)).toEqual(['a1']);
	});

	it('gives the root no parent', () => {
		expect(findNodeContext(tree, 'root')?.parent).toBeUndefined();
	});

	it('returns null for an unknown id', () => {
		expect(findNodeContext(tree, 'nope')).toBeNull();
	});
});

describe('getTypeChangeChoices', () => {
	it('marks the current type as current and not clickable', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.question),
			children: [],
		});
		expect(choice(choices, StatementType.question).isCurrent).toBe(true);
		expect(choice(choices, StatementType.question).allowed).toBe(false);
	});

	it('allows every other type for a question with no parent or children', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.question),
			children: [],
		});
		expect(choice(choices, StatementType.option).allowed).toBe(true);
		expect(choice(choices, StatementType.group).allowed).toBe(true);
	});

	it('blocks becoming an option under an option parent', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.question),
			parent: s('p', StatementType.option),
			children: [],
		});
		const asOption = choice(choices, StatementType.option);
		expect(asOption.allowed).toBe(false);
		expect(asOption.reasonKey).toBe('Options cannot contain other options');
	});

	it('blocks becoming an option under a group parent', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.question),
			parent: s('p', StatementType.group),
			children: [],
		});
		expect(choice(choices, StatementType.option).reasonKey).toBe('Groups cannot contain options');
	});

	it('blocks option and group while option children hang off the node', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.question),
			children: [s('a1', StatementType.option)],
		});
		expect(choice(choices, StatementType.option).allowed).toBe(false);
		expect(choice(choices, StatementType.group).allowed).toBe(false);
		expect(choice(choices, StatementType.option).reasonKey).toBe(
			'This statement has options under it',
		);
	});

	it('still allows non-option children to become anything', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.question),
			children: [s('a1', StatementType.question)],
		});
		expect(choice(choices, StatementType.group).allowed).toBe(true);
	});

	it('refuses to retype a group', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.group),
			children: [],
		});
		expect(choices.every((c) => !c.allowed)).toBe(true);
		expect(choice(choices, StatementType.question).reasonKey).toBe(
			'Cannot change the type of a group',
		);
	});
});

describe('hasAnyTypeChange', () => {
	it('is false when nothing can be switched', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.group),
			children: [],
		});
		expect(hasAnyTypeChange(choices)).toBe(false);
	});

	it('is true when at least one target is open', () => {
		const choices = getTypeChangeChoices({
			statement: s('a', StatementType.option),
			children: [],
		});
		expect(hasAnyTypeChange(choices)).toBe(true);
	});
});
