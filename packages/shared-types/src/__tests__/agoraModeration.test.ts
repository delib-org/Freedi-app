import { safeParse } from 'valibot';
import {
	AgoraIdentitySchema,
	AgoraModerationSchema,
	AgoraTeacherMessageSchema,
	isAgoraHidden,
	isAgoraTeacherPreset,
	isTeacherEdited,
	isTeacherTouched,
} from '../models/agora';

describe('agora moderation helpers', () => {
	it('reads hidden from either the moderation record or the shared flag', () => {
		expect(isAgoraHidden(undefined)).toBe(false);
		expect(isAgoraHidden({})).toBe(false);
		expect(isAgoraHidden({ hide: true })).toBe(true);
		expect(isAgoraHidden({ agoraModeration: { hidden: true } })).toBe(true);
		expect(isAgoraHidden({ agoraModeration: { hidden: false }, hide: false })).toBe(false);
	});

	it('marks a teacher edit only when the edit clock exists', () => {
		expect(isTeacherEdited({ agoraModeration: { hidden: false } })).toBe(false);
		expect(isTeacherEdited({ agoraModeration: { hidden: false, editedAt: 5 } })).toBe(true);
	});

	it('detects the moderation clocks moving and nothing else', () => {
		const untouched = { agoraModeration: { hidden: false, editedAt: 1 } };
		expect(isTeacherTouched(untouched, untouched)).toBe(false);
		expect(isTeacherTouched(null, null)).toBe(false);
		expect(isTeacherTouched(null, { agoraModeration: { hidden: true, hiddenAt: 9 } })).toBe(true);
		expect(
			isTeacherTouched(
				{ agoraModeration: { hidden: false, editedAt: 1 } },
				{ agoraModeration: { hidden: false, editedAt: 2 } },
			),
		).toBe(true);
		// A student's own save leaves the record alone
		expect(
			isTeacherTouched(
				{ agoraModeration: { hidden: false, editedAt: 1 }, hide: false },
				{ agoraModeration: { hidden: false, editedAt: 1 }, hide: false },
			),
		).toBe(false);
	});

	it('knows the quick phrases', () => {
		expect(isAgoraTeacherPreset('language')).toBe(true);
		expect(isAgoraTeacherPreset('shout')).toBe(false);
		expect(isAgoraTeacherPreset(3)).toBe(false);
	});

	it('round-trips the new schemas', () => {
		expect(safeParse(AgoraModerationSchema, { hidden: true, hiddenAt: 1 }).success).toBe(true);
		expect(
			safeParse(AgoraIdentitySchema, {
				identityId: 's--u',
				sessionId: 's',
				teacherId: 't',
				userId: 'u',
				anonName: 'Brave Lantern',
				realName: 'Tal Y.',
				createdAt: 1,
				lastUpdate: 1,
				expiresAt: 2,
			}).success,
		).toBe(true);
		expect(
			safeParse(AgoraTeacherMessageSchema, {
				messageId: 'm',
				sessionId: 's',
				teacherId: 't',
				studentUid: 'u',
				from: 'teacher',
				kind: 'moderation',
				text: 'language',
				moderation: 'hidden',
				removedText: 'the old words',
				aboutStatementId: 'p1',
				createdAt: 1,
			}).success,
		).toBe(true);
	});
});
