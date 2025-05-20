import { logger } from 'firebase-functions/v1';
import { createInvitationEmail, createReplyNotificationEmail, createStatementEmailTemplate, createStatementUpdateEmail } from './email-templates';
import { sendEmail } from './helpers';

/**
 * Utility function for testing email templates
 * This function is for development purposes only
 */
export async function testEmailTemplates(recipientEmail: string): Promise<void> {
	try {
		const testStatementId = 'test-statement-123';

		// Test standard statement template
		const basicTemplate = createStatementEmailTemplate({
			statementId: testStatementId,
			message: 'This is a test of the basic statement email template.',
			title: 'Test Email Template',
			recipientName: 'Freedi User'
		});

		// Test reply notification template
		const replyTemplate = createReplyNotificationEmail({
			statementId: testStatementId,
			replyText: 'This is a test reply to demonstrate the formatting of reply notifications in the Freedi app. The template formats long replies nicely and includes styling for better readability.',
			replierName: 'Test User',
			recipientName: 'Freedi User'
		});

		// Test invitation template
		const invitationTemplate = createInvitationEmail({
			statementId: testStatementId,
			inviterName: 'Test Inviter',
			statementTitle: 'Important Discussion Topic',
			recipientName: 'Freedi User'
		});

		// Test update templates
		const consensusTemplate = createStatementUpdateEmail({
			statementId: testStatementId,
			updateType: 'consensus',
			statementTitle: 'Group Decision Making',
			recipientName: 'Freedi User'
		});

		const deadlineTemplate = createStatementUpdateEmail({
			statementId: testStatementId,
			updateType: 'deadline',
			statementTitle: 'Project Timeline',
			recipientName: 'Freedi User'
		});

		// Send test emails
		await sendEmail({
			to: recipientEmail,
			subject: 'Freedi Email Template Test - Basic',
			body: basicTemplate
		});

		await sendEmail({
			to: recipientEmail,
			subject: 'Freedi Email Template Test - Reply Notification',
			body: replyTemplate
		});

		await sendEmail({
			to: recipientEmail,
			subject: 'Freedi Email Template Test - Invitation',
			body: invitationTemplate
		});

		await sendEmail({
			to: recipientEmail,
			subject: 'Freedi Email Template Test - Consensus Update',
			body: consensusTemplate
		});

		await sendEmail({
			to: recipientEmail,
			subject: 'Freedi Email Template Test - Deadline Update',
			body: deadlineTemplate
		});

		logger.info('Test emails sent successfully');
	} catch (error) {
		logger.error('Error sending test emails:', error);
	}
}
