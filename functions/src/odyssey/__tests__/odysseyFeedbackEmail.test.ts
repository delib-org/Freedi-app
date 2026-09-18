import type { OdysseyFeedback } from '@freedi/shared-types';

jest.mock('../../utils/emailTransporter', () => ({
	getEmailTransporter: jest.fn(),
}));

import { getEmailTransporter } from '../../utils/emailTransporter';
import { resolveFeedbackRecipients, sendOdysseyFeedbackEmail } from '../odysseyFeedbackEmail';

const mockGetTransporter = getEmailTransporter as jest.MockedFunction<typeof getEmailTransporter>;
const sendMail = jest.fn();

function feedback(overrides: Partial<OdysseyFeedback> = {}): OdysseyFeedback {
	return {
		feedbackId: 'fb-1',
		message: 'הכפתור לא הגיב',
		uid: 'sailor-1',
		isAnonymous: false,
		context: { route: '/voyage', gameId: 'default' },
		createdAt: Date.UTC(2026, 8, 18, 12, 0, 0),
		emailed: false,
		...overrides,
	};
}

describe('resolveFeedbackRecipients', () => {
	afterEach(() => {
		delete process.env.ODYSSEY_FEEDBACK_RECIPIENTS;
	});

	it('mails both developers when nothing is configured', () => {
		expect(resolveFeedbackRecipients()).toEqual(['tal.yaron@gmail.com', 'uriel@tauex.tau.ac.il']);
	});

	it('falls back to the defaults for a blank value', () => {
		process.env.ODYSSEY_FEEDBACK_RECIPIENTS = '';

		expect(resolveFeedbackRecipients()).toEqual(['tal.yaron@gmail.com', 'uriel@tauex.tau.ac.il']);
	});

	it('trims, lowercases, dedupes and drops entries that are not addresses', () => {
		process.env.ODYSSEY_FEEDBACK_RECIPIENTS = ' A@b.com , c@d.com , , junk , a@B.com ';

		expect(resolveFeedbackRecipients()).toEqual(['a@b.com', 'c@d.com']);
	});
});

describe('sendOdysseyFeedbackEmail', () => {
	beforeEach(() => {
		sendMail.mockReset().mockResolvedValue({ messageId: 'm1' });
		mockGetTransporter.mockReset();
		mockGetTransporter.mockResolvedValue({ sendMail } as never);
		process.env.EMAIL_USER = 'game@example.com';
	});

	afterEach(() => {
		delete process.env.ODYSSEY_FEEDBACK_RECIPIENTS;
	});

	it('mails both developers from our own account', async () => {
		await expect(sendOdysseyFeedbackEmail(feedback())).resolves.toBe(true);

		const payload = sendMail.mock.calls[0][0];
		expect(payload.to).toEqual(['tal.yaron@gmail.com', 'uriel@tauex.tau.ac.il']);
		expect(payload.from).toBe('game@example.com');
	});

	it('sets replyTo to the sailor when they left an address', async () => {
		await sendOdysseyFeedbackEmail(feedback({ email: 'dana@example.com' }));

		expect(sendMail.mock.calls[0][0].replyTo).toBe('dana@example.com');
	});

	it('omits replyTo entirely when they did not', async () => {
		await sendOdysseyFeedbackEmail(feedback());

		expect(sendMail.mock.calls[0][0]).not.toHaveProperty('replyTo');
	});

	it('escapes the message in html and leaves it raw in text', async () => {
		const message = '<img src=x onerror=alert(1)>';
		await sendOdysseyFeedbackEmail(feedback({ message }));

		const payload = sendMail.mock.calls[0][0];
		expect(payload.html).not.toContain('<img src=x');
		expect(payload.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(payload.text).toContain(message);
	});

	it('escapes context fields too', async () => {
		await sendOdysseyFeedbackEmail(
			feedback({ context: { route: '/voyage"><script>alert(1)</script>' } }),
		);

		expect(sendMail.mock.calls[0][0].html).not.toContain('<script>');
	});

	it('turns newlines into breaks in the html body', async () => {
		await sendOdysseyFeedbackEmail(feedback({ message: 'שורה\nשנייה' }));

		const payload = sendMail.mock.calls[0][0];
		expect(payload.html).toContain('שורה<br>שנייה');
		expect(payload.text).toContain('שורה\nשנייה');
	});

	it('keeps the ascii prefix, strips newlines and truncates the subject', async () => {
		await sendOdysseyFeedbackEmail(feedback({ message: `${'א'.repeat(90)}\nעוד שורה` }));

		const { subject } = sendMail.mock.calls[0][0];
		expect(subject.startsWith('[Odyssey] ')).toBe(true);
		expect(subject).not.toContain('\n');
		expect(subject).toContain('…');
	});

	it('returns false without sending when no transporter is configured', async () => {
		mockGetTransporter.mockResolvedValue(null);

		await expect(sendOdysseyFeedbackEmail(feedback())).resolves.toBe(false);
		expect(sendMail).not.toHaveBeenCalled();
	});

	it('returns false rather than throwing when the send fails', async () => {
		sendMail.mockRejectedValue(new Error('535 BadCredentials'));

		await expect(sendOdysseyFeedbackEmail(feedback())).resolves.toBe(false);
	});
});
