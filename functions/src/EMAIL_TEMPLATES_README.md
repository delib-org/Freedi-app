# Freedi Email Templates

This document explains how to use the email templates for the Freedi application.

## Overview

The email templates system provides a consistent way to send branded HTML emails to users.
All templates include responsive design, proper styling, and a call-to-action button.

## Available Templates

### 1. Basic Statement Template

```typescript
import { createStatementEmailTemplate } from './email-templates';

const emailHtml = createStatementEmailTemplate({
	statementId: 'your-statement-id', // Required
	message: 'Your message content here', // Required
	title: 'Email title here', // Optional, defaults to "You have a new statement from Freedi"
	buttonText: 'Custom Button Text', // Optional, defaults to "View Statement"
	recipientName: 'User Name', // Optional, personalized greeting
});
```

### 2. Reply Notification Template

```typescript
import { createReplyNotificationEmail } from './email-templates';

const emailHtml = createReplyNotificationEmail({
	statementId: 'your-statement-id', // Required
	replyText: 'The text of the reply', // Required
	replierName: 'Name of replier', // Optional, defaults to "Anonymous"
	recipientName: 'Recipient name', // Optional, personalized greeting
});
```

### 3. Invitation Template

```typescript
import { createInvitationEmail } from './email-templates';

const emailHtml = createInvitationEmail({
	statementId: 'your-statement-id', // Required
	inviterName: 'Name of inviter', // Optional, defaults to "Someone"
	statementTitle: 'Title of the statement', // Optional
	message: 'Custom invitation message', // Optional, overrides default message
	recipientName: 'Recipient name', // Optional, personalized greeting
});
```

### 4. Statement Update Template

```typescript
import { createStatementUpdateEmail } from './email-templates';

const emailHtml = createStatementUpdateEmail({
	statementId: 'your-statement-id', // Required
	updateType: 'consensus', // Optional: 'consensus', 'deadline', or 'general' (default)
	statementTitle: 'Title of the statement', // Optional
	customMessage: 'Custom message overriding default messages', // Optional
	recipientName: 'Recipient name', // Optional, personalized greeting
});
```

## Sending Emails

After creating the HTML template, use the `sendEmail` function to send the email:

```typescript
import { sendEmail } from './helpers';

const emailResult = await sendEmail({
	to: 'recipient@example.com',
	subject: 'Email subject',
	body: emailHtml, // The HTML template generated from one of the functions above
});

if (!emailResult.success) {
	logger.error('Error sending email:', emailResult.error);
}
```

## Testing Email Templates

You can use the `testEmailTemplates` function in `email-test.ts` to send test emails with all template types:

```typescript
import { testEmailTemplates } from './email-test';

// Send test emails to a specific address
await testEmailTemplates('test@example.com');
```

## Customization Tips

1. Keep messages concise for better readability
2. Use HTML in the message parameter for formatting (e.g., `<strong>`, `<br>`, etc.)
3. Use appropriate template types for different notification contexts

## Error Handling

All template functions include error handling that will fall back to simple text if HTML generation fails.
