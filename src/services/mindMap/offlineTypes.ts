import { MindMapData, MindMapNode } from './types';

export interface SerializedNode {
	statement: MindMapNode['statement'];
	children: SerializedNode[];
	depth: number;
	isExpanded: boolean;
	isLoading: boolean;
}

export interface SerializedMindMapData {
	rootStatement: MindMapData['rootStatement'];
	tree: SerializedNode;
	allStatements: MindMapData['allStatements'];
	nodes: Array<{ id: string; node: SerializedNode }>;
	loadingState: MindMapData['loadingState'];
	error: MindMapData['error'];
}

export interface PendingUpdate {
	id?: number;
	type: 'CREATE_STATEMENT' | 'UPDATE_STATEMENT' | 'DELETE_STATEMENT' | 'MOVE_STATEMENT';
	statementId: string;
	data: Record<string, unknown>;
	timestamp?: number;
	retryCount?: number;
	lastRetry?: number;
}

export interface StorageStats {
	mindMapCount: number;
	pendingUpdateCount: number;
	estimatedSizeBytes: number;
	quotaBytes: number;
	isOnline: boolean;
}
