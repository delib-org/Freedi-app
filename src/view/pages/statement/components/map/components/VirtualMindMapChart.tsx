import React, { MouseEvent, useCallback, useEffect, useState, memo, useMemo } from 'react';

// React Flow imports
import ReactFlow, {
	Controls,
	useNodesState,
	useEdgesState,
	Panel,
	Position,
	Node,
	useReactFlow,
	ReactFlowInstance,
	useViewport,
} from 'reactflow';
import '../mapHelpers/reactFlow.module.scss';
import 'reactflow/dist/style.css';

// Custom imports
import { getStatementFromDB } from '../../../../../../controllers/db/statements/getStatement';
import { updateStatementParents } from '../../../../../../controllers/db/statements/setStatements';
import { useMapContext } from '../../../../../../controllers/hooks/useMap';
import Modal from '../../../../../components/modal/Modal';
import {
	createInitialNodesAndEdges,
	getLayoutElements,
} from '../mapHelpers/customNodeCont';
import CustomNode from './CustomNode';
import MapCancelIcon from '@/assets/icons/MapCancelIcon.svg';
import MapHamburgerIcon from '@/assets/icons/MapHamburgerIcon.svg';
import MapHorizontalLayoutIcon from '@/assets/icons/MapHorizontalLayoutIcon.svg';
import MapRestoreIcon from '@/assets/icons/MapRestoreIcon.svg';
import MapSaveIcon from '@/assets/icons/MapSaveIcon.svg';
import MapVerticalLayoutIcon from '@/assets/icons/MapVerticalLayoutIcon.svg';
import { Results } from '@freedi/shared-types';
import { FilterType } from '@/controllers/general/sorting';
import { MINDMAP_CONFIG } from '@/constants/mindMap';
import { logError } from '@/utils/errorHandling';

const nodeTypes = {
	custom: CustomNode,
};

interface Props {
	descendants: Results;
	filterBy: FilterType;
	isAdmin: boolean;
}

/**
 * Enhanced MindMapChart with virtual rendering for large datasets
 */
function VirtualMindMapChart({ descendants, isAdmin, filterBy }: Readonly<Props>) {
	const { getIntersectingNodes } = useReactFlow();
	const viewport = useViewport();
	const [nodes, setNodes, onNodesChange] = useNodesState([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);
	const [tempEdges, setTempEdges] = useState(edges);
	const [draggedNodeId, setDraggedNodeId] = useState('');
	const [intersectedNodeId, setIntersectedNodeId] = useState('');
	const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
	const [isVirtualized, setIsVirtualized] = useState(false);

	const { mapContext, setMapContext } = useMapContext();

	// Calculate visible nodes for virtual rendering
	const visibleNodes = useMemo(() => {
		if (!isVirtualized || nodes.length < MINDMAP_CONFIG.PERFORMANCE.VIRTUALIZATION_THRESHOLD) {
			return nodes;
		}

		const buffer = MINDMAP_CONFIG.PERFORMANCE.VIRTUAL_RENDER_BUFFER;
		// Use default viewport dimensions or get from ReactFlow instance
		const viewportWidth = rfInstance ? rfInstance.getViewport().x : 1000;
		const viewportHeight = rfInstance ? rfInstance.getViewport().y : 800;

		const viewBounds = {
			left: viewport.x - buffer,
			right: viewport.x + viewportWidth + buffer,
			top: viewport.y - buffer,
			bottom: viewport.y + viewportHeight + buffer,
		};

		// Filter nodes within viewport bounds
		return nodes.filter(node => {
			if (!node.position) return false;

			const nodeRight = node.position.x + (node.width || 150);
			const nodeBottom = node.position.y + (node.height || 60);

			return (
				node.position.x < viewBounds.right &&
				nodeRight > viewBounds.left &&
				node.position.y < viewBounds.bottom &&
				nodeBottom > viewBounds.top
			);
		});
	}, [nodes, viewport, isVirtualized, rfInstance]);

	// Performance monitoring
	useEffect(() => {
		const nodeCount = nodes.length;

		// Enable virtualization for large node counts
		if (nodeCount > MINDMAP_CONFIG.PERFORMANCE.VIRTUALIZATION_THRESHOLD) {
			setIsVirtualized(true);
			console.info(`[VirtualMindMapChart] Virtualization enabled for ${nodeCount} nodes`);
		} else {
			setIsVirtualized(false);
		}

		// Log performance metrics
		if (nodeCount > 0) {
			const visibleCount = visibleNodes.length;
			const hiddenCount = nodeCount - visibleCount;

			console.info(`[VirtualMindMapChart] Performance metrics:`, {
				totalNodes: nodeCount,
				visibleNodes: visibleCount,
				hiddenNodes: hiddenCount,
				virtualizationEnabled: isVirtualized,
				renderEfficiency: ((visibleCount / nodeCount) * 100).toFixed(1) + '%'
			});
		}
	}, [nodes.length, visibleNodes.length, isVirtualized]);

	// Debounced viewport change handler for virtual rendering
	const [, setDebouncedViewport] = useState(viewport);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedViewport(viewport);
		}, MINDMAP_CONFIG.PERFORMANCE.THROTTLE_DELAY);

		return () => clearTimeout(timer);
	}, [viewport]);

	// Initialize nodes and edges with performance optimization
	useEffect(() => {
		if (!descendants) return;

		try {
			const startTime = performance.now();

			// Get initial nodes and edges
			const { nodes: initialNodes, edges: initialEdges } = createInitialNodesAndEdges(
				descendants
			);

			// Check if we should virtualize
			const shouldVirtualize = initialNodes.length > MINDMAP_CONFIG.PERFORMANCE.VIRTUALIZATION_THRESHOLD;
			setIsVirtualized(shouldVirtualize);

			// Layout calculation
			const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutElements(
				initialNodes,
				initialEdges,
				mapContext.nodeHeight,
				mapContext.nodeWidth,
				mapContext.direction
			);

			// Batch node processing for better performance
			const batchSize = MINDMAP_CONFIG.TREE.NODE_PROCESSING_BATCH;
			const processedNodes: typeof layoutedNodes = [];

			for (let i = 0; i < layoutedNodes.length; i += batchSize) {
				const batch = layoutedNodes.slice(i, i + batchSize);
				processedNodes.push(...batch.map((node) => ({
					...node,
					data: {
						...node.data,
						animate: false, // Disable animation for large datasets
					},
				})));
			}

			setNodes(processedNodes);
			setEdges(layoutedEdges);
			setTempEdges(layoutedEdges);

			const endTime = performance.now();
			console.info(`[VirtualMindMapChart] Layout completed in ${(endTime - startTime).toFixed(2)}ms for ${processedNodes.length} nodes`);

		} catch (error) {
			logError(error, {
				operation: 'VirtualMindMapChart.initialize',
				metadata: {
					descendantsCount: descendants?.sub?.length,
					filterBy
				}
			});
		}
	}, [descendants, filterBy]);

	// Optimized layout function with batching
	const onLayout = useCallback(
		(direction: 'TB' | 'LR') => {
			try {
				const width = direction === 'TB' ? 50 : 90;
				const height = direction === 'TB' ? 50 : 30;

				setMapContext((prev) => ({
					...prev,
					targetPosition: direction === 'TB' ? Position.Top : Position.Left,
					sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
					nodeWidth: width,
					nodeHeight: height,
					direction,
				}));

				// Use requestAnimationFrame for smooth updates
				requestAnimationFrame(() => {
					const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutElements(
						nodes,
						edges,
						height,
						width,
						direction
					);

					setNodes([...layoutedNodes]);
					setEdges([...layoutedEdges]);
				});

			} catch (error) {
				logError(error, {
					operation: 'VirtualMindMapChart.onLayout',
					metadata: { direction }
				});
			}
		},
		[nodes, edges, setEdges, setMapContext, setNodes]
	);

	// Optimized node drag handlers
	const onNodeDragStop = async (_: MouseEvent, node: Node) => {
		try {
			const intersections = getIntersectingNodes(node).map((n) => n.id);
			if (intersections.length === 0) return setEdges(tempEdges);

			setDraggedNodeId(node.id);
			setIntersectedNodeId(intersections[0]);
			setMapContext((prev) => ({ ...prev, moveStatementModal: true }));
		} catch (error) {
			logError(error, {
				operation: 'VirtualMindMapChart.onNodeDragStop',
				metadata: { nodeId: node.id }
			});
		}
	};

	const onNodeDrag = useCallback(
		(_: MouseEvent, node: Node) => {
			// Temporarily hide edges during drag for performance
			if (edges.length > 50) {
				setEdges([]);
			}

			const intersection = getIntersectingNodes(node).find((n) => n.id);
			setNodes((ns) =>
				ns.map((n) => ({
					...n,
					className: intersection?.id === n.id ? 'highlight' : '',
				}))
			);
		},
		[getIntersectingNodes, setEdges, setNodes, edges.length]
	);

	// Optimized save/restore with compression for large datasets
	const onSave = useCallback(() => {
		if (rfInstance) {
			try {
				const flow = rfInstance.toObject();

				// Compress large flows
				if (flow.nodes.length > 100) {
					// Store only essential data for large flows
					const compressedFlow = {
						nodes: flow.nodes.map(n => ({
							id: n.id,
							position: n.position,
							data: { label: n.data?.label }
						})),
						edges: flow.edges.map(e => ({
							id: e.id,
							source: e.source,
							target: e.target
						})),
						viewport: flow.viewport
					};
					localStorage.setItem('flowKey_compressed', JSON.stringify(compressedFlow));
				} else {
					localStorage.setItem('flowKey', JSON.stringify(flow));
				}

				console.info('[VirtualMindMapChart] Flow saved successfully');
			} catch (error) {
				logError(error, {
					operation: 'VirtualMindMapChart.onSave',
					metadata: { nodeCount: nodes.length }
				});
			}
		}
	}, [rfInstance, nodes.length]);

	const onRestore = useCallback(() => {
		const restoreFlow = async () => {
			try {
				// Try compressed version first for large flows
				let flow = localStorage.getItem('flowKey_compressed');
				if (!flow) {
					flow = localStorage.getItem('flowKey');
				}

				if (!flow) return;

				const parsedFlow = JSON.parse(flow);
				if (parsedFlow) {
					setNodes(parsedFlow.nodes ?? []);
					setEdges(parsedFlow.edges ?? []);
					console.info('[VirtualMindMapChart] Flow restored successfully');
				}
			} catch (error) {
				logError(error, {
					operation: 'VirtualMindMapChart.onRestore'
				});
			}
		};
		restoreFlow();
	}, [setNodes, setEdges]);

	const handleMoveStatement = async (move: boolean) => {
		if (move) {
			try {
				const [draggedStatement, newDraggedStatementParent] = await Promise.all([
					getStatementFromDB(draggedNodeId),
					getStatementFromDB(intersectedNodeId),
				]);

				if (!draggedStatement || !newDraggedStatementParent) {
					throw new Error('Statement not found');
				}

				await updateStatementParents(
					draggedStatement,
					newDraggedStatementParent
				);

				console.info('[VirtualMindMapChart] Statement moved successfully');
			} catch (error) {
				logError(error, {
					operation: 'VirtualMindMapChart.handleMoveStatement',
					metadata: { draggedNodeId, intersectedNodeId }
				});
			}
		}

		setMapContext((prev) => ({ ...prev, moveStatementModal: false }));
		setEdges(tempEdges);
	};

	return (
		<>
			<ReactFlow
				nodes={isVirtualized ? visibleNodes : nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onInit={setRfInstance}
				onNodeDrag={onNodeDrag}
				onNodeDragStop={onNodeDragStop}
				nodeTypes={nodeTypes}
				fitView
				minZoom={0.1}
				maxZoom={2}
				// Performance optimizations
				nodesDraggable={isAdmin}
				nodesConnectable={false}
				elementsSelectable={isAdmin}
				selectNodesOnDrag={false}
				// Virtual rendering optimization
				onlyRenderVisibleElements={isVirtualized}
			>
				<Panel position='top-left'>
					<div className='map-control'>
						{isAdmin && (
							<>
								<button
									className='map-control__button'
									onClick={() => onLayout('TB')}
									title='Vertical Layout'
								>
									<img src={MapVerticalLayoutIcon} alt='Vertical Layout' />
								</button>
								<button
									className='map-control__button'
									onClick={() => onLayout('LR')}
									title='Horizontal Layout'
								>
									<img src={MapHorizontalLayoutIcon} alt='Horizontal Layout' />
								</button>
								<button
									className='map-control__button'
									onClick={onSave}
									title='Save Layout'
								>
									<img src={MapSaveIcon} alt='Save' />
								</button>
								<button
									className='map-control__button'
									onClick={onRestore}
									title='Restore Layout'
								>
									<img src={MapRestoreIcon} alt='Restore' />
								</button>
							</>
						)}
					</div>
				</Panel>
				<Controls />

				{/* Performance indicator */}
				{isVirtualized && (
					<Panel position='bottom-left'>
						<div style={{
							background: 'rgba(255, 255, 255, 0.9)',
							padding: '8px',
							borderRadius: '4px',
							fontSize: '12px',
							color: '#666'
						}}>
							Virtual Rendering: {visibleNodes.length}/{nodes.length} nodes
						</div>
					</Panel>
				)}
			</ReactFlow>

			{mapContext.moveStatementModal && (
				<Modal>
					<div
						className='modal__content'
						style={{
							width: '90vw',
							maxWidth: '25rem',
							backgroundColor: 'var(--white)',
							padding: '2rem',
							borderRadius: '1rem',
						}}
					>
						<h3>Move Statement?</h3>
						<p>Are you sure you want to move this statement to a new parent?</p>
						<div className='modal__buttons'>
							<button
								className='btn btn--secondary'
								onClick={() => handleMoveStatement(false)}
							>
								<img src={MapCancelIcon} alt='Cancel' />
								Cancel
							</button>
							<button
								className='btn btn--primary'
								onClick={() => handleMoveStatement(true)}
							>
								<img src={MapHamburgerIcon} alt='Move' />
								Move
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}

export default memo(VirtualMindMapChart);