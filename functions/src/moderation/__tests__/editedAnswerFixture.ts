import { Collections, SourceApp, StatementType } from '@freedi/shared-types';
import { FakeDb } from '../../progress/__tests__/fakeDb';
import { answerHiddenNoticeId } from '../answerHiddenNotice';
import type { moderateEditedAnswer } from '../fn_moderateNewAnswer';

export const ANSWER = 'answer-1';
export const QUESTION = 'question-1';
export const AUTHOR = 'author-1';
export const CLEAN_TEXT = 'a kind answer';
export const OFFENSIVE_TEXT = 'some offensive words';
export const EVENT_ID = 'event-edit';
export const EVENT_TIME = 1_000_000;
export const RESTORED_MARK = {
	reason: 'inappropriate-language',
	hiddenAt: 1,
	eventId: 'event-old',
	restoredAt: 2,
};
export const HELD_MARK = { reason: 'inappropriate-language', hiddenAt: 1, eventId: 'event-old' };

export type Event = Parameters<typeof moderateEditedAnswer>[0];
export type Fields = Record<string, unknown>;

function answerDoc(overrides: Fields = {}): Fields {
	return {
		statementId: ANSWER,
		statement: CLEAN_TEXT,
		statementType: StatementType.option,
		sourceApp: SourceApp.MAIN,
		parentId: QUESTION,
		topParentId: QUESTION,
		creatorId: AUTHOR,
		...overrides,
	};
}

/** Helpers over the test file's fake, which is replaced before each test. */
export function editedAnswerFixture(getFake: () => FakeDb) {
	/** Seeds the document as it stands after the write and builds that write's event. */
	function updated(beforeFields: Fields, afterFields: Fields, id = EVENT_ID): Event {
		const before = answerDoc(beforeFields);
		const after = answerDoc(afterFields);
		getFake().seed(Collections.statements, ANSWER, after);

		return {
			id,
			time: new Date(EVENT_TIME).toISOString(),
			data: { before: { data: () => before }, after: { data: () => after } },
			params: { statementId: ANSWER },
		} as unknown as Event;
	}

	const answerRef = () => getFake().db.collection(Collections.statements).doc(ANSWER);
	const stored = (): Fields | undefined => getFake().read(Collections.statements, ANSWER);
	const notice = (): Fields | undefined =>
		getFake().read(Collections.inAppNotifications, answerHiddenNoticeId(ANSWER));
	const marker = (): { hiddenAt: number; eventId: string; restoredAt?: number } =>
		stored()?.answerModeration as { hiddenAt: number; eventId: string; restoredAt?: number };

	function expectHeldBy(eventId: string): void {
		expect(stored()?.hide).toBe(true);
		expect(marker()).toEqual({
			reason: 'inappropriate-language',
			hiddenAt: expect.any(Number),
			eventId,
		});
		expect(notice()?.userId).toBe(AUTHOR);
	}

	function expectLeftVisible(): void {
		expect(stored()?.hide).toBeUndefined();
		expect(stored()?.answerModeration).toBeUndefined();
		expect(notice()).toBeUndefined();
	}

	return { updated, answerRef, stored, notice, marker, expectHeldBy, expectLeftVisible };
}
