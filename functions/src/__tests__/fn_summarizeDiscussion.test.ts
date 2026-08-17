import { Statement } from '@freedi/shared-types';
import {
	QuestionNode,
	countSolutions,
	countSubQuestions,
	renderQuestionNode,
	buildTreeSummaryPrompt,
} from '../fn_summarizeDiscussion';

function makeStatement(overrides: Partial<Statement> = {}): Statement {
	return {
		statementId: 'q-root',
		statement: 'Main question?',
		parentId: 'top',
		topParentId: 'top',
		creatorId: 'user-1',
		...overrides,
	} as Statement;
}

function makeSolution(title: string, consensus = 0.5, numberOfEvaluators = 3) {
	return {
		title,
		consensus,
		averageEvaluation: consensus,
		numberOfEvaluators,
	};
}

function makeNode(
	statement: Statement,
	solutions: ReturnType<typeof makeSolution>[] = [],
	children: QuestionNode[] = [],
): QuestionNode {
	return { statement, solutions, children };
}

describe('fn_summarizeDiscussion tree helpers', () => {
	const leaf = makeNode(makeStatement({ statementId: 'q-1-1', statement: 'Level 2 question?' }), [
		makeSolution('Deep answer', 0.8),
	]);
	const subQuestion = makeNode(
		makeStatement({ statementId: 'q-1', statement: 'Level 1 question?' }),
		[makeSolution('Mid answer A', 0.7), makeSolution('Mid answer B', 0.6)],
		[leaf],
	);
	const emptySubQuestion = makeNode(
		makeStatement({ statementId: 'q-2', statement: 'Open question?' }),
	);
	const root = makeNode(
		makeStatement(),
		[makeSolution('Root answer', 0.9)],
		[subQuestion, emptySubQuestion],
	);

	describe('countSolutions', () => {
		it('counts solutions across the whole tree', () => {
			expect(countSolutions(root)).toBe(4);
		});

		it('returns 0 for a tree with no solutions anywhere', () => {
			const bare = makeNode(makeStatement(), [], [makeNode(makeStatement({ statementId: 'q-x' }))]);
			expect(countSolutions(bare)).toBe(0);
		});
	});

	describe('countSubQuestions', () => {
		it('counts all nested sub-questions, excluding the root', () => {
			expect(countSubQuestions(root)).toBe(3);
		});

		it('returns 0 for a flat tree', () => {
			expect(countSubQuestions(makeNode(makeStatement()))).toBe(0);
		});
	});

	describe('renderQuestionNode', () => {
		it('renders level-1 nodes with ### headers and level-2 with ####', () => {
			const text = renderQuestionNode(subQuestion, 1);
			expect(text).toContain('### Sub-question: Level 1 question?');
			expect(text).toContain('#### Sub-question: Level 2 question?');
		});

		it('lists each agreed answer with its consensus and voter count', () => {
			const text = renderQuestionNode(subQuestion, 1);
			expect(text).toContain('**Mid answer A** (consensus 0.70, 3 voters)');
			expect(text).toContain('**Mid answer B** (consensus 0.60, 3 voters)');
		});

		it('marks questions without agreed answers as still open', () => {
			const text = renderQuestionNode(emptySubQuestion, 1);
			expect(text).toContain('still open');
		});
	});

	describe('buildTreeSummaryPrompt', () => {
		it('includes the main question, root agreements, and all sub-question sections', () => {
			const prompt = buildTreeSummaryPrompt(root, 12);
			expect(prompt).toContain('"Main question?"');
			expect(prompt).toContain('12 participants');
			expect(prompt).toContain('## Direct agreements on the main question');
			expect(prompt).toContain('**Root answer**');
			expect(prompt).toContain('### Sub-question: Level 1 question?');
			expect(prompt).toContain('#### Sub-question: Level 2 question?');
			expect(prompt).toContain('### Sub-question: Open question?');
		});

		it('omits the direct-agreements section when the root has no chosen options', () => {
			const noRootSolutions = makeNode(makeStatement(), [], [subQuestion]);
			const prompt = buildTreeSummaryPrompt(noRootSolutions, 0);
			expect(prompt).not.toContain('## Direct agreements on the main question');
			expect(prompt).toContain('### Sub-question: Level 1 question?');
		});

		it('writes in the requested language and includes the admin focus', () => {
			const prompt = buildTreeSummaryPrompt(root, 5, 'Focus on budget items', 'he');
			expect(prompt).toContain('in Hebrew');
			expect(prompt).toContain('## Special Focus Requested');
			expect(prompt).toContain('Focus on budget items');
		});
	});
});
