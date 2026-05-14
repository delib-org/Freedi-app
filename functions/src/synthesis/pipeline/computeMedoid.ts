import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { Collections, type Statement } from '@freedi/shared-types';
import { embeddingCache } from '../../services/embedding-cache-service';

/**
 * Compute the medoid of a cluster — the member whose embedding has the
 * highest mean cosine similarity to all other members. Acts as the
 * "representative" statement for LLM-level comparisons.
 *
 * Returns the medoid Statement, or `null` if the cluster has no resolvable
 * embedded members.
 */

function db() {
	return getFirestore();
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	if (normA === 0 || normB === 0) return 0;

	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function loadMembers(memberIds: string[]): Promise<Statement[]> {
	// Firestore IN-query limit is 30; chunk if needed.
	const chunks: string[][] = [];
	for (let i = 0; i < memberIds.length; i += 30) {
		chunks.push(memberIds.slice(i, i + 30));
	}
	const results: Statement[] = [];
	for (const chunk of chunks) {
		const snap = await db()
			.collection(Collections.statements)
			.where('statementId', 'in', chunk)
			.get();
		for (const doc of snap.docs) results.push(doc.data() as Statement);
	}

	return results;
}

export async function computeMedoid(cluster: Statement): Promise<Statement | null> {
	const memberIds = cluster.integratedOptions ?? [];
	if (memberIds.length === 0) return null;
	if (memberIds.length === 1) {
		const members = await loadMembers(memberIds);

		return members[0] ?? null;
	}

	const [members, embeddingMap] = await Promise.all([
		loadMembers(memberIds),
		embeddingCache.getBatchEmbeddings(memberIds),
	]);

	const embedded = members.filter((m) => embeddingMap.has(m.statementId));
	if (embedded.length === 0) {
		logger.warn('computeMedoid: no embedded members; returning first member as fallback', {
			clusterId: cluster.statementId,
		});

		return members[0] ?? null;
	}
	if (embedded.length === 1) return embedded[0];

	let bestStatement: Statement | null = null;
	let bestScore = -Infinity;
	for (const candidate of embedded) {
		const candEmbedding = embeddingMap.get(candidate.statementId)!;
		let sum = 0;
		let count = 0;
		for (const other of embedded) {
			if (other.statementId === candidate.statementId) continue;
			const otherEmbedding = embeddingMap.get(other.statementId)!;
			sum += cosine(candEmbedding, otherEmbedding);
			count++;
		}
		const meanSim = count > 0 ? sum / count : 0;
		if (meanSim > bestScore) {
			bestScore = meanSim;
			bestStatement = candidate;
		}
	}

	return bestStatement;
}
