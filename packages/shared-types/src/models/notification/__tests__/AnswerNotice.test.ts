import { safeParse } from 'valibot';
import { AnswerNoticeStateSchema, NoticeCapSlotSchema } from '../AnswerNotice';
import { NotificationSettingsSchema } from '../NotificationSettings';
import { NotificationFrequency } from '../../engagement/NotificationFrequency';

// setupTests mocks valibot for the whole package; these tests need the real parser.
jest.unmock('valibot');

const SETTINGS_WITHOUT_ANSWER_UPDATES = {
	userId: 'u1',
	muted: false,
	defaultChannels: { push: true, inApp: true, email: false },
	defaultFrequency: NotificationFrequency.INSTANT,
	createdAt: 1,
	lastUpdate: 1,
};

describe('answer notice models', () => {
	it('parses a state doc holding only the required fields', () => {
		expect(safeParse(AnswerNoticeStateSchema, { statementId: 's1', lastUpdate: 1 }).success).toBe(
			true,
		);
	});

	it('rejects a state doc with a non-numeric baseline', () => {
		const state = { statementId: 's1', lastUpdate: 1, baselineRaters: 'many' };

		expect(safeParse(AnswerNoticeStateSchema, state).success).toBe(false);
	});

	it('parses a cap slot', () => {
		const slot = { key: 'answer_s1', queueItemId: 'q1', createdAt: 1 };

		expect(safeParse(NoticeCapSlotSchema, slot).success).toBe(true);
	});

	it('still parses notification settings saved before answerUpdates existed', () => {
		expect(safeParse(NotificationSettingsSchema, SETTINGS_WITHOUT_ANSWER_UPDATES).success).toBe(
			true,
		);
	});

	it('keeps answerUpdates when it is set', () => {
		const result = safeParse(NotificationSettingsSchema, {
			...SETTINGS_WITHOUT_ANSWER_UPDATES,
			answerUpdates: false,
		});

		expect(result.success && result.output.answerUpdates).toBe(false);
	});
});
