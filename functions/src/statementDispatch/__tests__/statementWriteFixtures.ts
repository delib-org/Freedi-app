import { StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import type { StatementWriteEvent } from '../routes';

export const COMMIT_MS = 1_800_000_000_000;
export const STATEMENT_ID = 'statement-1';

type Fields = Record<string, unknown>;

export interface Scenario {
	label: string;
	before?: Fields;
	after?: Fields;
	expected: string[];
}

const base: Fields = {
	statementId: STATEMENT_ID,
	statement: 'Plant trees',
	parentId: 'question-1',
	topParentId: 'group-1',
	consensus: 0.1,
	totalEvaluators: 3,
	lastUpdate: 1,
};

const option: Fields = { ...base, statementType: StatementType.option };
const question: Fields = { ...base, statementType: StatementType.question };
const paragraph: Fields = { ...base, statementType: StatementType.paragraph };
const official: Fields = { ...option, doc: { isDoc: true, isOfficialParagraph: true, order: 1 } };
const evidencePost: Fields = {
	...base,
	statementType: StatementType.statement,
	evidence: { helpfulCount: 1, notHelpfulCount: 0 },
};
const member = { uid: 'user-1', displayName: 'User' };

const rated = { consensus: 0.2, totalEvaluators: 4, lastUpdate: 2 };

/** Each realistic write, with exactly the handlers it must reach. */
export const SCENARIOS: Scenario[] = [
	{
		label: 'a rating on an answer',
		before: option,
		after: { ...option, ...rated },
		expected: [
			'queueDeliberation',
			'fn_autoAddParagraph',
			'fn_createReplacementQueueItem',
			'fn_updateQueueConsensus',
		],
	},
	{
		label: 'a view or member count on a question',
		before: question,
		after: { ...question, viewed: { individualViews: 5 }, numberOfMembers: 9, lastUpdate: 2 },
		expected: [],
	},
	{
		label: 'a child update stamp on a question',
		before: question,
		after: { ...question, lastChildUpdate: 5, lastUpdate: 5 },
		expected: [],
	},
	{
		label: 'an answer text edit',
		before: option,
		after: { ...option, statement: 'Plant oaks', lastUpdate: 2 },
		expected: ['queueDeliberation'],
	},
	{
		label: 'someone joining an answer',
		before: option,
		after: { ...option, joined: [member], lastUpdate: 2 },
		expected: ['queueDeliberation', 'fn_syncOptionMembersToSheet', 'fn_backupOptionMembership'],
	},
	{
		label: 'an organizer leaving an answer',
		before: { ...option, organizers: [member] },
		after: { ...option, organizers: [], lastUpdate: 2 },
		expected: ['queueDeliberation', 'fn_syncOptionMembersToSheet', 'fn_backupOptionMembership'],
	},
	{
		label: 'a paragraph text edit',
		before: paragraph,
		after: { ...paragraph, statement: 'New text', lastUpdate: 2 },
		expected: ['fn_syncParagraphChildrenToDescription'],
	},
	{
		label: 'an official paragraph version change',
		before: { ...official, versionControl: { currentVersion: 1 } },
		after: { ...official, versionControl: { currentVersion: 2 }, lastUpdate: 2 },
		expected: ['queueDeliberation', 'fn_pruneVersionHistory'],
	},
	{
		label: 'a rating on an official paragraph',
		before: official,
		after: { ...official, ...rated },
		expected: [
			'queueDeliberation',
			'fn_pruneVersionHistory',
			'fn_autoRemoveParagraph',
			'fn_updateQueueConsensus',
		],
	},
	{
		label: 'a vote on an evidence post',
		before: evidencePost,
		after: { ...evidencePost, evidence: { helpfulCount: 2, notHelpfulCount: 0 } },
		expected: ['onVoteUpdate'],
	},
	{
		label: 'a survey-linked question changing status',
		before: {
			...question,
			questionSettings: { massConsensusSurveyId: 'survey-1' },
			statementSettings: { questionStatus: 'active' },
		},
		after: {
			...question,
			questionSettings: { massConsensusSurveyId: 'survey-1' },
			statementSettings: { questionStatus: 'closed' },
		},
		expected: ['mirrorQuestionStatusToSurvey'],
	},
	{
		label: 'a question changing status with no survey',
		before: { ...question, statementSettings: { questionStatus: 'active' } },
		after: { ...question, statementSettings: { questionStatus: 'closed' } },
		expected: [],
	},
	{
		label: 'a statement promoted to an answer',
		before: { ...base, statementType: StatementType.statement },
		after: option,
		expected: ['queueDeliberation', 'updateOptionInMassConsensus'],
	},
	{
		label: 'a new answer',
		after: option,
		expected: ['queueDeliberation', 'onStatementCreatedMarkCondensationStale'],
	},
	{
		label: 'a new question',
		after: question,
		expected: ['onStatementCreatedMarkCondensationStale'],
	},
	{
		label: 'a new paragraph',
		after: paragraph,
		expected: ['onStatementCreatedMarkCondensationStale', 'fn_syncParagraphChildrenToDescription'],
	},
	{ label: 'a deleted answer', before: option, expected: ['queueDeliberation'] },
	{ label: 'a deleted question', before: question, expected: [] },
	{
		label: 'a deleted paragraph',
		before: paragraph,
		expected: ['fn_syncParagraphChildrenToDescription'],
	},
	{
		label: 'a deleted answer that had members',
		before: { ...option, joined: [member] },
		expected: ['queueDeliberation', 'fn_syncOptionMembersToSheet', 'fn_backupOptionMembership'],
	},
];

function snapshot(data: Fields | undefined, commitMs: number) {
	return {
		exists: data !== undefined,
		data: () => data as Statement | undefined,
		updateTime: data === undefined ? undefined : { toMillis: () => commitMs },
		ref: { update: jest.fn(() => Promise.resolve()) },
	};
}

export function buildEvent(
	before: Fields | undefined,
	after: Fields | undefined,
	commitMs: number = COMMIT_MS,
): StatementWriteEvent {
	return {
		time: new Date(commitMs).toISOString(),
		params: { statementId: STATEMENT_ID },
		data: { before: snapshot(before, commitMs - 1), after: snapshot(after, commitMs) },
	} as unknown as StatementWriteEvent;
}
