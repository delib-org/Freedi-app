/**
 * @vitest-environment jsdom
 *
 * The only suite in this app that needs a DOM: buildFeedbackContext() reads
 * location, navigator and window on purpose. Everything else here stays pure,
 * which is why the app has no global test environment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OdysseyFeedbackRequest, OdysseyFeedbackResponse } from '@freedi/shared-types';

const signInAnonymous = vi.fn(async () => {});
const submitOdysseyFeedback = vi.fn(
	async (_input: OdysseyFeedbackRequest): Promise<OdysseyFeedbackResponse> => ({
		feedbackId: 'fb-1',
		emailed: true,
	}),
);
const authState: { currentUser: unknown } = { currentUser: null };

vi.mock('../firebase', () => ({ auth: authState }));
vi.mock('../user', () => ({ signInAnonymous }));
vi.mock('../callables', () => ({ submitOdysseyFeedback }));
vi.mock('../../state/GameContext', () => ({ currentGameId: () => 'default' }));

const {
	FEEDBACK_MAILTO,
	buildFeedbackContext,
	isPlausibleEmail,
	submitFeedback,
	toFeedbackFailure,
} = await import('../feedback');

describe('isPlausibleEmail', () => {
	it.each(['dana@example.com', ' dana@example.co.il ', 'a.b+c@sub.domain.org'])(
		'accepts %s',
		(value) => {
			expect(isPlausibleEmail(value)).toBe(true);
		},
	);

	it.each(['', 'dana', 'dana@', '@example.com', 'dana@example', 'a b@example.com'])(
		'rejects %s',
		(value) => {
			expect(isPlausibleEmail(value)).toBe(false);
		},
	);
});

describe('FEEDBACK_MAILTO', () => {
	it('is built from the same constant the server mails to', () => {
		expect(FEEDBACK_MAILTO).toBe('mailto:tal.yaron@gmail.com,uriel@tauex.tau.ac.il');
	});
});

describe('buildFeedbackContext', () => {
	it('captures the route, viewport, language and game', () => {
		const context = buildFeedbackContext();

		expect(context.route).toBe('/');
		expect(context.gameId).toBe('default');
		expect(context.viewport).toMatch(/^\d+x\d+$/);
		expect(context.language).toBeTruthy();
	});

	it('reports the injected build version', () => {
		vi.stubEnv('VITE_APP_VERSION', '9.9.9');

		expect(buildFeedbackContext().appVersion).toBe('9.9.9');

		vi.unstubAllEnvs();
	});

	it('falls back to "unknown" when no build version was injected', () => {
		// Stubbed rather than read from the ambient .env.local, which `npm run
		// env:dev` regenerates — this must test the fallback, not the machine.
		vi.stubEnv('VITE_APP_VERSION', '');

		expect(buildFeedbackContext().appVersion).toBe('unknown');

		vi.unstubAllEnvs();
	});

	it('caps a hostile user agent rather than sending it whole', () => {
		const original = navigator.userAgent;
		Object.defineProperty(navigator, 'userAgent', {
			value: 'u'.repeat(5000),
			configurable: true,
		});

		expect(buildFeedbackContext().userAgent).toHaveLength(300);

		Object.defineProperty(navigator, 'userAgent', { value: original, configurable: true });
	});

	it('degrades to an empty context instead of throwing', async () => {
		vi.resetModules();
		vi.doMock('../../state/GameContext', () => ({
			currentGameId: () => {
				throw new Error('no game');
			},
		}));
		const { buildFeedbackContext: build } = await import('../feedback');

		expect(build()).toEqual({});

		vi.doUnmock('../../state/GameContext');
		vi.resetModules();
	});
});

describe('submitFeedback', () => {
	beforeEach(() => {
		signInAnonymous.mockClear();
		submitOdysseyFeedback.mockClear();
		authState.currentUser = null;
	});

	it('boards an anonymous sailor before writing, so the callable has a caller', async () => {
		await submitFeedback({ message: 'הכפתור לא הגיב' });

		expect(signInAnonymous).toHaveBeenCalledTimes(1);
		expect(submitOdysseyFeedback).toHaveBeenCalledTimes(1);
	});

	it('does not sign in again when somebody is already aboard', async () => {
		authState.currentUser = { uid: 'sailor-1' };

		await submitFeedback({ message: 'הכפתור לא הגיב' });

		expect(signInAnonymous).not.toHaveBeenCalled();
	});

	it('trims the message and omits an empty address entirely', async () => {
		await submitFeedback({ message: '  הכפתור לא הגיב  ', email: '   ' });

		const payload = submitOdysseyFeedback.mock.calls[0]?.[0];
		expect(payload?.message).toBe('הכפתור לא הגיב');
		expect(payload).not.toHaveProperty('email');
	});

	it('passes a trimmed address through when one was given', async () => {
		await submitFeedback({ message: 'הכפתור לא הגיב', email: ' dana@example.com ' });

		expect(submitOdysseyFeedback.mock.calls[0]?.[0].email).toBe('dana@example.com');
	});
});

describe('toFeedbackFailure', () => {
	it('maps the rate-limit code', () => {
		expect(toFeedbackFailure({ code: 'functions/resource-exhausted' })).toBe('limited');
	});

	it('maps a rejected address by the field path the server sends', () => {
		expect(toFeedbackFailure({ code: 'functions/invalid-argument', message: 'email' })).toBe(
			'badEmail',
		);
	});

	it('maps any other invalid argument to the message', () => {
		expect(toFeedbackFailure({ code: 'functions/invalid-argument', message: 'message' })).toBe(
			'tooShort',
		);
	});

	it('maps anything unrecognised to the generic failure', () => {
		expect(toFeedbackFailure(new Error('offline'))).toBe('failed');
		expect(toFeedbackFailure(null)).toBe('failed');
	});
});
