/**
 * The bucket the statement-image trigger listens on.
 *
 * firebase-functions reads it from FIREBASE_CONFIG when the trigger is defined
 * and throws "Missing bucket name" if it is absent, which broke every test that
 * imports the functions index. Resolve it here from the same source so deployed
 * behaviour is unchanged. Only under tests do we fall back to a placeholder;
 * anywhere else a missing bucket throws, so a deploy or load fails loudly
 * instead of binding the trigger to a bucket that does not exist.
 */
export const TEST_PLACEHOLDER_BUCKET = 'test-storage-bucket';

interface FirebaseConfigShape {
	storageBucket?: string;
}

function isTestRuntime(): boolean {
	return process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
}

export function resolveStatementImageBucket(
	rawConfig: string | undefined = process.env.FIREBASE_CONFIG,
	underTest: boolean = isTestRuntime(),
): string {
	let bucket: string | undefined;

	if (rawConfig) {
		try {
			const parsed: FirebaseConfigShape = JSON.parse(rawConfig);
			bucket = parsed.storageBucket;
		} catch {
			bucket = undefined;
		}
	}

	if (bucket) return bucket;
	if (underTest) return TEST_PLACEHOLDER_BUCKET;

	throw new Error(
		'Missing storage bucket: FIREBASE_CONFIG has no storageBucket, so the statement-image trigger cannot be bound.',
	);
}
