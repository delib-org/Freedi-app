import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const SPAWN_DEBOUNCE_MS = 15_000;
const DEBOUNCE_COLLECTION = '_liveSynthDebounce';

interface DebounceState {
	lastSpawnAt?: number;
}

function db() {
	return getFirestore();
}

/**
 * Per-parent spawn debounce. Returns `false` if a spawn under this parent
 * happened within `SPAWN_DEBOUNCE_MS` — caller should skip spawning.
 *
 * Prevents bursts of N similar new options from each producing their own
 * 2-member cluster. After the first spawn wins the debounce, subsequent
 * options in the burst fall through to the attach path on the next tick
 * once the spawned cluster exists.
 *
 * Fail-open: if the read fails for any reason we allow the spawn rather
 * than silently dropping work — the audit log records every spawn so
 * accidental duplicates can be reverted manually.
 */
export async function checkAndUpdateSpawnDebounce(parentId: string): Promise<boolean> {
	const ref = db().collection(DEBOUNCE_COLLECTION).doc(parentId);
	try {
		const snap = await ref.get();
		const state = (snap.exists ? snap.data() : {}) as DebounceState;
		if (state.lastSpawnAt && Date.now() - state.lastSpawnAt < SPAWN_DEBOUNCE_MS) {
			return false;
		}

		return true;
	} catch (error) {
		logger.warn('synthesis.pipeline.debounce: read failed, allowing spawn', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});

		return true;
	}
}

export async function markSpawnedNow(parentId: string): Promise<void> {
	const ref = db().collection(DEBOUNCE_COLLECTION).doc(parentId);
	try {
		await ref.set({ parentId, lastSpawnAt: Date.now() }, { merge: true });
	} catch (error) {
		logger.warn('synthesis.pipeline.debounce: write failed (non-fatal)', {
			parentId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export const __INTERNAL = { SPAWN_DEBOUNCE_MS, DEBOUNCE_COLLECTION };
