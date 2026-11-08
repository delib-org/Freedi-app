import {
	TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import type { Statement, TableAssignmentTopic, TablesTopicInput } from '@freedi/shared-types';

/** The editable form of one topic. Numeric fields stay strings while typed. */
export interface TopicDraft {
	topicId?: string;
	title: string;
	description: string;
	maxTables: string;
	sourceStatementId?: string;
	consensus?: number;
}

export type TopicDraftError =
	| 'titleRequired'
	| 'titleTooLong'
	| 'descriptionTooLong'
	| 'maxTablesInvalid';

export function emptyDraft(): TopicDraft {
	return { title: '', description: '', maxTables: '' };
}

export function draftFromTopic(topic: TableAssignmentTopic): TopicDraft {
	return {
		topicId: topic.topicId,
		title: topic.title,
		description: topic.description ?? '',
		maxTables: topic.maxTables === undefined ? '' : String(topic.maxTables),
		sourceStatementId: topic.sourceStatementId,
		consensus: topic.consensus,
	};
}

/** A positive whole number, or undefined for an empty field; NaN when the text is not one. */
export function parseOptionalPositiveInt(text: string): number | undefined {
	const trimmed = text.trim();

	if (trimmed === '') return undefined;

	const value = Number(trimmed);

	return Number.isInteger(value) && value >= 1 ? value : Number.NaN;
}

export function validateDraft(draft: TopicDraft): TopicDraftError | null {
	const title = draft.title.trim();

	if (title === '') return 'titleRequired';
	if (title.length > TABLE_ASSIGNMENT_TITLE_MAX_LENGTH) return 'titleTooLong';
	if (draft.description.trim().length > TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH) {
		return 'descriptionTooLong';
	}
	if (Number.isNaN(parseOptionalPositiveInt(draft.maxTables))) return 'maxTablesInvalid';

	return null;
}

/** Build the wire input of one topic; optional fields are omitted when empty. */
export function draftToInput(draft: TopicDraft): TablesTopicInput {
	const input: TablesTopicInput = { title: draft.title.trim() };
	const description = draft.description.trim();
	const maxTables = parseOptionalPositiveInt(draft.maxTables);

	if (draft.topicId) input.topicId = draft.topicId;
	if (description !== '') input.description = description;
	if (maxTables !== undefined && !Number.isNaN(maxTables)) input.maxTables = maxTables;
	if (draft.sourceStatementId) input.sourceStatementId = draft.sourceStatementId;
	if (draft.consensus !== undefined) input.consensus = draft.consensus;

	return input;
}

/** A topic imported from a selected option: title, description and consensus come from the statement. */
export function draftFromStatement(statement: Statement): TopicDraft {
	const draft: TopicDraft = {
		title: statement.statement.slice(0, TABLE_ASSIGNMENT_TITLE_MAX_LENGTH),
		description: (statement.description ?? '').slice(0, TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH),
		maxTables: '',
		sourceStatementId: statement.statementId,
	};

	if (typeof statement.consensus === 'number' && Number.isFinite(statement.consensus)) {
		draft.consensus = statement.consensus;
	}

	return draft;
}

/** Imported options that are not already in the list (same source statement). */
export function newImports(
	existing: readonly TopicDraft[],
	imported: readonly TopicDraft[],
): TopicDraft[] {
	const have = new Set(existing.map((d) => d.sourceStatementId).filter(Boolean));

	return imported.filter((d) => !d.sourceStatementId || !have.has(d.sourceStatementId));
}

/** Move a list item by one place; out-of-range moves are ignored. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
	const target = index + delta;

	if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
		return [...items];
	}

	const next = [...items];

	[next[index], next[target]] = [next[target], next[index]];

	return next;
}

/** Search a topic list by title and description (participant topics screen). */
export function filterTopics(
	topics: readonly TableAssignmentTopic[],
	text: string,
): TableAssignmentTopic[] {
	const needle = text.trim().toLowerCase();

	if (needle === '') return [...topics];

	return topics.filter((topic) =>
		`${topic.title} ${topic.description ?? ''}`.toLowerCase().includes(needle),
	);
}
