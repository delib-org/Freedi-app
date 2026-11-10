// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';

const appCheck = vi.hoisted(() => ({
	initializeAppCheck: vi.fn(),
	ReCaptchaV3Provider: class ReCaptchaV3Provider {},
}));
const utils = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('firebase/app-check', () => appCheck);
vi.mock('@freedi/shared-utils', () => utils);

import { appCheckModeFor, initializeTablesAppCheck } from '../appCheck';

const APP = {} as FirebaseApp;

describe('appCheckModeFor', () => {
	it('verifies with reCAPTCHA on the production domains', () => {
		expect(appCheckModeFor('tables.wizcol.com')).toBe('production');
		expect(appCheckModeFor('wizcol-tables.web.app')).toBe('production');
	});

	it('uses a debug token on localhost and leaves other hosts alone', () => {
		expect(appCheckModeFor('localhost')).toBe('debug');
		expect(appCheckModeFor('preview--tables.web.app')).toBe('off');
	});
});

describe('initializeTablesAppCheck', () => {
	beforeEach(() => {
		appCheck.initializeAppCheck.mockReset();
		utils.logError.mockReset();
	});

	it('initialises on localhost', () => {
		appCheck.initializeAppCheck.mockReturnValue({ ok: true });

		expect(initializeTablesAppCheck(APP)).toEqual({ ok: true });
		expect(appCheck.initializeAppCheck).toHaveBeenCalledTimes(1);
	});

	it('returns null and logs instead of throwing when the SDK fails', () => {
		appCheck.initializeAppCheck.mockImplementation(() => {
			throw new Error('boom');
		});

		expect(initializeTablesAppCheck(APP)).toBeNull();
		expect(utils.logError).toHaveBeenCalledWith(expect.any(Error), {
			operation: 'tables.appCheck.initialize',
			metadata: { mode: 'debug' },
		});
	});
});
