/**
 * The bucket the statement-image trigger listens on.
 *
 * firebase-functions reads it from FIREBASE_CONFIG when the trigger is defined
 * and throws "Missing bucket name" if it is absent, which broke every test that
 * imports the functions index. Resolve it here from the same source so deployed
 * behaviour is unchanged, and fall back to a placeholder where no Firebase
 * config exists (unit tests, tooling that only imports the module).
 */
export const UNCONFIGURED_BUCKET = 'unconfigured-storage-bucket';

interface FirebaseConfigShape {
	storageBucket?: string;
}

export function resolveStatementImageBucket(
	rawConfig: string | undefined = process.env.FIREBASE_CONFIG,
): string {
	if (!rawConfig) return UNCONFIGURED_BUCKET;

	try {
		const parsed: FirebaseConfigShape = JSON.parse(rawConfig);

		return parsed.storageBucket || UNCONFIGURED_BUCKET;
	} catch {
		return UNCONFIGURED_BUCKET;
	}
}
