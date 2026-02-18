/**
 * Helper functions for error boundary components
 */

import * as React from 'react';

interface BugReportParams {
	error: Error;
	errorInfo?: React.ErrorInfo | null;
	url: string;
	isDevelopment?: boolean;
}

/**
 * Gets browser and device information for bug reporting
 */
function getBrowserInfo(): string {
	const userAgent = navigator.userAgent;
	const platform = navigator.platform;
	const language = navigator.language;
	const screenResolution = `${window.screen.width}x${window.screen.height}`;
	const viewportSize = `${window.innerWidth}x${window.innerHeight}`;

	return `
Browser Information:
- User Agent: ${userAgent}
- Platform: ${platform}
- Language: ${language}
- Screen Resolution: ${screenResolution}
- Viewport Size: ${viewportSize}
- URL: ${window.location.href}
`.trim();
}

/**
 * Generates a mailto link with pre-filled bug report information
 */
export function generateBugReportEmail(params: BugReportParams): string {
	const { error, errorInfo, url, isDevelopment = false } = params;
	const timestamp = new Date().toISOString();

	// Email components
	const to = 'tal.yaron@gmail.com';
	const subject = `Bug Report: ${error.name || 'Application Error'}`;

	// Build the email body
	let body = `
Error Report
============

Error Message: ${error.message}

URL where error occurred: ${url}

Timestamp: ${timestamp}

${getBrowserInfo()}

Steps to Reproduce:
1. [Please describe what you were doing when the error occurred]
2.
3.

Expected Behavior:
[What should have happened]

Actual Behavior:
[What actually happened]
`;

	// Add stack trace in development mode
	if (isDevelopment && error.stack) {
		body += `

Technical Details (Development Mode)
====================================

Stack Trace:
${error.stack}
`;

		if (errorInfo?.componentStack) {
			body += `

Component Stack:
${errorInfo.componentStack}
`;
		}
	}

	// Encode the components for the mailto link
	const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

	return mailtoLink;
}

/**
 * Checks if an error is related to failed chunk/module loading (stale cache issue)
 */
export function isChunkLoadError(error: Error): boolean {
	const message = error.message.toLowerCase();
	const name = error.name.toLowerCase();

	return (
		message.includes('dynamically imported module') ||
		message.includes('loading chunk') ||
		message.includes('failed to fetch dynamically') ||
		message.includes('loading css chunk') ||
		name.includes('chunkloaderror') ||
		// MIME type error when HTML is served instead of JS
		message.includes('expected a javascript') ||
		message.includes('mime type')
	);
}

/**
 * Handles chunk loading errors by clearing cache and reloading
 */
export function handleChunkLoadError(): void {
	// Clear service worker caches
	if ('caches' in window) {
		caches.keys().then((names) => {
			names.forEach((name) => {
				caches.delete(name);
			});
		});
	}

	// Unregister service workers
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.getRegistrations().then((registrations) => {
			registrations.forEach((registration) => {
				registration.unregister();
			});
		});
	}

	// Store a flag to show a message after reload
	sessionStorage.setItem('app_updated', 'true');

	// Force reload from server (bypass cache)
	window.location.reload();
}

/**
 * Generates a user-friendly error message based on error type
 */
export function getUserFriendlyErrorMessage(error: Error): {
	title: string;
	description: string;
	titleHebrew: string;
	descriptionHebrew: string;
	shouldAutoReload?: boolean;
} {
	// Check for chunk loading errors (stale cache after deployment)
	if (isChunkLoadError(error)) {
		return {
			title: 'App Update Available',
			description: 'A new version is available. The page will reload automatically.',
			titleHebrew: 'עדכון זמין',
			descriptionHebrew: 'גרסה חדשה זמינה. הדף יטען מחדש אוטומטית.',
			shouldAutoReload: true,
		};
	}

	// Check for specific error types
	if (error.message.includes('Network') || error.message.includes('fetch')) {
		return {
			title: 'Connection Problem',
			description:
				"We're having trouble connecting to our servers. Please check your internet connection and try again.",
			titleHebrew: 'בעיית חיבור',
			descriptionHebrew:
				'אנחנו חווים בעיה בחיבור לשרתים שלנו. אנא בדוק את חיבור האינטרנט שלך ונסה שוב.',
		};
	}

	if (error.message.includes('Permission') || error.message.includes('denied')) {
		return {
			title: 'Permission Denied',
			description:
				"You don't have permission to perform this action. Please contact support if you believe this is an error.",
			titleHebrew: 'הרשאה נדחתה',
			descriptionHebrew: 'אין לך הרשאה לבצע פעולה זו. אנא צור קשר עם התמיכה אם אתה מאמין שזו טעות.',
		};
	}

	if (error.message.includes('timeout') || error.message.includes('Timeout')) {
		return {
			title: 'Request Timeout',
			description: 'The operation took too long to complete. Please try again.',
			titleHebrew: 'תם הזמן המוקצב',
			descriptionHebrew: 'הפעולה לקחה יותר מדי זמן. אנא נסה שוב.',
		};
	}

	// Default generic error message
	return {
		title: 'Something went wrong',
		description:
			'We encountered an unexpected error. Our team has been notified and is working on a fix.',
		titleHebrew: 'משהו השתבש',
		descriptionHebrew: 'נתקלנו בשגיאה בלתי צפויה. הצוות שלנו קיבל התראה ועובד על תיקון.',
	};
}

/**
 * Formats error details for display in development mode
 */
export function formatErrorDetails(error: Error, errorInfo?: React.ErrorInfo | null): string {
	let details = `Error: ${error.toString()}\n\n`;

	if (error.stack) {
		details += `Stack Trace:\n${error.stack}\n\n`;
	}

	if (errorInfo?.componentStack) {
		details += `Component Stack:\n${errorInfo.componentStack}`;
	}

	return details;
}
