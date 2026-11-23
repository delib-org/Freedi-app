import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logError } from '../utils/errorHandling';
import { makeThumbnail } from './makeThumbnail';
import { parseThumbSource } from './thumbnailPaths';
import { resolveStatementImageBucket } from './statementImageBucket';

const ATTACH_RETRIES = 4;
const ATTACH_RETRY_DELAY_MS = 3000;

/**
 * Every statement image upload (main app and MC) gets a small WebP copy that
 * cards load instead of the full photo. The trigger runs where the bucket is
 * (me-central1): Storage events cannot cross regions.
 */
export const onStatementImageUploaded = onObjectFinalized(
	{
		bucket: resolveStatementImageBucket(),
		region: 'me-central1',
		memory: '512MiB',
		timeoutSeconds: 120,
		maxInstances: 10,
	},
	async (event) => {
		const objectName = event.data.name;
		const source = parseThumbSource(objectName);
		if (!source) return;

		try {
			const outcome = await makeThumbnail(objectName, {
				attachRetries: ATTACH_RETRIES,
				retryDelayMs: ATTACH_RETRY_DELAY_MS,
			});
			console.info('[onStatementImageUploaded]', { objectName, outcome });
		} catch (error) {
			logError(error, {
				operation: 'images.onStatementImageUploaded',
				statementId: source.statementId,
				metadata: { objectName, contentType: event.data.contentType },
			});
		}
	},
);
