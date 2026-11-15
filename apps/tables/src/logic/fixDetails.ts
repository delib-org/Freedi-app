import type {
	TableAssignment,
	TableAssignmentTopic,
	TablesFixDetailsRequest,
} from '@freedi/shared-types';
import {
	eventFromDraft,
	parseExpected,
	parseSeats,
	setupDraftFromSession,
} from '@/logic/setupDraft';
import type { SetupDraft } from '@/logic/setupDraft';

/** One topic's title while it is being corrected. */
export interface FixTopicField {
	topicId: string;
	title: string;
}

/** Everything the "Fix details" dialog edits: the setup fields, plus the topic titles. */
export interface FixDetailsDraft {
	setup: SetupDraft;
	topics: FixTopicField[];
}

/** Why the fix cannot be saved yet. */
export type FixDetailsProblem = 'name' | 'topics' | 'question' | 'seats' | 'expected';

export function fixDetailsDraft(
	session: TableAssignment,
	topics: readonly TableAssignmentTopic[],
): FixDetailsDraft {
	return {
		setup: setupDraftFromSession(session, topics),
		topics: topics.map(({ topicId, title }) => ({ topicId, title })),
	};
}

/**
 * Table size, expected people, return by name and the question depend on who has registered
 * and what they answered, so they can only be fixed until registration closes. The server
 * refuses them after that; the dialog does not offer them.
 */
export function canFixRegistration(session: Pick<TableAssignment, 'status'>): boolean {
	return session.status === 'registrationOpen';
}

/** In a free-seating gathering seats are counted against the size as people sit, so it stays. */
export function isTableSizeFixed(session: Pick<TableAssignment, 'mode'>): boolean {
	return session.mode === 'direct';
}

/** The question's wording is fixable when the session has a question to reword. */
export function hasQuestion(session: Pick<TableAssignment, 'settings'>): boolean {
	return session.settings.positionQuestion !== undefined;
}

function isFilled(text: string): boolean {
	return text.trim().length > 0;
}

/** The first thing that stops the fix from being saved. */
export function fixDetailsProblem(
	session: TableAssignment,
	draft: FixDetailsDraft,
): FixDetailsProblem | null {
	const { setup } = draft;

	if (!isFilled(setup.title)) return 'name';
	if (!draft.topics.every((field) => isFilled(field.title))) return 'topics';
	if (!canFixRegistration(session)) return null;
	if (!isTableSizeFixed(session) && parseSeats(setup.seats, setup.legacySeats) === null) {
		return 'seats';
	}
	if (Number.isNaN(parseExpected(setup.expected))) return 'expected';

	return hasQuestion(session) && !isFilled(setup.question) ? 'question' : null;
}

/** Only what the host changed is sent, so a stored value the dialog does not offer is never rewritten. */
function registrationPatch(
	session: TableAssignment,
	setup: SetupDraft,
): Partial<TablesFixDetailsRequest> {
	const { settings } = session;
	const patch: Partial<TablesFixDetailsRequest> = {};
	const seats = parseSeats(setup.seats, setup.legacySeats);
	const expected = parseExpected(setup.expected);

	if (!isTableSizeFixed(session) && seats !== null && seats !== settings.tableSize) {
		patch.tableSize = seats;
	}
	if (expected !== (settings.expectedParticipants ?? null) && !Number.isNaN(expected)) {
		patch.expectedParticipants = expected;
	}
	if (setup.allowReturn !== (settings.allowReturnByName === true)) {
		patch.allowReturnByName = setup.allowReturn;
	}
	const question = setup.question.trim();

	if (hasQuestion(session) && question !== settings.positionQuestion?.label) {
		patch.positionQuestionLabel = question;
	}

	return patch;
}

function eventPatch(
	session: TableAssignment,
	setup: SetupDraft,
): Pick<TablesFixDetailsRequest, 'event'> {
	const event = eventFromDraft(setup);
	const stored = session.settings.event;
	const unchanged =
		(event?.date ?? '') === (stored?.date ?? '') &&
		(event?.time ?? '') === (stored?.time ?? '') &&
		(event?.place ?? '') === (stored?.place ?? '');

	return unchanged ? {} : { event };
}

/** The one request of the dialog; null while something stops it (see `fixDetailsProblem`). */
export function fixDetailsRequest(
	session: TableAssignment,
	draft: FixDetailsDraft,
): TablesFixDetailsRequest | null {
	if (fixDetailsProblem(session, draft) !== null) return null;

	const { setup } = draft;

	return {
		sessionId: session.tableAssignmentId,
		title: setup.title.trim(),
		topics: draft.topics.map((field) => ({ ...field, title: field.title.trim() })),
		...eventPatch(session, setup),
		...(canFixRegistration(session) ? registrationPatch(session, setup) : {}),
	};
}
