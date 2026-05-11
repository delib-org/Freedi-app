import { createHash } from 'node:crypto';
import {
	Collections,
	ClusteringTaxonomyCache,
	ClusteringNormalizationCache,
} from '@freedi/shared-types';
import { getFirestore } from 'firebase-admin/firestore';
import { PROMPT_VERSION_NORMALIZE, PROMPT_VERSION_TAXONOMY } from './constants';

function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex');
}

export function questionHash(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();

	return sha256(normalized);
}

export function taxonomyCacheId(parentId: string, qHash: string): string {
	return sha256(`${parentId}:${qHash}:${PROMPT_VERSION_TAXONOMY}`);
}

export function normalizationCacheId(statementId: string, lastUpdate: number): string {
	return `${statementId}:${lastUpdate}:${PROMPT_VERSION_NORMALIZE}`;
}

// --------------------------- Taxonomy cache ---------------------------

export async function getTaxonomyCache(
	parentId: string,
	qHash: string,
): Promise<ClusteringTaxonomyCache | null> {
	const id = taxonomyCacheId(parentId, qHash);
	const doc = await getFirestore().collection(Collections.clusteringTaxonomies).doc(id).get();
	if (!doc.exists) return null;

	return doc.data() as ClusteringTaxonomyCache;
}

export async function saveTaxonomyCache(cache: ClusteringTaxonomyCache): Promise<void> {
	await getFirestore().collection(Collections.clusteringTaxonomies).doc(cache.cacheId).set(cache);
}

// ------------------------ Normalization cache ------------------------

export async function getNormalizationCache(
	statementId: string,
	lastUpdate: number,
): Promise<ClusteringNormalizationCache | null> {
	const id = normalizationCacheId(statementId, lastUpdate);
	const doc = await getFirestore().collection(Collections.clusteringNormalizations).doc(id).get();
	if (!doc.exists) return null;

	return doc.data() as ClusteringNormalizationCache;
}

export async function getNormalizationCacheBatch(
	keys: Array<{ statementId: string; lastUpdate: number }>,
): Promise<Map<string, ClusteringNormalizationCache>> {
	const out = new Map<string, ClusteringNormalizationCache>();
	if (keys.length === 0) return out;
	const ids = keys.map((k) => normalizationCacheId(k.statementId, k.lastUpdate));
	// Firestore getAll() supports up to 1500 docs in one round-trip but is rate-limited;
	// we chunk at 300 to stay well under any per-call payload limits.
	const db = getFirestore();
	const CHUNK = 300;
	for (let i = 0; i < ids.length; i += CHUNK) {
		const slice = ids.slice(i, i + CHUNK);
		const refs = slice.map((id) => db.collection(Collections.clusteringNormalizations).doc(id));
		const docs = await db.getAll(...refs);
		for (const doc of docs) {
			if (doc.exists) {
				const data = doc.data() as ClusteringNormalizationCache;
				out.set(data.statementId, data);
			}
		}
	}

	return out;
}

export async function saveNormalizationCache(cache: ClusteringNormalizationCache): Promise<void> {
	await getFirestore()
		.collection(Collections.clusteringNormalizations)
		.doc(cache.cacheId)
		.set(cache);
}
