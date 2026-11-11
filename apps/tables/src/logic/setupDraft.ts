import {
	TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT,
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
} from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentMode,
	TableAssignmentPositionQuestion,
	TableAssignmentTopic,
	TablesSaveSettingsRequest,
	TablesTopicInput,
} from '@freedi/shared-types';
import { DEFAULT_TABLES_PER_TOPIC } from '@/logic/directTables';
import {
	draftFromTopic,
	draftToInput,
	emptyDraft,
	parseMaxTables,
	parseOptionalPositiveInt,
} from '@/logic/topics';
import type { TopicDraft } from '@/logic/topics';

/** Everything on the Setup page. Numbers stay strings while typed. */
export interface SetupDraft {
	title: string;
	mode: TableAssignmentMode;
	topics: TopicDraft[];
	askPosition: boolean;
	question: string;
	poleA: string;
	poleB: string;
	tolerance: number;
	expected: string;
	seats: string;
	/** A size below the current minimum that the session already has: kept while the host does not change it. */
	legacySeats?: number;
	allowReturn: boolean;
}

/** Why something cannot be saved or opened yet. */
export type SetupProblem = 'name' | 'topics' | 'question' | 'seats' | 'expected';

const DEFAULT_MODE: TableAssignmentMode = 'ranked';

export function emptySetupDraft(): SetupDraft {
	return {
		title: '',
		mode: DEFAULT_MODE,
		topics: [emptyDraft()],
		askPosition: true,
		question: '',
		poleA: '',
		poleB: '',
		tolerance: TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
		expected: '',
		seats: String(TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT),
		allowReturn: false,
	};
}

/** A draft that already exists: a tolerance outside the three chips is kept as it is. */
export function setupDraftFromSession(
	session: TableAssignment,
	topics: readonly TableAssignmentTopic[],
): SetupDraft {
	const { settings } = session;

	return {
		title: session.title,
		mode: session.mode,
		topics: topics.length > 0 ? topics.map(draftFromTopic) : [emptyDraft()],
		askPosition: settings.positionQuestion !== undefined,
		question: settings.positionQuestion?.label ?? '',
		poleA: settings.positionQuestion?.poleA ?? '',
		poleB: settings.positionQuestion?.poleB ?? '',
		tolerance: settings.balanceTolerance ?? TABLE_ASSIGNMENT_BALANCE_TOLERANCE_DEFAULT,
		expected:
			settings.expectedParticipants === undefined ? '' : String(settings.expectedParticipants),
		seats: String(settings.tableSize ?? TABLE_ASSIGNMENT_TABLE_SIZE_DEFAULT),
		legacySeats:
			settings.tableSize !== undefined && settings.tableSize < TABLE_ASSIGNMENT_TABLE_SIZE_MIN
				? settings.tableSize
				: undefined,
		allowReturn: settings.allowReturnByName === true,
	};
}

export function filledTopics(draft: Pick<SetupDraft, 'topics'>): TopicDraft[] {
	return draft.topics.filter((topic) => topic.title.trim() !== '');
}

/** A table size the host may choose now; `legacySeats` is the smaller size an older session already has. */
export function parseSeats(text: string, legacySeats?: number): number | null {
	const seats = Number(text);
	const unchanged = legacySeats !== undefined && seats === legacySeats;
	const valid =
		text.trim() !== '' &&
		Number.isInteger(seats) &&
		(unchanged || seats >= TABLE_ASSIGNMENT_TABLE_SIZE_MIN) &&
		seats <= TABLE_ASSIGNMENT_TABLE_SIZE_MAX;

	return valid ? seats : null;
}

/** Empty is allowed: the number only feeds the summary. NaN marks text that is not a number. */
export function parseExpected(text: string): number | null {
	const value = parseOptionalPositiveInt(text);

	return value === undefined ? null : value;
}

function positionFields(draft: SetupDraft): TableAssignmentPositionQuestion {
	return { label: draft.question.trim(), poleA: draft.poleA.trim(), poleB: draft.poleB.trim() };
}

/** The position question is a ranked-mode feature: in direct mode it is neither checked nor sent. */
function isRanked(draft: SetupDraft): boolean {
	return draft.mode === 'ranked';
}

function isPositionPartial(draft: SetupDraft): boolean {
	const fields = Object.values(positionFields(draft));

	return isRanked(draft) && draft.askPosition && fields.some(Boolean) && !fields.every(Boolean);
}

/** The first thing that stops the settings from being sent. */
export function settingsProblem(draft: SetupDraft): SetupProblem | null {
	if (parseSeats(draft.seats, draft.legacySeats) === null) return 'seats';
	if (Number.isNaN(parseExpected(draft.expected))) return 'expected';

	return isPositionPartial(draft) ? 'question' : null;
}

/** The first thing that stops registration from opening. */
export function openProblem(draft: SetupDraft): SetupProblem | null {
	if (draft.title.trim() === '') return 'name';
	if (filledTopics(draft).length === 0) return 'topics';

	return settingsProblem(draft);
}

export function settingsRequest(
	sessionId: string,
	draft: SetupDraft,
): TablesSaveSettingsRequest | null {
	const seats = parseSeats(draft.seats, draft.legacySeats);

	if (seats === null || settingsProblem(draft) !== null) return null;

	const fields = positionFields(draft);

	return {
		sessionId,
		mode: draft.mode,
		tableSize: seats,
		balanceTolerance: draft.tolerance,
		positionQuestion: isRanked(draft) && draft.askPosition && fields.label !== '' ? fields : null,
		expectedParticipants: parseExpected(draft.expected),
		allowReturnByName: draft.allowReturn,
	};
}

/** Non-empty rows in order; explanations and caps pass through so autosave cannot wipe them. */
export function topicInputs(draft: Pick<SetupDraft, 'topics'>): TablesTopicInput[] {
	return filledTopics(draft).map(draftToInput);
}

/** How many tables the topics open in free mode: a topic's cap, or one. */
export function freeTableCount(draft: Pick<SetupDraft, 'topics'>): number {
	return filledTopics(draft).reduce((sum, topic) => {
		const cap = parseMaxTables(topic.maxTables);

		return sum + (cap === undefined ? DEFAULT_TABLES_PER_TOPIC : cap);
	}, 0);
}
