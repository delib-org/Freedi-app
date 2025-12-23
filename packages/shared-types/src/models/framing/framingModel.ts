import * as v from "valibot";

/**
 * Who created the framing
 */
export const FramingCreatorType = {
  ai: "ai",
  admin: "admin",
} as const;

export type FramingCreatorType =
  (typeof FramingCreatorType)[keyof typeof FramingCreatorType];

export const FramingCreatorTypeSchema = v.picklist([
  FramingCreatorType.ai,
  FramingCreatorType.admin,
]);

/**
 * Status of a framing request
 */
export const FramingRequestStatus = {
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
} as const;

export type FramingRequestStatus =
  (typeof FramingRequestStatus)[keyof typeof FramingRequestStatus];

export const FramingRequestStatusSchema = v.picklist([
  FramingRequestStatus.pending,
  FramingRequestStatus.processing,
  FramingRequestStatus.completed,
  FramingRequestStatus.failed,
]);

/**
 * Framing - represents a specific way to cluster statements/options
 * Each framing offers a different perspective on how to group the options
 */
export const FramingSchema = v.object({
  framingId: v.string(),
  parentStatementId: v.string(), // The question/topic being clustered
  name: v.string(), // Human-readable name (e.g., "By Theme", "By Impact")
  description: v.string(), // AI-generated or admin description of this framing
  prompt: v.optional(v.string()), // Custom prompt used if admin-requested
  createdAt: v.number(), // Timestamp in milliseconds
  createdBy: FramingCreatorTypeSchema, // 'ai' or 'admin'
  creatorId: v.optional(v.string()), // Admin user ID if admin-created
  isActive: v.boolean(), // Whether this framing is currently displayed
  clusterIds: v.array(v.string()), // IDs of cluster statements in this framing
  order: v.number(), // Display order (0 = first)
});

export type Framing = v.InferOutput<typeof FramingSchema>;

/**
 * ClusterAggregatedEvaluation - cached aggregated evaluation metrics for a cluster
 * Handles deduplication: if a user evaluated multiple options in a cluster,
 * they are counted once with their average evaluation
 */
export const ClusterAggregatedEvaluationSchema = v.object({
  // Identifiers
  clusterId: v.string(),
  framingId: v.string(),
  parentStatementId: v.string(),

  // Core aggregation metrics (with deduplication)
  uniqueEvaluatorCount: v.number(), // Unique users who evaluated ANY option in cluster
  averageClusterConsensus: v.number(), // Average of per-user averages within cluster

  // Pro/Con breakdown (based on user's average within cluster)
  proEvaluatorCount: v.number(), // Users with positive average
  conEvaluatorCount: v.number(), // Users with negative average
  neutralEvaluatorCount: v.number(), // Users with zero average
  sumPro: v.number(), // Sum of positive user averages
  sumCon: v.number(), // Sum of negative user averages (stored as positive)

  // Detailed metrics
  optionCount: v.number(), // Number of options in this cluster
  evaluationsPerOption: v.array(v.number()), // Count per option for distribution

  // Cache metadata
  calculatedAt: v.number(), // When this was last calculated (milliseconds)
  expiresAt: v.number(), // TTL expiration timestamp (milliseconds)
  isStale: v.boolean(), // Flag for invalidation
});

export type ClusterAggregatedEvaluation = v.InferOutput<
  typeof ClusterAggregatedEvaluationSchema
>;

/**
 * FramingRequest - tracks admin custom framing requests
 */
export const FramingRequestSchema = v.object({
  requestId: v.string(),
  parentStatementId: v.string(),
  customPrompt: v.string(), // The prompt/framing perspective requested by admin
  requestedBy: v.string(), // Admin user ID
  requestedAt: v.number(), // Timestamp in milliseconds
  status: FramingRequestStatusSchema,
  resultFramingId: v.optional(v.string()), // ID of created framing on success
  error: v.optional(v.string()), // Error message on failure
});

export type FramingRequest = v.InferOutput<typeof FramingRequestSchema>;

/**
 * ClusterSnapshot - snapshot of a cluster within a framing
 */
export const ClusterSnapshotSchema = v.object({
  clusterId: v.string(),
  clusterName: v.string(),
  optionIds: v.array(v.string()),
});

export type ClusterSnapshot = v.InferOutput<typeof ClusterSnapshotSchema>;

/**
 * FramingSnapshot - full snapshot of a framing for recovery
 */
export const FramingSnapshotSchema = v.object({
  snapshotId: v.string(),
  framingId: v.string(),
  parentStatementId: v.string(),
  clusters: v.array(ClusterSnapshotSchema),
  createdAt: v.number(),
});

export type FramingSnapshot = v.InferOutput<typeof FramingSnapshotSchema>;

/**
 * Cache TTL constants for cluster aggregations
 */
export const CLUSTER_AGGREGATION_CACHE = {
  DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes
  LONG_TTL_MS: 30 * 60 * 1000, // 30 minutes (for stable clusters)
  SHORT_TTL_MS: 1 * 60 * 1000, // 1 minute (for active voting)
} as const;

/**
 * Helper function to create a composite ID for cluster aggregation cache
 */
export function getClusterAggregationId(
  clusterId: string,
  framingId: string
): string {
  return `${clusterId}--${framingId}`;
}

/**
 * Helper function to check if a cached aggregation is valid
 */
export function isClusterAggregationValid(
  aggregation: ClusterAggregatedEvaluation
): boolean {
  if (aggregation.isStale) return false;
  return Date.now() < aggregation.expiresAt;
}
