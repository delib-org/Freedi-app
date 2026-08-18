import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * How long a spawn under one parent blocks the next spawn under that same parent.
 *
 * The window only needs to cover the gap between a spawn committing and the new
 * cluster becoming visible to vector search — after that, Pass 1/2 attach handles
 * further near-duplicates on its own, which is the outcome the debounce exists to
 * produce. Because the lock is per-PARENT rather than per-cluster, anything longer
 * also blocks spawns of completely unrelated pairs on a busy question.
 *
 * Measured on the 100-statement accuracy benchmark (one statement every ~7s): at
 * 15s, 45 spawn opportunities produced only 24 spawns and 21 debounces, capping
 * pair recall at 40%. Deferring the debounced options to the queue barely helped
 * (+2 pairs) because each retry batch re-armed the window and re-blocked itself.
 *
 * Overridable so the window can be tuned per environment without a code change.
 */
const SPAWN_DEBOUNCE_MS = Number(process.env.SYNTHESIS_SPAWN_DEBOUNCE_MS ?? 15_000);
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
