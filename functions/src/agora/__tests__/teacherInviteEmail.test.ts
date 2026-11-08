import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../utils/emailTransporter', () => ({
	getEmailTransporter: jest.fn(async () => null),
}));

import {
	buildTeacherInviteEmail,
	sendTeacherInviteEmail,
	teacherInviteUrl,
} from '../teacherInviteEmail';

const URL = 'https://agora.example.org/#!/teach';

describe('buildTeacherInviteEmail', () => {
	it('invite: Hebrew first and RTL, names the school, the address and the link, then English', () => {
		const mail = buildTeacherInviteEmail({
			kind: 'invite',
			schoolName: 'תיכון הדר',
			email: 'dana@school.org',
			url: URL,
		});
		expect(mail.subject).toContain('הוזמנת ללמד בתיכון הדר');
		expect(mail.subject).toContain("You're invited to teach in תיכון הדר on Agora");
		expect(mail.html).toContain('<html lang="he" dir="rtl">');
		expect(mail.html.indexOf('dir="rtl" lang="he"')).toBeLessThan(
			mail.html.indexOf('dir="ltr" lang="en"'),
		);
		expect(mail.html).toContain('dana@school.org');
		expect(mail.html).toContain(`href="${URL}"`);
		expect(mail.text).toContain('sign in to Agora with Google using this address: dana@school.org');
	});

	it('added: says they were added', () => {
		const mail = buildTeacherInviteEmail({
			kind: 'added',
			schoolName: 'Hadar',
			email: 'a@b.org',
			url: URL,
		});
		expect(mail.subject).toContain('You were added to Hadar');
		expect(mail.text).toContain('צורפת לHadar');
	});

	it('escapes HTML in the school name and keeps the subject one line', () => {
		const mail = buildTeacherInviteEmail({
			kind: 'invite',
			schoolName: '<script>x</script>\r\nBcc: evil@x.org',
			email: 'a@b.org',
			url: URL,
		});
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
		expect(mail.subject).not.toMatch(/[\r\n]/);
	});

	it('links to the Agora teacher room', () => {
		expect(teacherInviteUrl()).toMatch(/\/#!\/teach$/);
	});
});

describe('sendTeacherInviteEmail', () => {
	it('returns false without throwing when mail is not configured', async () => {
		await expect(
			sendTeacherInviteEmail({ kind: 'invite', schoolName: 'S', email: 'a@b.org' }, {}),
		).resolves.toBe(false);
	});
});
