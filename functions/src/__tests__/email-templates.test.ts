import { describe, it, expect } from '@jest/globals';
import {
	createInvitationEmail,
	createMassConsensusNotificationEmail,
	createOrganizationInvitationEmail,
	createReplyNotificationEmail,
} from '../email-templates';
import { escapeHtml, safeHttpUrl } from '../utils/htmlEscape';

const XSS = '<img src=x onerror=alert(1)>';

describe('escapeHtml', () => {
	it('escapes the five HTML metacharacters', () => {
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
		);
	});
});

describe('safeHttpUrl', () => {
	it('accepts http and https', () => {
		expect(safeHttpUrl('https://app.wizcol.com/a?b=1')).toBe('https://app.wizcol.com/a?b=1');
		expect(safeHttpUrl('http://localhost:5173/')).toBe('http://localhost:5173/');
	});

	it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'not a url', '', 7, null])(
		'rejects %s',
		(value) => {
			expect(safeHttpUrl(value)).toBeUndefined();
		},
	);
});

describe('email templates', () => {
	it('escapes the admin message and title in a mass notification, keeping line breaks', () => {
		const html = createMassConsensusNotificationEmail({
			statementId: 'q1',
			statementTitle: XSS,
			message: `${XSS}\nline two`,
		});

		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img');
		expect(html).toContain('<br>line two');
	});

	it('never renders a javascript: button link', () => {
		const html = createMassConsensusNotificationEmail({
			statementId: 'q1',
			message: 'm',
			buttonUrl: 'javascript:alert(1)',
		});

		expect(html).not.toContain('javascript:');
	});

	it('escapes the replier and reply text', () => {
		const html = createReplyNotificationEmail({
			statementId: 'q1',
			replyText: XSS,
			replierName: XSS,
		});

		expect(html).not.toContain('<img');
	});

	it('escapes an invitation message', () => {
		expect(createInvitationEmail({ statementId: 'q1', message: XSS })).not.toContain('<img');
	});

	it('escapes organization names once, without double-escaping the title', () => {
		const html = createOrganizationInvitationEmail({
			organizationName: 'A & B',
			inviterName: XSS,
			role: 'admin',
			inviteLink: 'https://x.example/invite',
			language: 'en',
		});

		expect(html).not.toContain('<img');
		expect(html).toContain('A &amp; B');
		expect(html).not.toContain('&amp;amp;');
	});
});
