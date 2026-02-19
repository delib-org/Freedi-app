import { MindMapData, MindMapNode } from './types';
import { SerializedNode, SerializedMindMapData } from './offlineTypes';

/**
 * Serialize mind-map data for IndexedDB storage
 */
export function serializeMindMapData(data: MindMapData): SerializedMindMapData {
	const nodesArray = Array.from(data.nodeMap.entries()).map(([id, node]) => ({
		id,
		node: serializeNode(node),
	}));

	return {
		rootStatement: data.rootStatement,
		tree: serializeNode(data.tree),
		allStatements: data.allStatements,
		nodes: nodesArray,
		loadingState: data.loadingState,
		error: data.error,
	};
}

/**
 * Serialize a single node
 */
function serializeNode(node: MindMapNode): SerializedNode {
	return {
		statement: node.statement,
		children: node.children.map((child) => serializeNode(child)),
		depth: node.depth,
		isExpanded: node.isExpanded,
		isLoading: node.isLoading,
	};
}

/**
 * Deserialize mind-map data from IndexedDB storage
 */
export function deserializeMindMapData(record: SerializedMindMapData): MindMapData {
	const nodeMap = new Map<string, MindMapNode>();

	if (record.nodes) {
		record.nodes.forEach((entry) => {
			nodeMap.set(entry.id, deserializeNode(entry.node));
		});
	}

	return {
		rootStatement: record.rootStatement,
		tree: deserializeNode(record.tree),
		allStatements: record.allStatements,
		nodeMap,
		loadingState: record.loadingState,
		error: record.error,
	};
}

/**
 * Deserialize a single node
 */
function deserializeNode(data: SerializedNode): MindMapNode {
	return {
		statement: data.statement,
		children: data.children?.map((child) => deserializeNode(child)) || [],
		depth: data.depth,
		isExpanded: data.isExpanded,
		isLoading: data.isLoading,
	};
}
