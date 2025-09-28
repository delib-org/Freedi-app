/**
 * Convert Firebase Timestamp objects to milliseconds recursively
 * This helper ensures all timestamp fields are numbers for valibot validation
 */
export function convertTimestampsToMillis(data: any): any {
	// Handle null/undefined
	if (data == null) return data;

	// Handle primitive types
	if (typeof data !== 'object') return data;

	// Check if the object itself is a Timestamp
	if (data.toMillis && typeof data.toMillis === 'function') {
		return data.toMillis();
	}

	// Handle arrays recursively
	if (Array.isArray(data)) {
		return data.map(item => convertTimestampsToMillis(item));
	}

	// Handle objects recursively
	const result: any = {};
	for (const key in data) {
		if (data.hasOwnProperty(key)) {
			const value = data[key];

			// Check if value is a Timestamp
			if (value?.toMillis && typeof value.toMillis === 'function') {
				result[key] = value.toMillis();
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
export function preprocessFirestoreData(data: any): any {
	return convertTimestampsToMillis(data);
}