import { StatementType, type Statement } from '@freedi/shared-types';

/** One suggestion as the Results screen shows it. */
export interface ResultOption {
	statementId: string;
	text: string;
	/** The statement's consensus score (-1..1), 0 when nobody has rated it. */
	score: number;
	evaluators: number;
}

export interface QuestionResults {
	questionId: string;
	title: string;
	options: ResultOption[];
}

/** Visible suggestions only, best consensus first; ties go to more evaluators. */
export function rankOptions(children: Statement[]): ResultOption[] {
	return children
		.filter((child) => child.statementType === StatementType.option && !child.hide)
		.map((child) => ({
			statementId: child.statementId,
			text: child.statement,
			score: typeof child.consensus === 'number' ? child.consensus : 0,
			evaluators: child.evaluation?.numberOfEvaluators ?? 0,
		}))
		.sort((a, b) => b.score - a.score || b.evaluators - a.evaluators);
}

/** The survey's questions, in the survey's order, each with its ranked options. */
export function buildQuestionResults(
	questionIds: string[],
	questions: Statement[],
	children: Statement[],
): QuestionResults[] {
	const titleById = new Map(questions.map((q) => [q.statementId, q.statement]));

	return questionIds.map((questionId) => ({
		questionId,
		title: titleById.get(questionId) ?? '',
		options: rankOptions(children.filter((child) => child.parentId === questionId)),
	}));
}

/** Score as a whole percentage for display (0.42 becomes 42). */
export function scoreToPercent(score: number): number {
	return Math.round(score * 100);
}
