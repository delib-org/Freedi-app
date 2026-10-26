import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { functionConfig } from '@freedi/shared-types';
import { runClusterReconcile } from './clusterReconcile';
import { logError } from '../utils/errorHandling';

/**
 * Nightly reconciliation of every visible cluster score under recently active
 * questions (see `clusterReconcile.ts`). Ticks every 30 minutes between 01:00
 * and 04:59 Israel time: the first tick of the night starts a pass, later
 * ticks resume it from the saved cursor, and once the pass completes the
 * remaining ticks are a single state read each.
 */
export const fn_nightlyClusterReconcile = onSchedule(
	{
		schedule: '*/30 1-4 * * *',
		timeZone: 'Asia/Jerusalem',
		...functionConfig,
		timeoutSeconds: 540,
		memory: '512MiB',
	},
	async () => {
		try {
			await runClusterReconcile(getFirestore());
		} catch (error) {
			logError(error, { operation: 'condensation.fn_nightlyClusterReconcile' });
		}
	},
);
