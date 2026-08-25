import { Collections, NotificationTriggerType, Role, StatementType } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('../db', () => ({
	get db() {
		return fake.db;
	},
}));

class FakeHttpsError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}
jest.mock('firebase-functions/v2/https', () => ({
	onCall: jest.fn((_opts: unknown, handler: unknown) => handler),
	HttpsError: FakeHttpsError,
}));

// jest.setup's firebase-admin/firestore mock has no FieldPath; the nudge
// paginator orders by document id.
jest.mock('firebase-admin/firestore', () => ({
	FieldPath: { documentId: jest.fn(() => '__name__') },
	FieldValue: { increment: jest.fn((n: number) => ({ _increment: n })) },
}));

const sendMail = jest.fn(() => Promise.resolve());
jest.mock('../utils/emailTransporter', () => ({
	getEmailTransporter: jest.fn(() => Promise.resolve({ sendMail })),
}));

import { nudgeQuestionSubscribersForAdmin } from '../fn_nudgeQuestionSubscribers';

const Q = 'question-1';
const ADMIN = 'admin-1';

function seedQuestion(): void {
	fake.seed(Collections.statements, Q, {
		statementId: Q,
		statement: 'What should we do?',
		statementType: StatementType.question,
		parentId: 'top',
		topParentId: Q,
		creatorId: ADMIN,
	});
}

function seedSub(uid: string, overrides: Record<string, unknown> = {}): void {
	fake.seed(Collections.statementsSubscribe, `${uid}--${Q}`, {
		role: Role.member,
		userId: uid,
		statementId: Q,
		user: { uid, displayName: uid, email: `${uid}@example.com` },
		...overrides,
	});
}

const request = (overrides: Record<string, unknown> = {}) => ({
	statementId: Q,
	message: 'Please add your idea',
	audience: 'all',
	channels: ['inApp'],
	...overrides,
});

beforeEach(() => {
	fake = createFakeDb();
	sendMail.mockClear();
	seedQuestion();
});

describe('nudgeQuestionSubscribersForAdmin', () => {
	it('rejects an empty or too-long message', async () => {
		await expect(
			nudgeQuestionSubscribersForAdmin(ADMIN, 'Admin', request({ message: '   ' }) as never),
		).rejects.toMatchObject({ code: 'invalid-argument' });
		await expect(
			nudgeQuestionSubscribersForAdmin(
				ADMIN,
				'Admin',
				request({ message: 'x'.repeat(281) }) as never,
			),
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('rejects non-admins', async () => {
		await expect(
			nudgeQuestionSubscribersForAdmin('stranger', 'S', request() as never),
		).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('is rate limited to one nudge per hour', async () => {
		fake.seed(Collections.questionProgress, Q, {
			statementId: Q,
			lastNudgeAt: Date.now() - 10 * 60000,
		});
		await expect(
			nudgeQuestionSubscribersForAdmin(ADMIN, 'Admin', request() as never),
		).rejects.toMatchObject({
			code: 'resource-exhausted',
			message: expect.stringContaining('50 minutes'),
		});
	});

	it('targets all eligible subscribers and stamps lastNudgeAt', async () => {
		seedSub('u1');
		seedSub('u2');
		seedSub('banned', { role: Role.banned });
		seedSub(ADMIN, { role: Role.admin });

		const result = await nudgeQuestionSubscribersForAdmin(ADMIN, 'Admin', request() as never);

		expect(result).toEqual({ sent: 2, inApp: 2, email: 0 });
		const notifications = [...(fake.store.get(Collections.inAppNotifications)?.values() ?? [])];
		expect(notifications.map((n) => n.userId).sort()).toEqual(['u1', 'u2']);
		expect(notifications[0]).toMatchObject({
			text: 'Please add your idea',
			title: 'What should we do?',
			triggerType: NotificationTriggerType.FACILITATOR_NUDGE,
			targetPath: `/statement/${Q}`,
			creatorName: 'Admin',
			read: false,
		});
		expect(typeof fake.read(Collections.questionProgress, Q)?.lastNudgeAt).toBe('number');
	});

	it('filters the notSuggested audience by participation markers', async () => {
		seedSub('u1');
		seedSub('u2');
		fake.seed(Collections.questionParticipation, `${Q}--u1`, {
			statementId: Q,
			userId: 'u1',
			suggested: true,
		});

		const result = await nudgeQuestionSubscribersForAdmin(
			ADMIN,
			'Admin',
			request({ audience: 'notSuggested' }) as never,
		);

		expect(result.sent).toBe(1);
		const notifications = [...(fake.store.get(Collections.inAppNotifications)?.values() ?? [])];
		expect(notifications.map((n) => n.userId)).toEqual(['u2']);
	});

	it('emails only subscribers with an address who have not opted out', async () => {
		seedSub('u1');
		seedSub('u2', { getEmailNotification: false });
		seedSub('u3', { user: { uid: 'u3', displayName: 'u3' } });

		const result = await nudgeQuestionSubscribersForAdmin(
			ADMIN,
			'Admin',
			request({ channels: ['email'] }) as never,
		);

		expect(result).toEqual({ sent: 3, inApp: 0, email: 1 });
		expect(sendMail).toHaveBeenCalledTimes(1);
		expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'u1@example.com' }));
	});
});
