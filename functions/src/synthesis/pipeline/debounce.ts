import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * How long one spawn blocks the next spawn of the SAME PAIR.
 *
 * The window only needs to cover the gap between a spawn committing and the new
 * cluster becoming visible to vector search — after that, Pass 1/2 attach handles
 * further near-duplicates on its own, which is the outcome the debounce exists to
 * produce.
 *
 * Measured on the 100-statement accuracy benchmark (one statement every ~7s): with
 * the lock keyed on the PARENT, 45 spawn opportunities produced only 24 spawns and
 * 21 debounces, capping pair recall at 40% even though every pair was well inside
 * the attach band — spawning a transport pair was blocking an unrelated housing
 * pair. Shortening the window to 1.5s took the benchmark score 0.442 → 0.546 and
 * dropped debounces to zero, which confirmed the window was the binding constraint.
 * Keying per pair (below) removes the constraint outright, so the window can stay
 * long enough to actually cover vector-search visibility.
 *
 * Overridable so the window can be tuned per environment without a code change.
 */
const SPAWN_DEBOUNCE_MS = Number(process.env.SYNTHESIS_SPAWN_DEBOUNCE_MS ?? 15_000);
const DEBOUNCE_COLLECTION = '_liveSynthDebounce';

/**
 * Debounce key: the parent plus the UNORDERED pair of statement ids.
 *
 * Scoping the lock to the pair preserves the race the debounce was written for —
 * two triggers racing to spawn the same cluster from the same two options — while
 * letting unrelated pairs under a busy question spawn concurrently. Order-
 * independent, so A→B and B→A hit the same key.
 *
 * Burst protection for *similar but different* pairs is not lost with the narrower
 * key: it is carried by `pairAlreadyClustered` in clusterOps, which refuses a spawn
 * when either member already sits inside a visible cluster.
 */
export function spawnDebounceKey(parentId: string, optionId: string, siblingId: string): string {
	const [a, b] = [optionId, siblingId].sort();

	return `${parentId}__${a}__${b}`;
}

interface DebounceState {
	lastSpawnAt?: number;
}

function db() {
	return getFirestore();
}

/**
 * Per-pair spawn debounce. Returns `false` if a spawn for this key happened
 * within `SPAWN_DEBOUNCE_MS` — caller should skip spawning.
 *
 * Fail-open: if the read fails for any reason we allow the spawn rather
 * than silently dropping work — the audit log records every spawn so
 * accidental duplicates can be reverted manually.
 */
export async function checkAndUpdateSpawnDebounce(debounceKey: string): Promise<boolean> {
	const ref = db().collection(DEBOUNCE_COLLECTION).doc(debounceKey);
	try {
		const snap = await ref.get();
		const state = (snap.exists ? snap.data() : {}) as DebounceState;
		if (state.lastSpawnAt && Date.now() - state.lastSpawnAt < SPAWN_DEBOUNCE_MS) {
			return false;
		}

		return true;
	} catch (error) {
		logger.warn('synthesis.pipeline.debounce: read failed, allowing spawn', {
			debounceKey,
			error: error instanceof Error ? error.message : String(error),
		});

		return true;
	}
}

export async function markSpawnedNow(debounceKey: string): Promise<void> {
	const ref = db().collection(DEBOUNCE_COLLECTION).doc(debounceKey);
	try {
		await ref.set({ debounceKey, lastSpawnAt: Date.now() }, { merge: true });
	} catch (error) {
		logger.warn('synthesis.pipeline.debounce: write failed (non-fatal)', {
			debounceKey,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export const __INTERNAL = { SPAWN_DEBOUNCE_MS, DEBOUNCE_COLLECTION };
