/**
 * Commits a long list of Firestore writes in batches the server accepts.
 *
 * One new answer in a question with 1,110 subscribers produced 1,116 writes in a
 * single batch, and production refuses more than 500. Each chunk stands alone: a
 * chunk that keeps failing is logged and reported, and the others still land.
 * Callers must use deterministic document ids, so a repeated commit overwrites
 * instead of adding a second copy.
 */
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logError } from '../utils/errorHandling';

/** The most writes Firestore accepts in one batch. */
export const FIRESTORE_BATCH_WRITE_LIMIT = 500;

/** How many times one chunk is tried before it is given up on. */
export const CHUNK_COMMIT_MAX_ATTEMPTS = 3;

/** Wait before the second attempt; doubles for each attempt after it. */
export const CHUNK_COMMIT_RETRY_DELAY_MS = 200;

export interface PendingWrite {
	ref: DocumentReference;
	data: DocumentData;
}

export interface ChunkedWriteResult {
	chunks: number;
	committed: number;
	failed: number;
}

export interface ChunkedWriteContext {
	operation: string;
	statementId?: string;
	parentId?: string;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A WriteBatch can be committed once, so every attempt builds a new one. */
async function commitChunk(db: Firestore, writes: readonly PendingWrite[]): Promise<void> {
	const batch = db.batch();
	writes.forEach(({ ref, data }) => batch.set(ref, data));
	await batch.commit();
}

/** Returns true when the chunk landed, false after every attempt failed. */
async function commitChunkWithRetry(
	db: Firestore,
	writes: readonly PendingWrite[],
	chunkIndex: number,
	context: ChunkedWriteContext,
): Promise<boolean> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= CHUNK_COMMIT_MAX_ATTEMPTS; attempt++) {
		try {
			await commitChunk(db, writes);

			return true;
		} catch (error) {
			lastError = error;
			if (attempt < CHUNK_COMMIT_MAX_ATTEMPTS) {
				await wait(CHUNK_COMMIT_RETRY_DELAY_MS * 2 ** (attempt - 1));
			}
		}
	}

	logError(lastError, {
		operation: context.operation,
		statementId: context.statementId,
		metadata: {
			parentId: context.parentId,
			chunkIndex,
			writesLost: writes.length,
			attempts: CHUNK_COMMIT_MAX_ATTEMPTS,
		},
	});

	return false;
}

/** Commits `writes` chunk by chunk, in order. Never throws for a failed chunk. */
export async function commitWritesInChunks(
	db: Firestore,
	writes: readonly PendingWrite[],
	context: ChunkedWriteContext,
): Promise<ChunkedWriteResult> {
	const result: ChunkedWriteResult = { chunks: 0, committed: 0, failed: 0 };

	for (let start = 0; start < writes.length; start += FIRESTORE_BATCH_WRITE_LIMIT) {
		const chunk = writes.slice(start, start + FIRESTORE_BATCH_WRITE_LIMIT);
		const landed = await commitChunkWithRetry(db, chunk, result.chunks, context);
		result.chunks++;
		if (landed) result.committed += chunk.length;
		else result.failed += chunk.length;
	}

	return result;
}
