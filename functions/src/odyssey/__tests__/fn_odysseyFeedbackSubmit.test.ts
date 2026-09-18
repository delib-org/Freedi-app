import {
	Collections,
	ODYSSEY_FEEDBACK_GLOBAL_KEY,
	ODYSSEY_FEEDBACK_GLOBAL_PER_DAY,
	ODYSSEY_FEEDBACK_PER_HOUR,
} from '@freedi/shared-types';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { asHandler, expectHttpsError, fakeDbFrom } from '../../organizations/__tests__/testUtils';

jest.mock('firebase-functions/v2/https', () => ({
	onCall: (_opts: unknown, handler: unknown) => handler,
	HttpsError: class HttpsError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
		}
	},
}));
jest.mock('../../db', () => {
	const { createFakeDb } = jest.requireActual('../../organizations/__tests__/fakeFirestore');

	return { db: createFakeDb() };
});
jest.mock('../odysseyFeedbackEmail', () => ({
	sendOdysseyFeedbackEmail: jest.fn(async () => true),
}));

import * as dbModule from '../../db';
import { sendOdysseyFeedbackEmail } from '../odysseyFeedbackEmail';
import { odysseyFeedbackSubmit } from '../fn_odysseyFeedbackSubmit';

const db = fakeDbFrom(dbModule);
const mockSend = sendOdysseyFeedbackEmail as jest.MockedFunction<typeof sendOdysseyFeedbackEmail>;
const submit = asHandler<Record<string, unknown>, { feedbackId: string; emailed: boolean }>(
	odysseyFeedbackSubmit,
);

const UID = 'sailor-1';

/**
 * The shared `makeRequest` has no way to express an anonymous sign-in provider,
 * and that flag is exactly what several of these tests are about.
 */
function request(
	data: unknown,
	auth?: { uid: string; email?: string; name?: string; anonymous?: boolean },
): CallableRequest<Record<string, unknown>> {
	return {
		data,
		auth: auth
			? {
					uid: auth.uid,
					token: {
						email: auth.email,
						name: auth.name,
						firebase: { sign_in_provider: auth.anonymous ? 'anonymous' : 'google.com' },
					},
				}
			: undefined,
		rawRequest: {},
		acceptsStreaming: false,
	} as unknown as CallableRequest<Record<string, unknown>>;
}

function storedFeedback(): Record<string, unknown>[] {
	return [...(db.store.get(Collections.odysseyFeedback)?.values() ?? [])];
}

describe('odysseyFeedbackSubmit', () => {
	beforeEach(() => {
		db.store.clear();
		mockSend.mockReset();
		mockSend.mockResolvedValue(true);
	});

	it('rejects an unauthenticated caller', async () => {
		await expectHttpsError(submit(request({ message: 'שלום לכם' })), 'unauthenticated');
	});

	it.each([
		['too short', 'ab'],
		['too long', 'x'.repeat(4001)],
	])('rejects a message that is %s', async (_label, message) => {
		await expectHttpsError(submit(request({ message }, { uid: UID })), 'invalid-argument');
	});

	it('rejects a malformed email', async () => {
		await expectHttpsError(
			submit(request({ message: 'הכפתור לא הגיב', email: 'not-an-email' }, { uid: UID })),
			'invalid-argument',
		);
	});

	it('rejects an oversized context field before it reaches Firestore', async () => {
		await expectHttpsError(
			submit(
				request(
					{ message: 'הכפתור לא הגיב', context: { userAgent: 'u'.repeat(400) } },
					{ uid: UID },
				),
			),
			'invalid-argument',
		);
	});

	it('stores a trimmed letter and reports it emailed', async () => {
		const result = await submit(
			request({ message: '  הכפתור לא הגיב  ', email: 'dana@example.com' }, { uid: UID }),
		);

		expect(result.emailed).toBe(true);
		const [doc] = storedFeedback();
		expect(doc.message).toBe('הכפתור לא הגיב');
		expect(doc.email).toBe('dana@example.com');
		expect(doc.emailed).toBe(true);
	});

	it('ignores a uid smuggled in the payload', async () => {
		await submit(request({ message: 'הכפתור לא הגיב', uid: 'someone-else' }, { uid: UID }));

		expect(storedFeedback()[0].uid).toBe(UID);
	});

	it('records an anonymous sailor as anonymous', async () => {
		await submit(request({ message: 'הכפתור לא הגיב' }, { uid: UID, anonymous: true }));

		expect(storedFeedback()[0].isAnonymous).toBe(true);
	});

	it('keeps the letter and still succeeds when the mail does not go out', async () => {
		mockSend.mockResolvedValue(false);

		const result = await submit(request({ message: 'הכפתור לא הגיב' }, { uid: UID }));

		expect(result.emailed).toBe(false);
		expect(storedFeedback()).toHaveLength(1);
		expect(storedFeedback()[0].emailed).toBe(false);
	});

	it('does not propagate a throw from the email module', async () => {
		mockSend.mockRejectedValue(new Error('smtp exploded'));

		const result = await submit(request({ message: 'הכפתור לא הגיב' }, { uid: UID }));

		expect(result.emailed).toBe(false);
		expect(storedFeedback()).toHaveLength(1);
	});

	it('reports internal when the letter cannot be stored', async () => {
		// Only the feedback write fails; the rate-limit transaction, which runs
		// first and also calls db.collection(), must still work.
		const real = db.collection.bind(db);
		const failing = jest.spyOn(db, 'collection').mockImplementation((name: string) =>
			name === Collections.odysseyFeedback
				? ({
						doc: () => ({ set: () => Promise.reject(new Error('firestore down')) }),
					} as unknown as ReturnType<typeof db.collection>)
				: real(name),
		);

		await expectHttpsError(
			submit(request({ message: 'הכפתור לא הגיב' }, { uid: UID })),
			'internal',
		);
		failing.mockRestore();
	});

	it('rate-limits the same sailor after the hourly budget', async () => {
		for (let i = 0; i < ODYSSEY_FEEDBACK_PER_HOUR; i++) {
			await submit(request({ message: `מכתב מספר ${i}` }, { uid: UID }));
		}

		await expectHttpsError(
			submit(request({ message: 'עוד מכתב' }, { uid: UID })),
			'resource-exhausted',
		);
	});

	it('lets the sailor write again once the window has passed', async () => {
		for (let i = 0; i < ODYSSEY_FEEDBACK_PER_HOUR; i++) {
			await submit(request({ message: `מכתב מספר ${i}` }, { uid: UID }));
		}
		// Age the window rather than the clock — same effect, no fake timers.
		db.seed(Collections.odysseyRateLimits, UID, {
			windowStart: Date.now() - 2 * 60 * 60 * 1000,
			count: ODYSSEY_FEEDBACK_PER_HOUR,
		});

		await expect(submit(request({ message: 'מכתב חדש' }, { uid: UID }))).resolves.toMatchObject({
			emailed: true,
		});
	});

	it('stops a fresh uid once the global daily cap is spent', async () => {
		db.seed(Collections.odysseyRateLimits, ODYSSEY_FEEDBACK_GLOBAL_KEY, {
			windowStart: Date.now(),
			count: ODYSSEY_FEEDBACK_GLOBAL_PER_DAY,
		});

		await expectHttpsError(
			submit(request({ message: 'הכפתור לא הגיב' }, { uid: 'brand-new-uid' })),
			'resource-exhausted',
		);
	});
});
