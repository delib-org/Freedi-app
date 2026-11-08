import type { ClassTable, Statement } from '@freedi/shared-types';
import { noDeviceNamesById } from './actFor';

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
	/** The teacher entered this for a student without a device. The teacher's screens only. */
	enteredByTeacher: boolean;
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
	/** A question one table wrote for itself: the teacher may hide it (IA 18). */
	ownQuestion: boolean;
	hidden: boolean;
	groups: TextGroup[];
}

export interface QuestionInput {
	question: Statement;
	challenge: boolean;
}

/**
 * `noDeviceNames`: a student without a device has no name on the statement (every
 * phone loads proposals), so the teacher's screen resolves it from the tables.
 */
export function toWrittenText(
	option: Statement,
	noDeviceNames: ReadonlyMap<string, string> = new Map(),
): WrittenText {
	return {
		id: option.statementId,
		text: option.statement,
		author: option.creator?.displayName?.trim() || (noDeviceNames.get(option.creatorId) ?? ''),
		ratings: option.evaluation?.numberOfEvaluators ?? 0,
		hidden: option.hide === true,
		tableId: option.classTable?.tableId ?? null,
		enteredByTeacher: !!option.classTable?.enteredByUid,
	};
}

export function groupWrittenTexts(
	questions: readonly QuestionInput[],
	optionsByQuestion: ReadonlyMap<string, readonly Statement[]>,
	tables: readonly ClassTable[],
): QuestionGroup[] {
	const tableById = new Map(tables.map((tb) => [tb.tableId, tb]));
	const noDeviceNames = noDeviceNamesById(tables);

	return questions.map(({ question, challenge }) => {
		const texts = (optionsByQuestion.get(question.statementId) ?? [])
			.map((option) => toWrittenText(option, noDeviceNames))
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

		return {
			questionId: question.statementId,
			title: question.statement,
			challenge,
			ownQuestion: question.classTable !== undefined,
			hidden: question.hide === true,
			groups,
		};
	});
}
