import { Statement } from '@freedi/shared-types';
import { buildSummaryPrompt, SUMMARY_MAX_WORDS } from '../fn_summarizeDiscussion';

interface TestSolution {
	statementId?: string;
	title: string;
	description?: string;
	consensus: number;
	averageEvaluation: number;
	numberOfEvaluators: number;
}

const question = { statementId: 'q', statement: 'What should we do?' } as unknown as Statement;
const solutions: TestSolution[] = [
	{
		title: 'Plant trees',
		description: 'In parks',
		consensus: 0.6,
		averageEvaluation: 0.5,
		numberOfEvaluators: 12,
	},
	{ title: 'Ban cars', consensus: 0.3, averageEvaluation: 0.2, numberOfEvaluators: 9 },
];
const divided = {
	statementId: 'd',
	statement: 'Tax cars',
	evaluation: { numberOfEvaluators: 10, numberOfProEvaluators: 4, numberOfConEvaluators: 4 },
} as unknown as Statement;

describe('buildSummaryPrompt', () => {
	it('states the word limit for the whole summary', () => {
		const prompt = buildSummaryPrompt(question, solutions, 20, undefined, 'en');

		expect(SUMMARY_MAX_WORDS).toBe(150);
		expect(prompt).toContain(`at most ${SUMMARY_MAX_WORDS} words`);
	});

	it('keeps the limit when a divided section is added', () => {
		const prompt = buildSummaryPrompt(question, solutions, 20, undefined, 'en', [divided]);

		expect(prompt).toContain('including any section on where the group is divided');
	});

	it('adds the divided section only when dividedOptions is non-empty', () => {
		const withDivided = buildSummaryPrompt(question, solutions, 20, undefined, 'en', [divided]);
		const without = buildSummaryPrompt(question, solutions, 20, undefined, 'en');
		const empty = buildSummaryPrompt(question, solutions, 20, undefined, 'en', []);

		expect(without).not.toContain('Where the Group Is Divided');
		expect(empty).toBe(without);
		expect(withDivided).toContain('## Where the Group Is Divided');
		expect(withDivided).toContain('**Tax cars** (4 for, 4 against, 10 voters)');
	});

	it('marks a divided option that is also selected, matched by statementId', () => {
		const selected = [{ ...solutions[0], statementId: 'd' }, solutions[1]];
		const prompt = buildSummaryPrompt(question, selected, 20, undefined, 'en', [divided]);

		expect(prompt).toContain(
			'(4 for, 4 against, 10 voters) [selected above, but the group is split on it]',
		);
		expect(prompt).toContain('Present them as splits, not as agreements');
	});

	it('does not mark a divided option that is not selected', () => {
		const prompt = buildSummaryPrompt(question, solutions, 20, undefined, 'en', [divided]);

		expect(prompt).not.toContain('[selected above');
	});
});
