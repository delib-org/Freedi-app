/**
 * Hybrid Text + Rating Clustering
 *
 * Combines text embeddings (1536-dim) with evaluation statistics (8-dim)
 * into a 1544-dim hybrid vector, then clusters using k-means.
 * Includes post-clustering negation detection via Gemini.
 *
 * Runs as a scheduled function every 15 minutes, processing statements
 * marked as stale. Only active when enableHybridClustering is set on
 * the parent question (inherits down, can be overridden off per sub-question).
 */

import {
	Collections,
	getRandomUID,
	Statement,
	StatementSchema,
	StatementType,
} from '@freedi/shared-types';
import type { Framing, FramingSnapshot, ClusterSnapshot } from '@freedi/shared-types';
import { logger } from 'firebase-functions';
import { Request, Response } from 'express';
import { parse } from 'valibot';
import { db } from '.';
import { logError } from './utils/errorHandling';
import { getGeminiModel } from './config/gemini';
import {
	computeRatingVector,
	computeHybridVector,
	isHybridClusteringEnabled,
	saveHybridEmbedding,
	extractEmbeddingArray,
} from './services/hybrid-vector-service';
import {
	kmeans,
	selectOptimalK,
	assignToNearestCentroid,
	type VectorWithId,
} from './services/kmeans-service';
import {
	detectNegationPairs,
	splitNegationPairs,
	type StatementForNegation,
} from './services/negation-detection-service';

// Collection names for framings (same as fn_multiFramingClusters)
const FRAMING_COLLECTIONS = {
	framings: 'framings',
	framingSnapshots: 'framingSnapshots',
} as const;

// Limits for the scheduled sweep
const MAX_PARENTS_PER_SWEEP = 20;
const MAX_STALE_STATEMENTS_QUERY = 500;
const MIN_OPTIONS_FOR_CLUSTERING = 10;
const MAX_OPTIONS_FOR_FULL_KMEANS = 5000;

interface HybridClusteringResult {
	parentId: string;
	optionsProcessed: number;
	clustersCreated: number;
	negationPairsDetected: number;
	framingId: string | null;
	durationMs: number;
}

/**
 * Main clustering logic for a single parent question.
 */
export async function performHybridClustering(
	parentId: string,
): Promise<HybridClusteringResult> {
	const startTime = Date.now();

	// Fetch the parent statement to check settings
	const parentDoc = await db.collection(Collections.statements).doc(parentId).get();
	if (!parentDoc.exists) {
		throw new Error(`Parent statement ${parentId} not found`);
	}
	const parentStatement = parentDoc.data() as Statement;

	// Fetch top parent for setting inheritance
	let topParentStatement: Statement | undefined;
	if (parentStatement.topParentId && parentStatement.topParentId !== parentId) {
		const topDoc = await db
			.collection(Collections.statements)
			.doc(parentStatement.topParentId)
			.get();
		if (topDoc.exists) {
			topParentStatement = topDoc.data() as Statement;
		}
	}

	// Check if hybrid clustering is enabled
	if (!isHybridClusteringEnabled(parentStatement, topParentStatement)) {
		// Clear stale flags but don't process
		await clearStaleFlags(parentId);

		return {
			parentId,
			optionsProcessed: 0,
			clustersCreated: 0,
			negationPairsDetected: 0,
			framingId: null,
			durationMs: Date.now() - startTime,
		};
	}

	// Fetch all non-hidden options under this parent
	const optionsSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.get();

	const options: Statement[] = [];
	for (const doc of optionsSnapshot.docs) {
		try {
			const stmt = parse(StatementSchema, doc.data()) as Statement;
			if (stmt.hide === true || stmt.isCluster === true) continue;
			options.push(stmt);
		} catch {
			// Skip invalid statements
			continue;
		}
	}

	if (options.length === 0) {
		await clearStaleFlags(parentId);

		return {
			parentId,
			optionsProcessed: 0,
			clustersCreated: 0,
			negationPairsDetected: 0,
			framingId: null,
			durationMs: Date.now() - startTime,
		};
	}

	// Compute max evaluators across all siblings (for density normalization)
	const maxEvaluators = Math.max(
		...options.map((o) => o.evaluation?.numberOfEvaluators ?? 0),
		1,
	);

	// Build hybrid vectors for all options
	const vectors: VectorWithId[] = [];
	const vectorMap = new Map<string, number[]>();
	const statementsMap = new Map<string, Statement>();

	for (const option of options) {
		const textEmbedding = extractEmbeddingArray(
			(option as Record<string, unknown>).embedding,
		);
		if (!textEmbedding || textEmbedding.length === 0) continue;

		const ratingVec = computeRatingVector(option.evaluation, maxEvaluators);
		const hybridVec = computeHybridVector(textEmbedding, ratingVec, option.evaluation?.numberOfEvaluators ?? 0);

		vectors.push({ id: option.statementId, vector: hybridVec });
		vectorMap.set(option.statementId, hybridVec);
		statementsMap.set(option.statementId, option);

		// Save hybrid embedding
		await saveHybridEmbedding(option.statementId, hybridVec);
	}

	// Not enough options with embeddings for clustering
	if (vectors.length < MIN_OPTIONS_FOR_CLUSTERING) {
		await clearStaleFlags(parentId);

		return {
			parentId,
			optionsProcessed: vectors.length,
			clustersCreated: 0,
			negationPairsDetected: 0,
			framingId: null,
			durationMs: Date.now() - startTime,
		};
	}

	// K-means clustering
	let clusteringVectors = vectors;
	let isSampled = false;

	if (vectors.length > MAX_OPTIONS_FOR_FULL_KMEANS) {
		// Sample for k-means, assign rest via nearest centroid
		clusteringVectors = sampleVectors(vectors, MAX_OPTIONS_FOR_FULL_KMEANS);
		isSampled = true;
	}

	const k = selectOptimalK(clusteringVectors);
	const kmeansResult = kmeans(clusteringVectors, k);

	// Build assignment map
	const assignments = new Map<string, number>();
	for (const cluster of kmeansResult.clusters) {
		const clusterIdx = kmeansResult.clusters.indexOf(cluster);
		for (const memberId of cluster.memberIds) {
			assignments.set(memberId, clusterIdx);
		}
	}

	// Assign remaining vectors (if sampled)
	if (isSampled) {
		const centroids = kmeansResult.clusters.map((c) => c.centroid);
		for (const vec of vectors) {
			if (!assignments.has(vec.id)) {
				assignments.set(vec.id, assignToNearestCentroid(vec.vector, centroids));
			}
		}
	}

	// Negation detection
	let negationPairsDetected = 0;
	const centroids = kmeansResult.clusters.map((c) => c.centroid);

	// Group members by cluster for negation detection
	const clusterGroups = new Map<number, StatementForNegation[]>();
	for (const [stmtId, clusterIdx] of assignments) {
		const stmt = statementsMap.get(stmtId);
		const textEmbed = extractEmbeddingArray(
			(stmt as unknown as Record<string, unknown>)?.embedding,
		);
		if (!stmt || !textEmbed) continue;

		if (!clusterGroups.has(clusterIdx)) {
			clusterGroups.set(clusterIdx, []);
		}
		clusterGroups.get(clusterIdx)!.push({
			statementId: stmtId,
			statement: stmt.statement,
			embedding: textEmbed,
			clusterId: String(clusterIdx),
		});
	}

	// Detect negation pairs in each cluster
	const allNegationPairs = [];
	for (const [, members] of clusterGroups) {
		if (members.length < 2) continue;
		const pairs = await detectNegationPairs(members);
		allNegationPairs.push(...pairs);
	}
	negationPairsDetected = allNegationPairs.length;

	// Apply negation splits
	let finalAssignments = assignments;

	if (allNegationPairs.length > 0) {
		const splitResult = splitNegationPairs(
			assignments,
			centroids,
			allNegationPairs,
			vectorMap,
		);
		finalAssignments = splitResult.assignments;
	}

	// Build cluster groups from final assignments
	const finalClusters = new Map<number, string[]>();
	for (const [stmtId, clusterIdx] of finalAssignments) {
		if (!finalClusters.has(clusterIdx)) {
			finalClusters.set(clusterIdx, []);
		}
		finalClusters.get(clusterIdx)!.push(stmtId);
	}

	// Name clusters using Gemini
	const clusterNames = await nameCluster(finalClusters, statementsMap, parentStatement);

	// Upsert the hybrid-auto framing
	const framingId = await upsertHybridFraming(
		parentStatement,
		finalClusters,
		clusterNames,
		statementsMap,
	);

	const duration = Date.now() - startTime;
	logger.info('Hybrid clustering complete', {
		parentId,
		optionsProcessed: vectors.length,
		clustersCreated: finalClusters.size,
		negationPairsDetected,
		framingId,
		durationMs: duration,
	});

	return {
		parentId,
		optionsProcessed: vectors.length,
		clustersCreated: finalClusters.size,
		negationPairsDetected,
		framingId,
		durationMs: duration,
	};
}

/**
 * Scheduled sweep: find stale statements and re-cluster their parent questions.
 */
export async function hybridClusteringSweep(): Promise<void> {
	const startTime = Date.now();

	try {
		// Query stale statements
		const staleSnapshot = await db
			.collection(Collections.statements)
			.where('hybridEmbeddingStale', '==', true)
			.limit(MAX_STALE_STATEMENTS_QUERY)
			.get();

		if (staleSnapshot.empty) {
			logger.info('Hybrid clustering sweep: no stale statements found');

			return;
		}

		// Group by parentId
		const parentIds = new Set<string>();
		for (const doc of staleSnapshot.docs) {
			const data = doc.data();
			if (data.parentId) {
				parentIds.add(data.parentId);
			}
		}

		logger.info(`Hybrid clustering sweep: ${parentIds.size} parents to process from ${staleSnapshot.size} stale statements`);

		// Process each parent (up to limit)
		let processed = 0;
		const results: HybridClusteringResult[] = [];

		for (const parentId of parentIds) {
			if (processed >= MAX_PARENTS_PER_SWEEP) break;

			try {
				const result = await performHybridClustering(parentId);
				results.push(result);
				processed++;
			} catch (error) {
				logError(error, {
					operation: 'hybridClustering.sweep.processParent',
					metadata: { parentId },
				});
			}
		}

		const duration = Date.now() - startTime;
		const totalOptions = results.reduce((sum, r) => sum + r.optionsProcessed, 0);
		const totalClusters = results.reduce((sum, r) => sum + r.clustersCreated, 0);
		const totalNegations = results.reduce((sum, r) => sum + r.negationPairsDetected, 0);

		logger.info('Hybrid clustering sweep complete', {
			parentsProcessed: processed,
			totalOptions,
			totalClusters,
			totalNegations,
			durationMs: duration,
		});
	} catch (error) {
		logError(error, { operation: 'hybridClustering.sweep' });
	}
}

/**
 * HTTP endpoint for manually triggering hybrid clustering on a specific question.
 */
export async function triggerHybridClustering(
	req: Request,
	res: Response,
): Promise<void> {
	try {
		const { parentStatementId } = req.body;

		if (!parentStatementId || typeof parentStatementId !== 'string') {
			res.status(400).send({
				error: 'Invalid input: parentStatementId is required',
				ok: false,
			});

			return;
		}

		const result = await performHybridClustering(parentStatementId);
		res.status(200).send({ ...result, ok: true });
	} catch (error) {
		logError(error, { operation: 'hybridClustering.trigger' });
		res.status(500).send({
			error: error instanceof Error ? error.message : 'Unknown server error',
			ok: false,
		});
	}
}

// --- Helper functions ---

/**
 * Clear stale flags for all options under a parent without reprocessing.
 */
async function clearStaleFlags(parentId: string): Promise<void> {
	const staleSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('hybridEmbeddingStale', '==', true)
		.get();

	if (staleSnapshot.empty) return;

	const batchSize = 500;
	for (let i = 0; i < staleSnapshot.docs.length; i += batchSize) {
		const batch = db.batch();
		const slice = staleSnapshot.docs.slice(i, i + batchSize);
		for (const doc of slice) {
			batch.update(doc.ref, { hybridEmbeddingStale: false });
		}
		await batch.commit();
	}
}

/**
 * Randomly sample N vectors from a larger set.
 */
function sampleVectors(vectors: VectorWithId[], n: number): VectorWithId[] {
	const shuffled = [...vectors];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}

	return shuffled.slice(0, n);
}

/**
 * Use Gemini to name clusters based on their member statements.
 */
async function nameCluster(
	clusters: Map<number, string[]>,
	statementsMap: Map<string, Statement>,
	parentStatement: Statement,
): Promise<Map<number, string>> {
	const names = new Map<number, string>();

	try {
		const model = getGeminiModel();

		// Build cluster descriptions for Gemini
		const clusterDescriptions: string[] = [];
		const clusterIndices: number[] = [];

		for (const [idx, memberIds] of clusters) {
			const memberTexts = memberIds
				.slice(0, 10) // Limit to 10 examples per cluster
				.map((id) => statementsMap.get(id)?.statement)
				.filter(Boolean);

			if (memberTexts.length === 0) continue;

			clusterDescriptions.push(
				`Cluster ${idx + 1} (${memberIds.length} members):\n${memberTexts.map((t) => `- ${t}`).join('\n')}`,
			);
			clusterIndices.push(idx);
		}

		if (clusterDescriptions.length === 0) return names;

		const prompt = `Given the following clusters of proposals under the topic "${parentStatement.statement}", provide a short descriptive name (2-5 words) for each cluster. Use the primary language of the statements.

${clusterDescriptions.join('\n\n')}

Return ONLY a JSON array with no markdown formatting:
[{"clusterIndex": 1, "name": "Short descriptive name"}, ...]`;

		const response = await model.generateContent(prompt);
		const text = response.response.text();

		let jsonString = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
		const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
		if (jsonMatch) jsonString = jsonMatch[0];

		const results: Array<{ clusterIndex: number; name: string }> = JSON.parse(jsonString);

		for (const result of results) {
			const idx = clusterIndices[result.clusterIndex - 1];
			if (idx !== undefined) {
				names.set(idx, result.name);
			}
		}
	} catch (error) {
		logError(error, { operation: 'hybridClustering.nameCluster' });
		// Fall back to generic names
		for (const [idx] of clusters) {
			names.set(idx, `Cluster ${idx + 1}`);
		}
	}

	return names;
}

/**
 * Upsert the hybrid-auto framing: find existing or create new, update cluster statements.
 */
async function upsertHybridFraming(
	parentStatement: Statement,
	clusters: Map<number, string[]>,
	clusterNames: Map<number, string>,
	statementsMap: Map<string, Statement>,
): Promise<string> {
	const parentId = parentStatement.statementId;

	// Find existing hybrid-auto framing
	const existingFramings = await db
		.collection(FRAMING_COLLECTIONS.framings)
		.where('parentStatementId', '==', parentId)
		.where('createdBy', '==', 'hybrid-auto')
		.limit(1)
		.get();

	let framingId: string;
	let isUpdate = false;

	if (!existingFramings.empty) {
		// Update existing framing
		framingId = existingFramings.docs[0].id;
		isUpdate = true;

		// Delete old cluster statements
		const oldFraming = existingFramings.docs[0].data() as Framing;
		const deleteBatch = db.batch();
		for (const oldClusterId of oldFraming.clusterIds) {
			deleteBatch.delete(db.collection(Collections.statements).doc(oldClusterId));
		}

		// Remove old framingClusters references from options
		const optionsWithOldFraming = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentId)
			.get();

		for (const doc of optionsWithOldFraming.docs) {
			const data = doc.data();
			if (data.framingClusters?.[framingId]) {
				deleteBatch.update(doc.ref, {
					[`framingClusters.${framingId}`]: null, // Remove old mapping
				});
			}
		}

		await deleteBatch.commit();
	} else {
		framingId = getRandomUID();
	}

	// Create new cluster statements and assign options
	const clusterIds: string[] = [];
	const clusterSnapshots: ClusterSnapshot[] = [];
	const writeBatch = db.batch();

	for (const [clusterIdx, memberIds] of clusters) {
		const clusterId = getRandomUID();
		clusterIds.push(clusterId);

		const clusterName = clusterNames.get(clusterIdx) || `Cluster ${clusterIdx + 1}`;

		// Create cluster statement
		const clusterStatement: Record<string, unknown> = {
			statement: clusterName,
			isCluster: true,
			statementId: clusterId,
			parentId: parentStatement.statementId,
			parents: [...(parentStatement.parents || []), parentStatement.statementId],
			topParentId: parentStatement.topParentId,
			statementType: StatementType.option,
			createdAt: Date.now(),
			creator: parentStatement.creator,
			creatorId: parentStatement.creatorId,
			consensus: 0,
			randomSeed: Math.random(),
			lastUpdate: Date.now(),
			framingId,
		};

		writeBatch.set(
			db.collection(Collections.statements).doc(clusterId),
			clusterStatement,
		);

		// Collect snapshot data
		clusterSnapshots.push({
			clusterId,
			clusterName,
			optionIds: memberIds,
		});

		// Map options to this cluster
		for (const memberId of memberIds) {
			writeBatch.update(
				db.collection(Collections.statements).doc(memberId),
				{
					[`framingClusters.${framingId}`]: clusterId,
					lastUpdate: Date.now(),
				},
			);
		}
	}

	await writeBatch.commit();

	// Create/update framing document
	const framing: Framing = {
		framingId,
		parentStatementId: parentId,
		name: 'Data-Driven Grouping',
		description: 'Automatic clustering based on text similarity and community evaluation patterns',
		createdAt: isUpdate ? (existingFramings.docs[0].data() as Framing).createdAt : Date.now(),
		createdBy: 'hybrid-auto' as Framing['createdBy'],
		isActive: true,
		clusterIds,
		order: isUpdate ? (existingFramings.docs[0].data() as Framing).order : 99, // High order to show last
	};

	await db.collection(FRAMING_COLLECTIONS.framings).doc(framingId).set(framing);

	// Save snapshot
	const snapshot: FramingSnapshot = {
		snapshotId: getRandomUID(),
		framingId,
		parentStatementId: parentId,
		clusters: clusterSnapshots,
		createdAt: Date.now(),
	};

	await db
		.collection(FRAMING_COLLECTIONS.framingSnapshots)
		.doc(snapshot.snapshotId)
		.set(snapshot);

	logger.info(`${isUpdate ? 'Updated' : 'Created'} hybrid-auto framing ${framingId}`, {
		parentId,
		clusterCount: clusterIds.length,
	});

	return framingId;
}
