/**
 * Check if a value is a Firestore VectorValue (embedding)
 * VectorValue objects have a _values property containing the embedding array
 */
function isVectorValue(value: unknown): boolean {
	if (value == null || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;

	return '_values' in obj && Array.isArray(obj._values);
}

/**
 * Convert Firebase Timestamp objects to milliseconds recursively
 * Also removes non-serializable Firestore types like VectorValue (embeddings)
 * This helper ensures all values are serializable for Redux and valibot validation
 */
export function convertTimestampsToMillis(data: unknown): unknown {
	// Handle null/undefined
	if (data == null) return data;

	// Handle primitive types
	if (typeof data !== 'object') return data;

	// Type guard for object with toMillis method
	const obj = data as Record<string, unknown> & { toMillis?: () => number };

	// Check if the object itself is a Timestamp
	if (obj.toMillis && typeof obj.toMillis === 'function') {
		return obj.toMillis();
	}

	// Handle arrays recursively
	if (Array.isArray(data)) {
		return data.map(item => convertTimestampsToMillis(item));
	}

	// Handle objects recursively
	const result: Record<string, unknown> = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const value = obj[key];

			// Skip VectorValue (embedding) fields - they are non-serializable
			// and only used server-side for similarity search
			if (isVectorValue(value)) {
				continue;
			}

			// Check if value is a Timestamp
			const valueObj = value as Record<string, unknown> & { toMillis?: () => number };
			if (valueObj?.toMillis && typeof valueObj.toMillis === 'function') {
				result[key] = valueObj.toMillis();
			}
			// Recursively handle nested objects and arrays
			else if (value != null && typeof value === 'object') {
				result[key] = convertTimestampsToMillis(value);
			}
			// Copy primitive values as-is
			else {
				result[key] = value;
			}
		}
	}

	return result;
}

/**
 * Preprocess data before valibot parsing
 * Ensures all timestamps are in milliseconds format
 * This is just an alias for convertTimestampsToMillis for backward compatibility
 */
export function preprocessFirestoreData(data: unknown): unknown {
	return convertTimestampsToMillis(data);
}

/**
 * Normalize statement data before valibot parsing
 * - Converts timestamps to milliseconds
 * - Fills in missing topParentId for legacy data
 *
 * This handles old Firestore documents that may not have topParentId set
 */
export function normalizeStatementData(data: unknown): unknown {
	// First convert timestamps
	const converted = convertTimestampsToMillis(data);

	// Handle null/undefined
	if (converted == null || typeof converted !== 'object') return converted;

	const obj = converted as Record<string, unknown>;

	// Fill in missing topParentId for legacy data
	if (obj.statementId && !obj.topParentId) {
		// For top-level statements (where parentId equals statementId or parentId is 'top'),
		// topParentId should equal statementId
		if (obj.parentId === obj.statementId || obj.parentId === 'top' || !obj.parentId) {
			obj.topParentId = obj.statementId;
		} else {
			// For child statements, use parentId as a fallback
			// Note: This may not be accurate for deeply nested statements,
			// but it's better than failing validation
			obj.topParentId = obj.parentId;
			console.info(`[normalizeStatementData] Filled missing topParentId for statement ${obj.statementId} using parentId ${obj.parentId}`);
		}
	}

	return obj;
}