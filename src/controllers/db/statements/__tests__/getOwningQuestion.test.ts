import { StatementType, Statement } from '@freedi/shared-types';
import {
	getOwningQuestion,
	getOwningQuestionId,
	getOwningQuestionByLookup,
} from '../getOwningQuestion';

function makeStatement(overrides: Partial<Statement>): Statement {
	return {
		statementId: overrides.statementId ?? 'id',
		statement: overrides.statement ?? 'text',
		statementType: overrides.statementType ?? StatementType.option,
		parentId: overrides.parentId ?? '',
		parents: overrides.parents ?? [],
		topParentId: overrides.topParentId ?? '',
		creatorId: overrides.creatorId ?? 'u',
		creator: overrides.creator ?? {
			uid: 'u',
			displayName: 'U',
			photoURL: '',
			email: 'u@test.com',
			createdAt: Date.now(),
			lastSignInTime: Date.now(),
			role: 'user',
		},
		createdAt: overrides.createdAt ?? Date.now(),
		lastUpdate: overrides.lastUpdate ?? Date.now(),
		consensus: overrides.consensus ?? 0,
		hasChildren: overrides.hasChildren ?? false,
		...overrides,
	} as Statement;
}

describe('getOwningQuestion', () => {
	it('returns undefined for undefined input', () => {
		expect(getOwningQuestion(undefined, [])).toBeUndefined();
		expect(getOwningQuestionId(undefined, [])).toBeUndefined();
	});

	it('returns the statement itself when it is already a question', () => {
		const q = makeStatement({
			statementId: 'q1',
			statementType: StatementType.question,
		});
		expect(getOwningQuestion(q, [q])?.statementId).toBe('q1');
	});

	it('returns the parent question of a top-level option', () => {
		const q = makeStatement({ statementId: 'q1', statementType: StatementType.question });
		const opt = makeStatement({
			statementId: 'opt1',
			statementType: StatementType.option,
			parentId: 'q1',
		});
		const all = [q, opt];
		expect(getOwningQuestionId(opt, all)).toBe('q1');
	});

	it('walks past an option-promoted-to-sub-question chain', () => {
		// Root question -> option promoted to sub-question -> option
		const rootQuestion = makeStatement({
			statementId: 'root-q',
			statementType: StatementType.question,
		});
		// An option that got promoted: its statementType is question now, but it
		// still lives as a child of root-q.
		const subQuestion = makeStatement({
			statementId: 'sub-q',
			statementType: StatementType.question,
			parentId: 'root-q',
		});
		const nestedOption = makeStatement({
			statementId: 'nested-opt',
			statementType: StatementType.option,
			parentId: 'sub-q',
		});
		const all = [rootQuestion, subQuestion, nestedOption];

		// The NEAREST ancestor question is the sub-question, not the root.
		expect(getOwningQuestionId(nestedOption, all)).toBe('sub-q');
	});

	it('returns undefined when the parent chain is broken', () => {
		const orphan = makeStatement({
			statementId: 'orphan',
			statementType: StatementType.option,
			parentId: 'missing',
		});
		expect(getOwningQuestion(orphan, [orphan])).toBeUndefined();
	});

	it('handles cycles without infinite looping', () => {
		const a = makeStatement({
			statementId: 'a',
			statementType: StatementType.option,
			parentId: 'b',
		});
		const b = makeStatement({
			statementId: 'b',
			statementType: StatementType.option,
			parentId: 'a',
		});
		expect(getOwningQuestion(a, [a, b])).toBeUndefined();
	});

	it('getOwningQuestionByLookup works with an injected lookup function', () => {
		const q = makeStatement({ statementId: 'q', statementType: StatementType.question });
		const opt = makeStatement({
			statementId: 'opt',
			statementType: StatementType.option,
			parentId: 'q',
		});
		const lookup = (id: string) => (id === 'q' ? q : undefined);
		expect(getOwningQuestionByLookup(opt, lookup)?.statementId).toBe('q');
	});
});
