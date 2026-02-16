/**
 * Examples of how to use the logger service throughout the codebase
 */

import { logger } from './logger';
import { createUserLogger, measurePerformance } from './loggerHelpers';

// Example 1: Basic logging
export function basicLoggingExample() {
	logger.debug('This only shows in development');
	logger.info('User clicked button', { action: 'click', metadata: { button: 'submit' } });
	logger.warn('API rate limit approaching', { metadata: { remaining: 10 } });
	logger.error('Failed to save data', new Error('Network error'), {
		statementId: '123',
	});
}

// Example 2: Component logging
export function componentExample() {
	const userLogger = createUserLogger();

	userLogger.info('Component mounted', {
		action: 'mount',
		metadata: { component: 'StatementView' },
	});
}

// Example 3: API call with performance tracking
export async function apiCallExample() {
	return measurePerformance(
		'fetchStatement',
		async () => {
			// Simulate API call
			const response = await fetch('/api/statement/123');

			return response.json();
		},
		{ statementId: '123' },
	);
}

// Example 4: Error handling in try/catch
export async function errorHandlingExample() {
	const userLogger = createUserLogger();

	try {
		// Some operation that might fail
		await riskyOperation();
	} catch (error) {
		userLogger.error('Operation failed', error, {
			action: 'riskyOperation',
			metadata: {
				retryCount: 3,
				lastAttempt: new Date().toISOString(),
			},
		});

		// Re-throw or handle the error
		throw error;
	}
}

// Example 5: Event tracking
export function trackingExample() {
	logger.trackEvent('user_voted', {
		statementId: '123',
		vote: 1,
		timestamp: Date.now(),
	});

	logger.trackEvent('feature_used', {
		feature: 'statement_creation',
		success: true,
	});
}

// Example 6: Grouped logging
export function groupedLoggingExample() {
	logger.group('Statement Creation Process');
	logger.info('Step 1: Validating input');
	logger.info('Step 2: Saving to database');
	logger.info('Step 3: Notifying users');
	logger.groupEnd();
}

// Placeholder for the example
async function riskyOperation() {
	throw new Error('Example error');
}
