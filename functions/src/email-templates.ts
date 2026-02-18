import { logger } from 'firebase-functions/v1';

interface BaseEmailOptions {
	title?: string;
	message: string;
	buttonText?: string;
	buttonUrl: string;
	showButtonLink?: boolean;
	recipientName?: string;
}

/**
 * Creates a base HTML email template
 * @param options - Configuration options for the email template
 * @returns HTML string for email body
 */
function createBaseEmailTemplate({
	title = 'Freedi Notification',
	message,
	buttonText = 'View Details',
	buttonUrl,
	showButtonLink = true,
	recipientName = '',
}: BaseEmailOptions): string {
	try {
		const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

		return `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 25px;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .logo {
            max-width: 150px;
            margin-bottom: 15px;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            background-color:rgb(132, 187, 247);
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            display: inline-block;
        }
        .button:hover {
            background-color:rgb(88, 153, 223);
        }
        .button a {
            color: white;
        }
	
        .message {
            margin: 20px 0;
            line-height: 1.8;
        }
        .footer {
            margin-top: 30px;
            font-size: 12px;
            text-align: center;
            color: #777777;
            border-top: 1px solid #eaeaea;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${title}</h2>
        </div>
        
        <p>${greeting}</p>
        
        <div class="message">
            <p>${message}</p>
        </div>
        
        <div class="button-container">
            <a href="${buttonUrl}" class="button">${buttonText}</a>
        </div>
        
        ${
					showButtonLink
						? `
        <p>If you're having trouble with the button above, you can also copy and paste the following link into your browser:</p>
        <p style="word-break: break-all;">${buttonUrl}</p>
        `
						: ''
				}
        
        <p>Thank you for using Freedi!</p>
        
        <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p><a href="https://freedi.co" style="color: #1f5895; text-decoration: none;">Freedi.co</a></p>
        </div>
    </div>
</body>
</html>`;
	} catch (error) {
		logger.error('Error creating base email template:', error);

		return `<p>${message}</p><p><a href="${buttonUrl}">${buttonText}</a></p>`;
	}
}

/**
 * Creates an HTML email template with a button linked to a statement URL
 * @param options - Configuration options for the email template
 * @param options.buttonText - Text to display on the button
 * @param options.statementId - ID of the statement for the URL
 * @param options.message - Main message to display in the email
 * @param options.title - Title of the email
 * @param options.recipientName - Name of the email recipient
 * @returns HTML string for email body
 */
export function createStatementEmailTemplate({
	buttonText = 'View Statement',
	statementId,
	message,
	title = 'You have a new statement from Freedi',
	recipientName,
}: {
	buttonText?: string;
	statementId: string;
	message: string;
	title?: string;
	recipientName?: string;
}): string {
	try {
		const statementUrl = `${getBaseUrl()}/statement/${statementId}`;

		return createBaseEmailTemplate({
			title,
			message,
			buttonText,
			buttonUrl: statementUrl,
			recipientName,
		});
	} catch (error) {
		logger.error('Error creating statement email template:', error);
		const baseUrl = getBaseUrl();

		return `<p>${message}</p><p>View statement: <a href="${baseUrl}/statement/${statementId}">${baseUrl}/statement/${statementId}</a></p>`;
	}
}

/**
 * Creates an email template for a new reply notification
 * @param options - Configuration options for the reply notification
 * @returns HTML string for email body
 */
export function createReplyNotificationEmail({
	statementId,
	replyText,
	replierName = 'Anonymous',
	recipientName,
}: {
	statementId: string;
	replyText: string;
	replierName?: string;
	recipientName?: string;
}): string {
	try {
		// Limit reply text to avoid very long emails
		const limitedReplyText =
			replyText.length > 150 ? `${replyText.substring(0, 150)}...` : replyText;

		const message = `<strong>${replierName}</strong> has replied to your statement:<br>
      <blockquote style="margin: 10px 0; padding: 10px; background-color: #f0f4f8; border-left: 4px solid #1f5895; font-style: italic;">
        "${limitedReplyText}"
      </blockquote>`;

		return createStatementEmailTemplate({
			statementId,
			message,
			title: `New reply from ${replierName}`,
			buttonText: 'View Reply',
			recipientName,
		});
	} catch (error) {
		logger.error('Error creating reply notification email:', error);

		return createStatementEmailTemplate({
			statementId,
			message: `${replierName} has replied to your statement: "${replyText.substring(0, 100)}${replyText.length > 100 ? '...' : ''}"`,
			buttonText: 'View Reply',
		});
	}
}

/**
 * Creates an email template for a statement invitation
 * @param options - Configuration options for the invitation
 * @returns HTML string for email body
 */
export function createInvitationEmail({
	statementId,
	inviterName = 'Someone',
	statementTitle,
	message,
	recipientName,
}: {
	statementId: string;
	inviterName?: string;
	statementTitle?: string;
	message?: string;
	recipientName?: string;
}): string {
	const defaultMessage = statementTitle
		? `${inviterName} has invited you to participate in a discussion titled "${statementTitle}".`
		: `${inviterName} has invited you to participate in a discussion on Freedi.`;

	return createStatementEmailTemplate({
		statementId,
		message: message || defaultMessage,
		title: "You've been invited to join a discussion",
		buttonText: 'Join Discussion',
		recipientName,
	});
}

/**
 * Creates an email template for updates to a statement (e.g., consensus reached)
 * @param options - Configuration options for the update notification
 * @returns HTML string for email body
 */
export function createStatementUpdateEmail({
	statementId,
	updateType = 'general',
	statementTitle,
	recipientName,
	customMessage,
}: {
	statementId: string;
	updateType?: 'consensus' | 'deadline' | 'general';
	statementTitle?: string;
	recipientName?: string;
	customMessage?: string;
}): string {
	let title = 'Update on your Freedi statement';
	let buttonText = 'View Details';
	let message: string;

	if (customMessage) {
		message = customMessage;
	} else {
		switch (updateType) {
			case 'consensus':
				message = `Consensus has been reached ${statementTitle ? `on "${statementTitle}"` : 'on your statement'}.`;
				title = 'Consensus Reached';
				buttonText = 'View Results';
				break;
			case 'deadline':
				message = `A deadline is approaching ${statementTitle ? `for "${statementTitle}"` : 'for your statement'}.`;
				title = 'Deadline Approaching';
				buttonText = 'View Statement';
				break;
			default:
				message = `There has been an update ${statementTitle ? `to "${statementTitle}"` : 'to your statement'}.`;
				break;
		}
	}

	return createStatementEmailTemplate({
		statementId,
		message,
		title,
		buttonText,
		recipientName,
	});
}

/**
 * Creates an email template for mass consensus notification
 * Sent by admin to email subscribers from statement settings
 * @param options - Configuration options for the notification
 * @returns HTML string for email body
 */
export function createMassConsensusNotificationEmail({
	statementId,
	statementTitle,
	message,
	buttonText = 'View Discussion',
	buttonUrl,
	recipientName,
}: {
	statementId: string;
	statementTitle?: string;
	message: string;
	buttonText?: string;
	buttonUrl?: string;
	recipientName?: string;
}): string {
	try {
		const baseUrl = getBaseUrl();
		const finalButtonUrl = buttonUrl || `${baseUrl}/statement/${statementId}`;
		const title = statementTitle ? `Update: ${statementTitle}` : 'Update from Freedi';

		// Format message - convert newlines to <br> for HTML
		const formattedMessage = message.replace(/\n/g, '<br>');

		return createBaseEmailTemplate({
			title,
			message: formattedMessage,
			buttonText,
			buttonUrl: finalButtonUrl,
			recipientName,
			showButtonLink: true,
		});
	} catch (error) {
		logger.error('Error creating mass consensus notification email:', error);
		const baseUrl = getBaseUrl();

		return `<p>${message}</p><p><a href="${baseUrl}/statement/${statementId}">View Discussion</a></p>`;
	}
}

// Helper function exported for use in fn_emailNotifications
function getBaseUrl(): string {
	const currentDomain = process.env.DOMAIN || process.env.FUNCTION_TARGET;

	switch (currentDomain) {
		case 'freedi.tech':
			return 'https://freedi.tech';
		case 'freedi-test.web.app':
			return 'https://freedi-test.web.app';
		case 'localhost':
			return 'http://localhost:5173';
		default:
			return 'https://freedi.tech';
	}
}
