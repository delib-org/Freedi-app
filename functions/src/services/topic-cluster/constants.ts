// Tunables for the topic-cluster pipeline. All thresholds documented inline.

// Filter pools (Step 1)
export const MIN_TEXT_CHARS = 30;
export const MIN_TEXT_WORDS_CJK = 6;
export const NOISE_POOL_MIN_COUNT = 50;

// Taxonomy step (Step 2)
export const TAXONOMY_SAMPLE_MAX = 80;
export const TAXONOMY_MIN_CATEGORIES = 8;
export const TAXONOMY_MAX_CATEGORIES = 20;

// Normalization step (Step 3)
export const NORMALIZE_BATCH_SIZE = 8;
export const NORMALIZE_CONCURRENCY = 10;
export const NORMALIZE_RETRY = 3;

// Cluster step (Step 5)
export const UMAP_MIN_ITEMS = 10;
export const UMAP_TARGET_COMPONENTS = 10;
export const DBSCAN_MIN_SAMPLES = 3;
export const DBSCAN_EPS = 1.0; // tuned empirically on UMAP-projected normalized embeddings
export const NEAREST_CENTROID_THRESHOLD = 0.6;

// Pool reattach (Step 10)
export const POOL_REATTACH_THRESHOLD = 0.5;

// Naming step (Step 6)
export const NAME_SAMPLES_PER_CLUSTER = 5;
export const CTFIDF_TOP_TOKENS = 6;

// Writer step (Step 7)
export const TOPIC_FRAMING_DISPLAY_NAME = 'Topic Clustering';
export const TOPIC_FRAMING_DESCRIPTION =
	'LLM-derived topic clusters: each response is normalized to a canonical action and grouped by what is being proposed.';
export const TOPIC_FRAMING_ORDER = 50;
export const FIRESTORE_BATCH_SIZE = 500;

// Cache (Step 2 + 3)
export const PROMPT_VERSION_TAXONOMY = 'taxonomy-v1';
export const PROMPT_VERSION_NORMALIZE = 'normalize-v1';
export const PROMPT_VERSION_NAME = 'name-v1';

// Pipeline-level constant — used in derivedByPipeline marker on synthetic options
export const PIPELINE_ID = 'topic-cluster' as const;
