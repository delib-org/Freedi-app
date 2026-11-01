import {
	onDocumentUpdated,
	onDocumentCreated,
	onDocumentWritten,
	onDocumentDeleted,
} from 'firebase-functions/v2/firestore';
import type { MemoryOption } from 'firebase-functions/v2';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './errorHandling';

/**
 * Memory for the hot Firestore triggers. Production showed "Memory limit of
 * 256 MiB exceeded" on these (newEvaluation ~14% of runs overnight), because
 * every instance loads the whole eagerly-imported functions bundle.
 * Applied per function - the global default is intentionally left alone.
 */
export const HOT_TRIGGER_MEMORY: MemoryOption = '512MiB';

/** Optional per-function runtime options for a Firestore trigger. */
export interface FirestoreFunctionOptions {
	memory?: MemoryOption;
}

export const getTimestamp = (): string => {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	const ms = String(now.getMilliseconds()).padStart(3, '0');

	return `${hours}:${minutes}:${seconds}.${ms}`;
};

/**
 * Creates a wrapper for Firestore triggers with standardized error handling.
 *
 * Note: Firebase trigger types (onDocumentCreated, onDocumentUpdated, onDocumentWritten,
 * onDocumentDeleted) have different event structures and incompatible generic parameters.
 * The callback's event type is preserved through the generic T, but we use a broad
 * function type for triggerType because the Firebase SDK types can't be unified.
 *
 * @param path - Document path pattern (e.g., '/statements/{statementId}')
 * @param triggerType - Firebase trigger function (onDocumentCreated, etc.)
 * @param callback - Handler function that receives the typed event
 * @param functionName - Name for logging purposes
 * @param options - Optional runtime options (e.g. memory); omitted keeps the defaults
 * @returns Configured Firebase Cloud Function
 */
export function createFirestoreFunction<T>(
	path: string,
	triggerType:
		| typeof onDocumentCreated
		| typeof onDocumentUpdated
		| typeof onDocumentWritten
		| typeof onDocumentDeleted,
	callback: (event: T) => Promise<unknown>,
	functionName: string,
	options: FirestoreFunctionOptions = {},
): ReturnType<typeof onDocumentCreated> {
	// Cast to unknown first, then to a compatible function signature
	// This is required because Firebase's trigger types have incompatible generic structures
	const trigger = triggerType as unknown as (
		opts: { document: string; memory?: MemoryOption } & typeof functionConfig,
		handler: (event: T) => Promise<void>,
	) => ReturnType<typeof onDocumentCreated>;

	return trigger(
		{
			document: path,
			...functionConfig,
			...(options.memory ? { memory: options.memory } : {}),
		},
		async (event: T) => {
			const startTime = Date.now();
			const startTimestamp = getTimestamp();
			console.info(`[${startTimestamp}] ▶ Starting ${functionName}`);

			try {
				await callback(event);
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				console.info(`[${endTimestamp}] ✓ Completed ${functionName} in ${duration}ms`);
			} catch (error) {
				const duration = Date.now() - startTime;
				const endTimestamp = getTimestamp();
				logError(error, {
					operation: `firestoreTrigger.${functionName}`,
					metadata: { duration, endTimestamp, path },
				});
				throw error;
			}
		},
	);
}
