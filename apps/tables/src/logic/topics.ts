import {
	TABLE_ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
	TABLE_ASSIGNMENT_MAX_TABLES_PER_TOPIC,
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

/** A topic's table cap: a whole number from 1, held to the server's limit; undefined when empty or not a number. */
export function parseMaxTables(text: string): number | undefined {
	const value = parseOptionalPositiveInt(text);

	if (value === undefined || Number.isNaN(value)) return undefined;

	return Math.min(value, TABLE_ASSIGNMENT_MAX_TABLES_PER_TOPIC);
}

/** Build the wire input of one topic; optional fields are omitted when empty. */
export function draftToInput(draft: TopicDraft): TablesTopicInput {
	const input: TablesTopicInput = { title: draft.title.trim() };
	const description = draft.description.trim();
	const maxTables = parseMaxTables(draft.maxTables);

	if (draft.topicId) input.topicId = draft.topicId;
	if (description !== '') input.description = description;
	if (maxTables !== undefined) input.maxTables = maxTables;
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
