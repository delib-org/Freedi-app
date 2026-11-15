import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import type {
	TableAssignment,
	TableAssignmentPositionQuestion,
	TableAssignmentSettings,
	TableAssignmentStatus,
	TableAssignmentTopic,
	TablesFixDetailsRequest,
	TablesFixDetailsResponse,
	TablesFixDetailsTopic,
} from '@freedi/shared-types';
import { db } from '../db';
import { MAX_TOPICS_PER_SESSION } from './constants';
import {
	actorFrom,
	assertHost,
	readSession,
	requireId,
	sessionRef,
	topicsQuery,
} from './tablesAccess';
import { isOneTopic } from './oneTopic';
import { TablesError, toHttpsError } from './tablesErrors';
import { mergedSettings } from './fn_tablesSaveSettings';
import { assertChoosableTableSize, requireTitle } from './validation';

const FIXABLE_STATUSES: readonly TableAssignmentStatus[] = [
	'registrationOpen',
	'registrationClosed',
	'published',
];

/**
 * What can still be fixed once the tables are formed is only what no answer depends on.
 * The rest changes who sits where, or what people were asked, so it ends with registration.
 */
function changesFixedAtOpenRegistration(
	current: TableAssignmentSettings,
	req: TablesFixDetailsRequest,
): boolean {
	const questionChanged =
		req.positionQuestionLabel !== undefined &&
		req.positionQuestionLabel !== current.positionQuestion?.label;
	const expectedChanged =
		req.expectedParticipants !== undefined &&
		(req.expectedParticipants ?? undefined) !== current.expectedParticipants;
	const returnChanged =
		req.allowReturnByName !== undefined &&
		req.allowReturnByName !== (current.allowReturnByName === true);
	const sizeChanged = req.tableSize !== undefined && req.tableSize !== current.tableSize;

	return questionChanged || expectedChanged || returnChanged || sizeChanged;
}

function hasSettingsPart(req: TablesFixDetailsRequest): boolean {
	return (
		req.event !== undefined ||
		req.tableSize !== undefined ||
		req.expectedParticipants !== undefined ||
		req.allowReturnByName !== undefined ||
		req.positionQuestionLabel !== undefined
	);
}

/** Only the wording of the existing question moves: its two ends stay, so every answer keeps its meaning. */
function reworded(
	current: TableAssignmentSettings,
	label: string | undefined,
): TableAssignmentPositionQuestion | undefined {
	if (label === undefined) return current.positionQuestion;
	if (!current.positionQuestion) {
		throw new TablesError('invalid-argument', 'There is no position question to reword');
	}

	return { ...current.positionQuestion, label };
}

/** The settings after the fix, refusing what registration no longer allows. */
function fixedSettings(
	session: TableAssignment,
	req: TablesFixDetailsRequest,
	positionLabel: string | undefined,
): TableAssignmentSettings {
	const { settings: current } = session;
	if (session.status !== 'registrationOpen' && changesFixedAtOpenRegistration(current, req)) {
		throw new TablesError(
			'failed-precondition',
			`Table size, expected people, return by name and the question are fixed once registration closes (${session.status})`,
		);
	}
	const settings = mergedSettings(current, {
		tableSize: req.tableSize,
		expectedParticipants: req.expectedParticipants,
		allowReturnByName: req.allowReturnByName,
		event: req.event,
		positionQuestion: reworded(current, positionLabel),
	});
	if (settings.tableSize !== current.tableSize) {
		assertChoosableTableSize(settings.tableSize);
		if (session.mode === 'direct') {
			throw new TablesError(
				'failed-precondition',
				'Table size is fixed once registration has opened in direct mode',
			);
		}
	}

	return settings;
}

function parseTopicTitles(value: unknown): TablesFixDetailsTopic[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length > MAX_TOPICS_PER_SESSION) {
		throw new TablesError(
			'invalid-argument',
			`topics must be a list of at most ${MAX_TOPICS_PER_SESSION}`,
		);
	}

	return value.map((topic: TablesFixDetailsTopic, index) => ({
		topicId: requireId(topic?.topicId, `topics[${index}].topicId`),
		title: requireTitle(topic?.title, `topics[${index}].title`),
	}));
}

/** The list must be the session's own topics, all of them, once each, in their current order. */
function assertSameTopicList(
	stored: readonly TableAssignmentTopic[],
	given: readonly TablesFixDetailsTopic[],
): void {
	const storedIds = new Set(stored.map((topic) => topic.topicId));
	if (!given.every((topic) => storedIds.has(topic.topicId))) {
		throw new TablesError('invalid-argument', 'A topic does not belong to this session');
	}
	const isSameList =
		given.length === stored.length &&
		given.every((topic, index) => topic.topicId === stored[index].topicId);
	if (!isSameList) {
		throw new TablesError(
			'invalid-argument',
			'Only titles can be fixed: topics cannot be added, removed or reordered',
		);
	}
}

function sortedTopicDocs(docs: QueryDocumentSnapshot[]): QueryDocumentSnapshot[] {
	return [...docs].sort((a, b) => {
		const [first, second] = [a.data() as TableAssignmentTopic, b.data() as TableAssignmentTopic];

		return first.order - second.order || first.topicId.localeCompare(second.topicId);
	});
}

/**
 * `tablesFixDetails` (host): one save that corrects the gathering name, topic
 * titles and event (any stage until it ends) and, while registration is open,
 * the table size, expected people, return by name and the question's wording.
 * Titles, the event and wording are not part of the inputHash, so a ready
 * preview stays publishable and choices keep pointing at the same topics.
 */
export async function fixDetails(
	firestore: Firestore,
	uid: string,
	req: TablesFixDetailsRequest,
	now: number = Date.now(),
): Promise<TablesFixDetailsResponse> {
	const sessionId = requireId(req?.sessionId, 'sessionId');
	const newTitle = req.title === undefined ? undefined : requireTitle(req.title, 'title');
	const topicTitles = parseTopicTitles(req.topics);
	const positionLabel =
		req.positionQuestionLabel === undefined
			? undefined
			: requireTitle(req.positionQuestionLabel, 'positionQuestionLabel');

	return firestore.runTransaction(async (tx) => {
		const session = await readSession(tx, firestore, sessionId);
		assertHost(session, uid);
		if (!FIXABLE_STATUSES.includes(session.status)) {
			throw new TablesError(
				'failed-precondition',
				`Details cannot be fixed while the session is ${session.status}`,
			);
		}
		const settings = hasSettingsPart(req) ? fixedSettings(session, req, positionLabel) : undefined;
		const topicDocs = sortedTopicDocs((await tx.get(topicsQuery(firestore, sessionId))).docs);
		if (topicTitles) {
			assertSameTopicList(
				topicDocs.map((d) => d.data() as TableAssignmentTopic),
				topicTitles,
			);
			topicDocs.forEach((d, index) => tx.update(d.ref, { title: topicTitles[index].title }));
		}
		const title = newTitle ?? session.title;
		// A one-topic event's single topic is named after the event (IA tables-class-bridge 2.4).
		if (newTitle && isOneTopic(session.settings)) {
			topicDocs.forEach((d) => tx.update(d.ref, { title: newTitle }));
		}
		tx.update(sessionRef(firestore, sessionId), {
			title,
			...(settings && { settings }),
			lastUpdate: now,
		});

		return { title, topicIds: topicDocs.map((d) => d.id) };
	});
}

export const tablesFixDetails = onCall(
	{ region: functionConfig.region, memory: '512MiB' },
	async (request: CallableRequest<TablesFixDetailsRequest>): Promise<TablesFixDetailsResponse> => {
		let uid: string | undefined;
		try {
			uid = actorFrom(request).uid;

			return await fixDetails(db, uid, request.data);
		} catch (error) {
			throw toHttpsError(error, {
				operation: 'tableAssignment.tablesFixDetails',
				userId: uid,
				metadata: { sessionId: request.data?.sessionId },
			});
		}
	},
);
