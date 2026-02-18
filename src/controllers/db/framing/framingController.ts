import { getFunctionsUrl } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import type { Framing, ClusterAggregatedEvaluation, Statement } from '@freedi/shared-types';

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
