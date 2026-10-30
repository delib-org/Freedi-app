import type { DocumentReference, Firestore } from 'firebase-admin/firestore';

/** Firestore refuses a batch of more than this many writes. */
export const BATCH_WRITE_LIMIT = 500;

export type BatchedWrite =
	| { kind: 'update'; ref: DocumentReference; data: Record<string, unknown> }
	| { kind: 'delete'; ref: DocumentReference };

/** Splits `items` into runs of at most `size`. */
export function chunk<T>(items: readonly T[], size: number = BATCH_WRITE_LIMIT): T[][] {
	const runs: T[][] = [];
	for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));

	return runs;
}

/** Commits the writes in order, one batch per `size` (at most BATCH_WRITE_LIMIT). */
export async function commitInBatches(
	firestore: Firestore,
	writes: readonly BatchedWrite[],
	size: number = BATCH_WRITE_LIMIT,
): Promise<void> {
	const perBatch = Math.max(1, Math.min(BATCH_WRITE_LIMIT, Math.floor(size)));
	for (const run of chunk(writes, perBatch)) {
		const batch = firestore.batch();
		run.forEach((w) => {
			if (w.kind === 'delete') batch.delete(w.ref);
			else batch.update(w.ref, w.data);
		});
		await batch.commit();
	}
}
