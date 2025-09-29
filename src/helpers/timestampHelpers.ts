/**
 * Convert Firebase Timestamp objects to milliseconds recursively
 * This helper ensures all timestamp fields are numbers for valibot validation
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