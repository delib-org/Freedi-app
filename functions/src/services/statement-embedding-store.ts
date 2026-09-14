import {
	getFirestore,
	FieldValue,
	type DocumentData,
	type DocumentReference,
	type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections } from '@freedi/shared-types';

/**
 * Where statement vectors live: `statementEmbeddings/{statementId}`.
 *
 * They used to be fields on the statement doc. Web listeners cannot leave a
 * field out, so every client watching a statement re-downloaded its 1536-float
 * vector (~57 KB on the wire) on every change to it — every vote, every
 * consensus update — and phones spent seconds decoding them. See
 * StatementEmbeddingDoc in shared-types for the doc shape.
 *
 * Until `functions/scripts/migrateStatementEmbeddings.ts` has moved the
 * vectors already stored on statement docs, readers fall back to those legacy
 * fields. Set `EMBEDDING_LEGACY_FALLBACK=off` once the migration has run.
 */

/** Every vector-related field that used to sit on statement docs. */
export const LEGACY_EMBEDDING_FIELDS = [
	'embedding',
	'embeddingModel',
	'embeddingContext',
	'embeddingCreatedAt',
	'embeddingBrief',
	'textHash',
	'hybridEmbedding',
	'hybridEmbeddingStale',
	'hybridEmbeddingUpdatedAt',
] as const;

const VECTOR_FIELDS = new Set<string>(['embedding', 'hybridEmbedding']);

/** Firestore `getAll` is happiest well under its 1000-ref ceiling. */
const GET_ALL_CHUNK = 300;

/** gRPC NOT_FOUND — an update on a doc that does not exist. */
const NOT_FOUND = 5;

function db(): Firestore {
	return getFirestore();
}

export function isLegacyEmbeddingFallbackEnabled(): boolean {
	return process.env.EMBEDDING_LEGACY_FALLBACK !== 'off';
}

export function embeddingDocRef(statementId: string): DocumentReference {
	return db().collection(Collections.statementEmbeddings).doc(statementId);
}

export function embeddingsCollection() {
	return db().collection(Collections.statementEmbeddings);
}

/** A stored vector comes back as a VectorValue; tests and old data use plain arrays. */
export function extractEmbeddingArray(embedding: unknown): number[] | null {
	if (!embedding) return null;

	if (Array.isArray(embedding)) {
		return embedding as number[];
	}

	if (typeof embedding === 'object' && embedding !== null && 'toArray' in embedding) {
		const vectorValue = embedding as { toArray: () => number[] };

		return vectorValue.toArray();
	}

	return null;
}

export function isNotFoundError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code: unknown }).code === NOT_FOUND
	);
}

/** True when a statement doc still carries any of the old vector fields. */
export function hasLegacyEmbeddingFields(data: DocumentData | undefined): boolean {
	if (!data) return false;

	return LEGACY_EMBEDDING_FIELDS.some((field) => data[field] !== undefined);
}

/**
 * The legacy fields of a statement doc, ready to write into its embedding doc
 * (vectors re-wrapped so `findNearest` can index them).
 */
export function legacyFieldsForEmbeddingDoc(data: DocumentData): Record<string, unknown> {
	const moved: Record<string, unknown> = {};
	for (const field of LEGACY_EMBEDDING_FIELDS) {
		const value = data[field];
		if (value === undefined) continue;
		if (VECTOR_FIELDS.has(field)) {
			const vector = extractEmbeddingArray(value);
			if (vector) moved[field] = FieldValue.vector(vector);
		} else {
			moved[field] = value;
		}
	}

	return moved;
}

/** The update that strips the legacy fields off a statement doc. */
export function legacyFieldDeletes(): Record<string, FieldValue> {
	return Object.fromEntries(LEGACY_EMBEDDING_FIELDS.map((field) => [field, FieldValue.delete()]));
}

/** Embedding docs for these statements, keyed by id (missing ids absent). */
export async function loadEmbeddingDocs(
	statementIds: readonly string[],
): Promise<Map<string, DocumentData>> {
	const found = new Map<string, DocumentData>();
	const unique = [...new Set(statementIds)];

	for (let i = 0; i < unique.length; i += GET_ALL_CHUNK) {
		const refs = unique.slice(i, i + GET_ALL_CHUNK).map((id) => embeddingDocRef(id));
		const snaps = await db().getAll(...refs);
		for (const snap of snaps) {
			const data = snap.data();
			if (snap.exists && data) found.set(snap.id, data);
		}
	}

	return found;
}

/**
 * Keep the embedding doc's `parentId` equal to its statement's, so vector
 * search by question finds a statement after it was moved. Called from the
 * statement update trigger; a no-op unless the parent changed.
 */
export async function syncEmbeddingParent(before: unknown, after: unknown): Promise<void> {
	const previous = before as DocumentData | undefined;
	const current = after as DocumentData | undefined;
	const statementId = current?.statementId as string | undefined;
	const newParentId = current?.parentId as string | undefined;
	if (!statementId || !newParentId || previous?.parentId === newParentId) return;

	try {
		await embeddingDocRef(statementId).update({ parentId: newParentId, lastUpdate: Date.now() });
	} catch (error) {
		if (isNotFoundError(error)) return; // nothing embedded yet

		logger.error('statementEmbeddings: parent sync failed', { statementId, newParentId, error });
	}
}

/** Drop the embedding doc of a deleted statement. */
export async function deleteEmbeddingDoc(statementId: string): Promise<void> {
	try {
		await embeddingDocRef(statementId).delete();
	} catch (error) {
		logger.error('statementEmbeddings: delete failed', { statementId, error });
	}
}
