import { logger } from 'firebase-functions';
import { getGeminiModel } from '../config/gemini';
import { cosineSimilarity } from './kmeans-service';
import { logError } from '../utils/errorHandling';

// Minimum text cosine similarity to consider a pair for negation check
const HIGH_SIMILARITY_THRESHOLD = 0.85;

// Maximum pairs to send to Gemini per cluster (to limit cost)
const MAX_PAIRS_PER_CLUSTER = 20;

export interface StatementForNegation {
	statementId: string;
	statement: string;
	embedding: number[];
	clusterId: string;
}

export interface NegationPair {
	statementIdA: string;
	statementIdB: string;
	clusterId: string;
	reason: string;
}

interface GeminiNegationResult {
	pairIndex: number;
	isOpposite: boolean;
	reason: string;
}

/**
 * Find high text-similarity pairs within a cluster that may be semantically opposed.
 */
function findHighSimilarityPairs(
	members: StatementForNegation[],
): Array<{ indexA: number; indexB: number; similarity: number }> {
	const pairs: Array<{ indexA: number; indexB: number; similarity: number }> = [];

	for (let i = 0; i < members.length; i++) {
		for (let j = i + 1; j < members.length; j++) {
			const sim = cosineSimilarity(members[i].embedding, members[j].embedding);
			if (sim >= HIGH_SIMILARITY_THRESHOLD) {
				pairs.push({ indexA: i, indexB: j, similarity: sim });
			}
		}
	}

	// Sort by similarity descending, cap at max
	pairs.sort((a, b) => b.similarity - a.similarity);

	return pairs.slice(0, MAX_PAIRS_PER_CLUSTER);
}

/**
 * Ask Gemini to identify which high-similarity pairs express opposite positions.
 *
 * @param members - All members of a cluster with their text and embeddings
 * @returns Array of negation pairs identified by Gemini
 */
export async function detectNegationPairs(
	members: StatementForNegation[],
): Promise<NegationPair[]> {
	if (members.length < 2) return [];

	const highSimPairs = findHighSimilarityPairs(members);
	if (highSimPairs.length === 0) return [];

	const clusterId = members[0].clusterId;

	try {
		const model = getGeminiModel();

		const pairsText = highSimPairs
			.map(
				(p, idx) =>
					`${idx + 1}. A: "${members[p.indexA].statement}"\n   B: "${members[p.indexB].statement}"`,
			)
			.join('\n\n');

		const prompt = `Given the following pairs of statements from the same discussion cluster, identify which pairs express OPPOSITE positions (one supports and one opposes the same idea). Only flag pairs where the meaning is genuinely contradictory, not just different emphasis or nuance.

Pairs:
${pairsText}

Return ONLY a JSON array with no markdown formatting:
[{"pairIndex": 1, "isOpposite": true, "reason": "brief explanation"}, ...]

Include ALL pairs in the response. Set isOpposite to false for pairs that are similar but not contradictory.`;

		const response = await model.generateContent(prompt);
		const text = response.response.text();

		// Parse response - strip markdown code blocks if present
		let jsonString = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

		// Handle case where Gemini wraps in extra text
		const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
		if (jsonMatch) {
			jsonString = jsonMatch[0];
		}

		const results: GeminiNegationResult[] = JSON.parse(jsonString);

		const negationPairs: NegationPair[] = [];
		for (const result of results) {
			if (!result.isOpposite) continue;

			const pairIdx = result.pairIndex - 1; // Convert from 1-indexed
			if (pairIdx < 0 || pairIdx >= highSimPairs.length) continue;

			const pair = highSimPairs[pairIdx];
			negationPairs.push({
				statementIdA: members[pair.indexA].statementId,
				statementIdB: members[pair.indexB].statementId,
				clusterId,
				reason: result.reason || 'Opposite positions detected',
			});
		}

		if (negationPairs.length > 0) {
			logger.info(`Detected ${negationPairs.length} negation pairs in cluster ${clusterId}`);
		}

		return negationPairs;
	} catch (error) {
		logError(error, {
			operation: 'negationDetection.detectNegationPairs',
			metadata: { clusterId, pairCount: highSimPairs.length },
		});

		return [];
	}
}

/**
 * Split negation pairs by moving the minority member to the nearest other cluster.
 *
 * For each negation pair in a cluster:
 * - The member with fewer evaluation supporters stays in the cluster
 * - The other gets reassigned to the nearest other cluster by centroid distance
 * - If no suitable cluster exists, a new cluster is created
 *
 * @param clusterAssignments - Map of statementId → clusterIndex
 * @param centroids - Array of cluster centroids
 * @param negationPairs - Detected negation pairs
 * @param vectors - Map of statementId → vector for distance calculations
 * @returns Updated cluster assignments and centroids (new clusters may be added)
 */
export function splitNegationPairs(
	clusterAssignments: Map<string, number>,
	centroids: number[][],
	negationPairs: NegationPair[],
	vectors: Map<string, number[]>,
): { assignments: Map<string, number>; centroids: number[][] } {
	if (negationPairs.length === 0) {
		return { assignments: clusterAssignments, centroids };
	}

	const assignments = new Map(clusterAssignments);
	const updatedCentroids = [...centroids];

	for (const pair of negationPairs) {
		const currentCluster = assignments.get(pair.statementIdA);
		if (currentCluster === undefined) continue;

		// Move statementB to the nearest *other* cluster
		const vectorB = vectors.get(pair.statementIdB);
		if (!vectorB) continue;

		let bestCluster = -1;
		let bestDist = Infinity;

		for (let i = 0; i < updatedCentroids.length; i++) {
			if (i === currentCluster) continue; // Skip current cluster
			const dist = 1 - cosineSimilarity(vectorB, updatedCentroids[i]);
			if (dist < bestDist) {
				bestDist = dist;
				bestCluster = i;
			}
		}

		if (bestCluster === -1 || bestDist > 0.8) {
			// No suitable cluster found — create a new one with this vector as centroid
			bestCluster = updatedCentroids.length;
			updatedCentroids.push([...vectorB]);
		}

		assignments.set(pair.statementIdB, bestCluster);

		logger.info('Negation split', {
			movedStatement: pair.statementIdB,
			fromCluster: currentCluster,
			toCluster: bestCluster,
			reason: pair.reason,
		});
	}

	return { assignments, centroids: updatedCentroids };
}
