import type { ClassTable, Statement } from '@freedi/shared-types';

/**
 * Pure grouping for "what they wrote": texts by question (the step of the
 * lesson they were written in), then by table. Options written outside a table
 * go last under "no table".
 */

export interface WrittenText {
	id: string;
	text: string;
	author: string;
	ratings: number;
	hidden: boolean;
	tableId: string | null;
}

export interface TextGroup {
	/** Table number, or null for texts with no table. */
	n: number | null;
	tableId: string | null;
	/** Names of "no device" members of that table (drives "rate for ..."). */
	noDeviceNames: string[];
	texts: WrittenText[];
}

export interface QuestionGroup {
	questionId: string;
	title: string;
	challenge: boolean;
	groups: TextGroup[];
}

export interface QuestionInput {
	question: Statement;
	challenge: boolean;
}

export function toWrittenText(option: Statement): WrittenText {
	return {
		id: option.statementId,
		text: option.statement,
		author: option.creator?.displayName?.trim() ?? '',
		ratings: option.evaluation?.numberOfEvaluators ?? 0,
		hidden: option.hide === true,
		tableId: option.classTable?.tableId ?? null,
	};
}

export function groupWrittenTexts(
	questions: readonly QuestionInput[],
	optionsByQuestion: ReadonlyMap<string, readonly Statement[]>,
	tables: readonly ClassTable[],
): QuestionGroup[] {
	const tableById = new Map(tables.map((tb) => [tb.tableId, tb]));

	return questions.map(({ question, challenge }) => {
		const texts = (optionsByQuestion.get(question.statementId) ?? [])
			.map(toWrittenText)
			.sort((a, b) => b.ratings - a.ratings || a.id.localeCompare(b.id));
		const byTable = new Map<string | null, WrittenText[]>();
		for (const text of texts) {
			const key = text.tableId && tableById.has(text.tableId) ? text.tableId : null;
			byTable.set(key, [...(byTable.get(key) ?? []), text]);
		}
		const groups: TextGroup[] = [...byTable.entries()]
			.map(([tableId, list]) => {
				const table = tableId ? tableById.get(tableId) : undefined;

				return {
					n: table?.n ?? null,
					tableId,
					noDeviceNames: table?.noDeviceMembers.map((nd) => nd.name) ?? [],
					texts: list,
				};
			})
			.sort((a, b) => (a.n ?? Number.MAX_SAFE_INTEGER) - (b.n ?? Number.MAX_SAFE_INTEGER));

		return { questionId: question.statementId, title: question.statement, challenge, groups };
	});
}
