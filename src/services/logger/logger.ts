import * as Sentry from '@sentry/react';

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

interface LogContext {
	userId?: string;
	statementId?: string;
	action?: string;
	metadata?: Record<string, unknown>;
	[key: string]: unknown; // Allow additional properties
}

class Logger {
	// Helper to get dev mode
	// In tests, babel-plugin-transform-vite-meta-env transforms import.meta.env to process.env
	private getIsDevelopment(): boolean {
		return import.meta.env.DEV || false;
	}

	private isDevelopment = this.getIsDevelopment();
	// Set to ERROR to only show errors in both dev and prod
	private logLevel = LogLevel.ERROR;

	private formatMessage(level: string, message: string, context?: LogContext): string {
		const timestamp = new Date().toISOString();
		const contextStr = context ? JSON.stringify(context) : '';

		return `[${timestamp}] [${level}] ${message} ${contextStr}`;
	}

	private sendToMonitoring(level: LogLevel, message: string, error?: Error, context?: LogContext) {
		// Only send to Sentry in production
		if (!this.isDevelopment) {
			if (level >= LogLevel.ERROR) {
				Sentry.captureException(error || new Error(message), {
					level: 'error',
					extra: context as Record<string, unknown>,
				});
			} else if (level === LogLevel.WARN) {
				Sentry.captureMessage(message, 'warning');
			}
		}
	}

	debug(message: string, context?: LogContext) {
		if (this.logLevel <= LogLevel.DEBUG) {
			console.info(this.formatMessage('DEBUG', message, context));
		}
	}

	info(message: string, context?: LogContext) {
		if (this.logLevel <= LogLevel.INFO) {
			console.info(this.formatMessage('INFO', message, context));
		}
	}

	warn(message: string, context?: LogContext) {
		if (this.logLevel <= LogLevel.WARN) {
			// Using console.error as it's allowed by ESLint rules
			console.error(this.formatMessage('WARN', message, context));
			this.sendToMonitoring(LogLevel.WARN, message, undefined, context);
		}
	}

	error(message: string, error?: Error | unknown, context?: LogContext) {
		// Always log errors regardless of log level
		const errorObj = error instanceof Error ? error : new Error(String(error));
		console.error(this.formatMessage('ERROR', message, context), errorObj);
		this.sendToMonitoring(LogLevel.ERROR, message, errorObj, context);
	}

	// Track specific events (useful for analytics)
	trackEvent(eventName: string, properties?: Record<string, unknown>) {
		// Only log in development mode to avoid console noise
		if (this.isDevelopment) {
			this.debug(`Event: ${eventName}`, { metadata: properties });
		}

		// Future: Send to Firebase Analytics or other analytics service
		// if (window.gtag) {
		//   window.gtag('event', eventName, properties);
		// }
	}

	// Performance tracking
	trackPerformance(metricName: string, value: number, unit: string = 'ms') {
		// Only log in development mode to avoid console noise
		if (this.isDevelopment) {
			this.debug(`Performance: ${metricName}`, {
				metadata: { value, unit },
			});
		}

		// Send performance metrics to Sentry
		if (!this.isDevelopment) {
			Sentry.addBreadcrumb({
				category: 'performance',
				message: metricName,
				level: 'info',
				data: { value, unit },
			});
		}
	}

	// Group related logs together (simulated with formatting)
	group(label: string) {
		if (this.isDevelopment) {
			console.info(`▼ ${label} ────────────────────────────────`);
		}
	}

	groupEnd() {
		if (this.isDevelopment) {
			console.info('▲ ──────────────────────────────────────────');
		}
	}

	// Create a child logger with default context
	createChild(defaultContext: LogContext): Logger {
		const childLogger = Object.create(this);
		const originalMethods = {
			debug: this.debug.bind(this),
			info: this.info.bind(this),
			warn: this.warn.bind(this),
			error: this.error.bind(this),
		};

		childLogger.debug = (message: string, context?: LogContext) => {
			originalMethods.debug(message, { ...defaultContext, ...context });
		};

		childLogger.info = (message: string, context?: LogContext) => {
			originalMethods.info(message, { ...defaultContext, ...context });
		};

		childLogger.warn = (message: string, context?: LogContext) => {
			originalMethods.warn(message, { ...defaultContext, ...context });
		};

		childLogger.error = (message: string, error?: Error | unknown, context?: LogContext) => {
			originalMethods.error(message, error, { ...defaultContext, ...context });
		};

		return childLogger;
	}
}

// Export singleton instance
export const logger = new Logger();

// Export for testing purposes
export { Logger };
