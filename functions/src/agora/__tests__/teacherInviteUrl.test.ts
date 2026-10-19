import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../utils/emailTransporter', () => ({
	getEmailTransporter: jest.fn(async () => null),
}));

const ORIGINAL_AGORA_APP_URL = process.env.AGORA_APP_URL;

/** The base URL map is read when notificationEmail loads, so load it fresh per case */
function loadTeacherInviteUrl(): () => string {
	let teacherInviteUrl: () => string = () => '';
	jest.isolateModules(() => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		teacherInviteUrl = require('../teacherInviteEmail').teacherInviteUrl;
	});

	return teacherInviteUrl;
}

describe('teacherInviteUrl', () => {
	beforeEach(() => {
		delete process.env.AGORA_APP_URL;
	});

	afterEach(() => {
		if (ORIGINAL_AGORA_APP_URL === undefined) delete process.env.AGORA_APP_URL;
		else process.env.AGORA_APP_URL = ORIGINAL_AGORA_APP_URL;
	});

	it('defaults to agora.wizcol.com when AGORA_APP_URL is unset', () => {
		expect(loadTeacherInviteUrl()()).toBe('https://agora.wizcol.com/#!/teach');
	});

	it('honors AGORA_APP_URL when set', () => {
		process.env.AGORA_APP_URL = 'https://agora.example.org';

		expect(loadTeacherInviteUrl()()).toBe('https://agora.example.org/#!/teach');
	});
});
