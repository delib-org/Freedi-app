import { Statement } from '@freedi/shared-types';

/**
 * Represents a node in the mind-map tree structure
 */
export interface MindMapNode {
	statement: Statement;
	children: MindMapNode[];
	depth: number;
	isExpanded?: boolean;
	isLoading?: boolean;
}

/**
 * Mind-map data structure
 */
export interface MindMapData {
	rootStatement: Statement;
	tree: MindMapNode;
	allStatements: Statement[];
	nodeMap: Map<string, MindMapNode>;
	loadingState: MindMapLoadingState;
	error?: MindMapError;
}

/**
 * Loading states for mind-map data
 */
export enum MindMapLoadingState {
	IDLE = 'idle',
	LOADING = 'loading',
	PARTIAL_LOADED = 'partialLoaded',
	FULLY_LOADED = 'fullyLoaded',
	ERROR = 'error',
}

/**
 * Error information for mind-map operations
 */
export interface MindMapError {
	code: string;
	message: string;
	retryable: boolean;
	metadata?: Record<string, unknown>;
}

/**
 * Options for loading mind-map data
 */
export interface MindMapLoadOptions {
	includeDocuments?: boolean;
	maxDepth?: number;
	pageSize?: number;
	useCache?: boolean;
	retryOnError?: boolean;
}

/**
 * Callback for mind-map updates
 */
export type MindMapUpdateCallback = (data: MindMapData) => void;

/**
 * Statistics for mind-map data
 */
export interface MindMapStats {
	totalNodes: number;
	maxDepth: number;
	loadTime: number;
	cacheHit: boolean;
	errorCount: number;
}

/**
 * Cache entry for mind-map data
 */
export interface MindMapCacheEntry {
	data: MindMapData;
	timestamp: number;
	statementId: string;
	version: number;
}
