/**
 * Tree View Constants
 *
 * Configuration for the threaded conversation tree view.
 */

/** Maximum number of levels expanded by default */
export const MAX_VISIBLE_LEVELS = 3;

/** Safety limit to prevent infinite recursion */
export const MAX_TREE_DEPTH = 20;

/** Indentation per level on desktop (px) */
export const TREE_INDENT_PX = 24;

/** Indentation per level on mobile (px) */
export const TREE_INDENT_MOBILE_PX = 12;

/** Initial descendants to load for tree view (lazy-loading) */
export const TREE_INITIAL_LIMIT = 200;

/** Batch size for loading more descendants on scroll-up */
export const TREE_LOAD_MORE_BATCH = 50;

/** Maximum descendants to load for tree view */
export const TREE_DESCENDANTS_LIMIT = 200;
