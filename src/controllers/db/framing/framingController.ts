import { getFunctionsUrl, auth } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import type { Framing, ClusterAggregatedEvaluation, Statement } from '@freedi/shared-types';

// ============================================================================
// Admin auth helper — both clustering trigger endpoints below are wrapped with
// wrapAdminHttpFunction on the server, which calls verifyAuthToken() and
// requires a Bearer token in the Authorization header.
// ============================================================================

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
	const idToken = await auth.currentUser?.getIdToken();
	if (!idToken) {
		throw new Error('Not signed in — clustering requires authentication');
	}

	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${idToken}`,
	};
}

/**
 * Parse the body of a clustering trigger response. Reads text first, then
 * tries JSON.parse so it stays safe even if content-type says application/json
 * but the body is a plain-text infrastructure error (e.g., "Internal Server Error").
 */
async function parseClusteringResponse(response: Response): Promise<TriggerClusteringResponse> {
	const text = await response.text();
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		try {
			return JSON.parse(text) as TriggerClusteringResponse;
		} catch {
			// Fall through to plain-text error path
		}
	}
	const snippet = text.slice(0, 200).trim() || `${response.status} ${response.statusText}`;

	return {
		ok: false,
		error: `Server error (${response.status}): ${snippet}. Check Firebase Functions logs for stack trace.`,
	};
}

// ============================================================================
// Types for API responses
// ============================================================================

interface GenerateFramingsResponse {
	framings: Framing[];
	rawResponse?: string;
	ok: boolean;
	error?: string;
}

interface RequestCustomFramingResponse {
	framing: Framing;
	requestId: string;
	ok: boolean;
	error?: string;
}

interface GetFramingsResponse {
	framings: Framing[];
	ok: boolean;
	error?: string;
}

interface ClusterWithOptions {
	cluster: Statement;
	options: Statement[];
	optionCount: number;
}

interface GetFramingClustersResponse {
	framing: Framing;
	clusters: ClusterWithOptions[];
	ok: boolean;
	error?: string;
}

interface GetClusterAggregationsResponse {
	framingId: string;
	aggregations: ClusterAggregatedEvaluation[];
	totalUniqueEvaluators: number;
	ok: boolean;
	error?: string;
}

interface GetFramingAggregationSummaryResponse {
	framingId: string;
	framingName: string;
	clusterCount: number;
	totalUniqueEvaluators: number;
	averageConsensus: number;
	totalOptions: number;
	hasStaleData: boolean;
	ok: boolean;
	error?: string;
}

interface DeleteFramingResponse {
	message: string;
	ok: boolean;
	error?: string;
}

// ============================================================================
// Multi-Framing Functions
// ============================================================================

/**
 * Generate multiple AI framings for a statement
 * @param statementId - The statement to cluster
 * @param maxFramings - Maximum number of framings to generate (default: 3)
 * @returns Array of generated framings
 */
export async function generateMultipleFramings(
	statementId: string,
	maxFramings: number = 3,
): Promise<Framing[]> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(`${baseUrl}/generateMultipleFramings`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ statementId, maxFramings }),
		});

		const data: GenerateFramingsResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to generate framings');
		}

		logger.info('Generated multiple framings', {
			statementId,
			framingCount: data.framings.length,
		});

		return data.framings;
	} catch (error) {
		logError(error, {
			operation: 'framingController.generateMultipleFramings',
			statementId,
			metadata: { maxFramings },
		});
		throw error;
	}
}

/**
 * Request a custom framing with a specific prompt
 * @param statementId - The statement to cluster
 * @param customPrompt - The custom clustering perspective
 * @param userId - The admin user ID
 * @returns The created framing
 */
export async function requestCustomFraming(
	statementId: string,
	customPrompt: string,
	userId: string,
): Promise<Framing> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(`${baseUrl}/requestCustomFraming`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ statementId, customPrompt, userId }),
		});

		const data: RequestCustomFramingResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to create custom framing');
		}

		logger.info('Created custom framing', {
			statementId,
			framingId: data.framing.framingId,
			requestId: data.requestId,
		});

		return data.framing;
	} catch (error) {
		logError(error, {
			operation: 'framingController.requestCustomFraming',
			statementId,
			userId,
			metadata: { customPrompt },
		});
		throw error;
	}
}

/**
 * Get all framings for a statement
 * @param statementId - The statement to get framings for
 * @returns Array of framings
 */
export async function getFramingsForStatement(statementId: string): Promise<Framing[]> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(
			`${baseUrl}/getFramingsForStatement?statementId=${encodeURIComponent(statementId)}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			},
		);

		const data: GetFramingsResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to get framings');
		}

		return data.framings;
	} catch (error) {
		logError(error, {
			operation: 'framingController.getFramingsForStatement',
			statementId,
		});
		throw error;
	}
}

/**
 * Get clusters and options for a specific framing
 * @param framingId - The framing to get clusters for
 * @returns Framing with clusters and their options
 */
export async function getFramingClusters(framingId: string): Promise<GetFramingClustersResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(
			`${baseUrl}/getFramingClusters?framingId=${encodeURIComponent(framingId)}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			},
		);

		const data: GetFramingClustersResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to get framing clusters');
		}

		return data;
	} catch (error) {
		logError(error, {
			operation: 'framingController.getFramingClusters',
			metadata: { framingId },
		});
		throw error;
	}
}

/**
 * Delete a framing and its clusters
 * @param framingId - The framing to delete
 */
export async function deleteFraming(framingId: string): Promise<void> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(`${baseUrl}/deleteFraming`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ framingId }),
		});

		const data: DeleteFramingResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to delete framing');
		}

		logger.info('Deleted framing', { framingId });
	} catch (error) {
		logError(error, {
			operation: 'framingController.deleteFraming',
			metadata: { framingId },
		});
		throw error;
	}
}

// ============================================================================
// Cluster Aggregation Functions
// ============================================================================

/**
 * Get aggregated evaluations for all clusters in a framing
 * Uses cached data when available, recalculates when stale
 * @param framingId - The framing to get aggregations for
 * @param forceRefresh - Force recalculation even if cache is valid
 * @returns Cluster aggregations with total unique evaluators
 */
export async function getClusterAggregations(
	framingId: string,
	forceRefresh: boolean = false,
): Promise<GetClusterAggregationsResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const url = new URL(`${baseUrl}/getClusterAggregations`);
		url.searchParams.set('framingId', framingId);
		if (forceRefresh) {
			url.searchParams.set('forceRefresh', 'true');
		}

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			},
		});

		const data: GetClusterAggregationsResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to get cluster aggregations');
		}

		logger.info('Got cluster aggregations', {
			framingId,
			clusterCount: data.aggregations.length,
			totalUniqueEvaluators: data.totalUniqueEvaluators,
		});

		return data;
	} catch (error) {
		logError(error, {
			operation: 'framingController.getClusterAggregations',
			metadata: { framingId, forceRefresh },
		});
		throw error;
	}
}

/**
 * Recalculate aggregation for a specific cluster
 * @param clusterId - The cluster to recalculate
 * @param framingId - The framing the cluster belongs to
 * @returns Updated cluster aggregation
 */
export async function recalculateClusterAggregation(
	clusterId: string,
	framingId: string,
): Promise<ClusterAggregatedEvaluation> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(`${baseUrl}/recalculateClusterAggregation`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ clusterId, framingId }),
		});

		const data = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to recalculate cluster aggregation');
		}

		logger.info('Recalculated cluster aggregation', {
			clusterId,
			framingId,
			uniqueEvaluators: data.aggregation.uniqueEvaluatorCount,
		});

		return data.aggregation;
	} catch (error) {
		logError(error, {
			operation: 'framingController.recalculateClusterAggregation',
			metadata: { clusterId, framingId },
		});
		throw error;
	}
}

/**
 * Get summary statistics for a framing
 * @param framingId - The framing to get summary for
 * @returns Summary statistics
 */
export async function getFramingAggregationSummary(
	framingId: string,
): Promise<GetFramingAggregationSummaryResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(
			`${baseUrl}/getFramingAggregationSummary?framingId=${encodeURIComponent(framingId)}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			},
		);

		const data: GetFramingAggregationSummaryResponse = await response.json();

		if (!data.ok) {
			throw new Error(data.error || 'Failed to get framing summary');
		}

		return data;
	} catch (error) {
		logError(error, {
			operation: 'framingController.getFramingAggregationSummary',
			metadata: { framingId },
		});
		throw error;
	}
}

// ============================================================================
// Admin-triggered clustering pipelines
// ============================================================================

interface TriggerClusteringResponse {
	ok: boolean;
	error?: string;
	framingId?: string | null;
	clustersCreated?: number;
	optionsProcessed?: number;
	summary?: unknown;
}

/**
 * Run the legacy hybrid k-means clustering on a parent question. Writes to a
 * Framing with createdBy='hybrid-auto'. The 15-min scheduled sweep is disabled,
 * so this is the manual way to refresh the semantic clustering.
 */
export async function triggerSemanticClustering(
	parentStatementId: string,
): Promise<TriggerClusteringResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const headers = await getAdminAuthHeaders();
		const response = await fetch(`${baseUrl}/triggerHybridClustering`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ parentStatementId }),
		});
		const data = await parseClusteringResponse(response);
		if (!data.ok) {
			throw new Error(data.error || 'Failed to run semantic clustering');
		}
		logger.info('Semantic clustering complete', {
			parentStatementId,
			framingId: data.framingId,
			clustersCreated: data.clustersCreated,
		});

		return data;
	} catch (error) {
		logError(error, {
			operation: 'framingController.triggerSemanticClustering',
			statementId: parentStatementId,
		});
		throw error;
	}
}

interface SummarizeClustersResult {
	ok: boolean;
	error?: string;
	summary?: {
		parentId: string;
		framingId: string;
		clustersConsidered: number;
		clustersSummarized: number;
		clustersSkippedNoMembers: number;
		threshold: number;
		durationMs: number;
	};
}

/**
 * Ask an LLM to summarize each cluster of a Framing from its above-threshold
 * members. Writes the 2-3 sentence summary to `cluster.brief`. Default
 * threshold is 0.3; pass opts.threshold to override.
 */
export async function summarizeFramingClusters(
	parentStatementId: string,
	framingId: string,
	opts: { threshold?: number; clusterIds?: string[] } = {},
): Promise<SummarizeClustersResult> {
	try {
		const baseUrl = getFunctionsUrl();
		const headers = await getAdminAuthHeaders();
		const response = await fetch(`${baseUrl}/triggerSummarizeFramingClusters`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ parentId: parentStatementId, framingId, opts }),
		});
		const contentType = response.headers.get('content-type') ?? '';
		const data: SummarizeClustersResult = contentType.includes('application/json')
			? ((await response.json()) as SummarizeClustersResult)
			: {
					ok: false,
					error: `Server error (${response.status}): ${
						(await response.text()).slice(0, 200) || response.statusText
					}. Check Firebase Functions logs.`,
				};
		if (!data.ok) {
			throw new Error(data.error || 'Failed to summarize clusters');
		}
		logger.info('Cluster summarization complete', {
			parentStatementId,
			framingId,
			summarized: data.summary?.clustersSummarized,
		});

		return data;
	} catch (error) {
		logError(error, {
			operation: 'framingController.summarizeFramingClusters',
			statementId: parentStatementId,
			metadata: { framingId },
		});
		throw error;
	}
}

/**
 * Run the new topic-cluster pipeline on a parent question (Sonnet taxonomy +
 * Haiku normalization + UMAP/DBSCAN per category + Haiku naming). Writes to a
 * Framing with createdBy='topic-cluster'. Coexists with the hybrid-auto framing.
 */
export async function triggerTopicClustering(
	parentStatementId: string,
	opts: { dryRun?: boolean; rebuildCache?: boolean; rebuildTaxonomy?: boolean } = {},
): Promise<TriggerClusteringResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const headers = await getAdminAuthHeaders();
		const response = await fetch(`${baseUrl}/triggerTopicClusterPipeline`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ parentStatementId, opts }),
		});
		const data = await parseClusteringResponse(response);
		if (!data.ok) {
			throw new Error(data.error || 'Failed to run topic clustering');
		}
		logger.info('Topic clustering complete', {
			parentStatementId,
			summary: data.summary,
		});

		return data;
	} catch (error) {
		logError(error, {
			operation: 'framingController.triggerTopicClustering',
			statementId: parentStatementId,
		});
		throw error;
	}
}
