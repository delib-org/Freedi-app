import type { Statement, TaxonomyCategory } from '@freedi/shared-types';

/**
 * One response loaded from Firestore (or from an offline JSON export), with the
 * text we'll cluster on already extracted.
 */
export interface RawResponse {
	statementId: string;
	statement: Statement; // original Firestore doc
	text: string; // extracted text to embed/cluster on (paragraphs joined or `statement` field)
	language: string; // ISO 639-1 code (best-effort detection); 'und' if undetermined
	totalEvaluators: number;
	lastUpdate: number;
}

/**
 * After splitPools(): which bucket each response belongs to.
 */
export interface PooledResponses {
	core: RawResponse[];
	short: RawResponse[];
	noise: RawResponse[];
}

/**
 * One canonical action extracted from a response by the LLM normalize step.
 */
export interface NormalizedAction {
	canonicalSentence: string;
	categoryKey: string;
	canonicalEmbedding?: number[]; // populated after Step 4
}

/**
 * The result of normalizing one response. May produce multiple actions (compound
 * responses are decomposed downstream by the writer).
 */
export interface NormalizedResponse {
	statementId: string;
	actions: NormalizedAction[];
}

/**
 * One row that the cluster step operates on: a single canonical action with
 * provenance back to its source response.
 */
export interface ClusterableItem {
	sourceStatementId: string;
	actionIndex: number; // 0 for primary, 1+ for additional actions on a compound response
	canonicalSentence: string;
	categoryKey: string;
	embedding: number[]; // L2-normalized canonical-sentence embedding
	originalText: string; // raw response text (used in c-TF-IDF)
}

/**
 * Output of the cluster step for one category.
 */
export interface ClusterAssignment {
	clusterIndex: number; // -1 means uncategorized within this category
	itemIndex: number; // index into the input ClusterableItem[] array
}

export interface ClusterCentroid {
	embedding: number[]; // average of member embeddings, L2-normalized
}

export interface ClusterGroup {
	groupId: string; // synthetic id like `${categoryKey}_${clusterIndex}` or `${categoryKey}_uncategorized`
	categoryKey: string;
	clusterIndex: number; // -1 for uncategorized
	memberIndices: number[]; // indices into ClusterableItem[]
	centroid?: number[]; // populated for non-empty real clusters
	displayName?: string; // populated by name step (LLM)
	cTfIdfTokens?: string[]; // populated by name step (logged only)
}

/**
 * Public options passed into runTopicClusterPipeline.
 */
export interface RunOptions {
	dryRun?: boolean;
	rebuildCache?: boolean;
	rebuildTaxonomy?: boolean;
	fromFile?: string;
}

/**
 * Top-level result of one pipeline run.
 */
export interface RunSummary {
	parentId: string;
	dryRun: boolean;
	taxonomy: TaxonomyCategory[];
	totals: {
		responsesLoaded: number;
		core: number;
		short: number;
		noise: number;
		actionsExtracted: number;
		clustersCreated: number;
		assignedToCluster: number;
		uncategorized: number;
		syntheticOptionsCreated: number;
	};
	durationMs: number;
}
