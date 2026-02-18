/**
 * Mind-Map Feature Constants
 * Centralized configuration for the mind-map mechanism
 */

export const MINDMAP_CONFIG = {
	/**
	 * Query configuration for Firestore operations
	 */
	QUERIES: {
		/** Number of items to fetch per page for pagination */
		PAGE_SIZE: 100,
		/** Maximum number of descendants to load (safety limit) */
		MAX_DESCENDANTS: 5000,
		/** Batch size for bulk operations */
		BATCH_SIZE: 50,
		/** Initial page size for first load (smaller for faster initial render) */
		INITIAL_PAGE_SIZE: 50,
	},

	/**
	 * Performance optimization settings
	 */
	PERFORMANCE: {
		/** Buffer zone around viewport for virtual rendering (pixels) */
		VIRTUAL_RENDER_BUFFER: 200,
		/** Debounce delay for search and filter operations (ms) */
		DEBOUNCE_DELAY: 300,
		/** Throttle delay for viewport updates (ms) */
		THROTTLE_DELAY: 100,
		/** Cache time-to-live (ms) */
		CACHE_TTL: 5 * 60 * 1000, // 5 minutes
		/** Maximum items to render without virtualization */
		VIRTUALIZATION_THRESHOLD: 100,
	},

	/**
	 * Retry configuration for failed operations
	 */
	RETRY: {
		/** Maximum number of retry attempts */
		MAX_ATTEMPTS: 3,
		/** Initial delay before first retry (ms) */
		INITIAL_DELAY: 1000,
		/** Exponential backoff multiplier */
		EXPONENTIAL_FACTOR: 2,
		/** Maximum delay between retries (ms) */
		MAX_DELAY: 10000,
	},

	/**
	 * Loading state configuration
	 */
	LOADING: {
		/** Minimum loading time to prevent UI flashing (ms) */
		MIN_LOADING_TIME: 200,
		/** Timeout for data loading before showing error (ms) */
		LOADING_TIMEOUT: 30000, // 30 seconds
		/** Show skeleton loader after this delay (ms) */
		SKELETON_DELAY: 500,
	},

	/**
	 * Tree building configuration
	 */
	TREE: {
		/** Maximum depth for tree traversal (prevent infinite loops) */
		MAX_DEPTH: 20,
		/** Maximum children per node to display initially */
		INITIAL_CHILDREN_DISPLAY: 10,
		/** Batch size for tree node processing */
		NODE_PROCESSING_BATCH: 100,
	},

	/**
	 * Error messages
	 */
	ERROR_MESSAGES: {
		LOAD_FAILED: 'Failed to load mind-map data. Please refresh and try again.',
		PARTIAL_LOAD: 'Some data could not be loaded. The mind-map may be incomplete.',
		PERMISSION_DENIED: 'You do not have permission to view this mind-map.',
		INVALID_DATA: 'The mind-map data is corrupted. Please contact support.',
		TIMEOUT: 'Loading is taking longer than expected. Please check your connection.',
	},

	/**
	 * Success messages
	 */
	SUCCESS_MESSAGES: {
		DATA_LOADED: 'Mind-map loaded successfully',
		CACHE_HIT: 'Loaded from cache',
		UPDATED: 'Mind-map updated',
	},
} as const;

/**
 * Mind-map statement types that should be loaded
 */
export const MINDMAP_STATEMENT_TYPES = ['question', 'group', 'option'] as const;

/**
 * Mind-map layout configuration
 */
export const MINDMAP_LAYOUT = {
	/** Default spacing between nodes */
	NODE_SPACING: {
		HORIZONTAL: 200,
		VERTICAL: 100,
	},
	/** Node dimensions */
	NODE_SIZE: {
		WIDTH: 150,
		HEIGHT: 60,
	},
	/** Animation configuration */
	ANIMATION: {
		DURATION: 300,
		EASING: 'ease-in-out',
	},
} as const;

/**
 * Export formats supported by mind-map
 */
export const MINDMAP_EXPORT_FORMATS = {
	PNG: 'png',
	SVG: 'svg',
	JSON: 'json',
} as const;

export type MindMapExportFormat =
	(typeof MINDMAP_EXPORT_FORMATS)[keyof typeof MINDMAP_EXPORT_FORMATS];
