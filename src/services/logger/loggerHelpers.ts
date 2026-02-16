import { store } from '../../redux/store';
import { logger } from './logger';

// Helper to create a logger with user context
export function createUserLogger() {
	const state = store.getState();
	const user = state.creator.creator; // Access the nested creator object

	if (user) {
		return logger.createChild({
			userId: user.uid,
			metadata: {
				email: user.email,
				displayName: user.displayName,
			},
		});
	}

	return logger;
}

// Helper to log Redux actions (optional - for debugging)
export function logReduxAction(action: { type: string; payload?: unknown }) {
	if (import.meta.env.DEV) {
		logger.debug(`Redux Action: ${action.type}`, {
			action: action.type,
			metadata: { payload: action.payload },
		});
	}
}

// Helper to measure async operation performance
export async function measurePerformance<T>(
	operationName: string,
	operation: () => Promise<T>,
	context?: Record<string, unknown>,
): Promise<T> {
	const startTime = performance.now();
	const userLogger = createUserLogger();

	try {
		userLogger.debug(`Starting ${operationName}`, context);
		const result = await operation();
		const duration = performance.now() - startTime;

		userLogger.trackPerformance(operationName, duration);
		userLogger.debug(`Completed ${operationName}`, {
			...context,
			metadata: { duration },
		});

		return result;
	} catch (error) {
		const duration = performance.now() - startTime;
		userLogger.error(`Failed ${operationName}`, error, {
			...context,
			metadata: { duration },
		});
		throw error;
	}
}
