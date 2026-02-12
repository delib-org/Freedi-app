import React, { MouseEvent, useCallback, useEffect, useState, memo } from 'react';

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
} from 'reactflow';
import '../mapHelpers/reactFlow.module.scss';
import 'reactflow/dist/style.css';

// icons and components
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
import { Results, Statement, StatementType } from '@freedi/shared-types';
import { FilterType } from '@/controllers/general/sorting';

const nodeTypes = {
	custom: CustomNode,
};

interface Props {
	descendants: Results;
	filterBy: FilterType;
	isAdmin: boolean;
}

function MindMapChart({ descendants, isAdmin, filterBy }: Readonly<Props>) {
	const { getIntersectingNodes } = useReactFlow();
	const [nodes, setNodes, onNodesChange] = useNodesState([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);
	const [tempEdges, setTempEdges] = useState(edges);
	const [rfInstance, setRfInstance] = useState<null | ReactFlowInstance>(null);

	const [intersectedNodeId, setIntersectedNodeId] = useState('');
	const [draggedNodeId, setDraggedNodeId] = useState('');
	const { mapContext, setMapContext } = useMapContext();
	const [isButtonVisible, setIsButtonVisible] = useState(false);
	const selectedId = mapContext?.selectedId ?? null;

	const handleHamburgerClick = () => setIsButtonVisible(true);
	const handleCancelClick = () => setIsButtonVisible(false);

	function filterDescendants(results: Results): Results | null {
		const { isVoted, isChosen } = results.top;
		if (results.top.statementType === StatementType.option) {
			if (!(isVoted || isChosen)) return null;
		}

		const filteredSub = results.sub
			.map((subResult) => filterDescendants(subResult))
			.filter((result): result is Results => result !== null);

		return {
			top: results.top,
			sub: filteredSub,
		};
	}

	const filtered = filterDescendants(descendants);

	useEffect(() => {
		const { nodes: createdNodes, edges: createdEdges } =
			createInitialNodesAndEdges(filterBy !== FilterType.questionsResults ? descendants : filtered);

		const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutElements(
			createdNodes,
			createdEdges,
			mapContext.nodeHeight,
			mapContext.nodeWidth,
			mapContext.direction
		);

		const latestCreatedAt = Math.max(...layoutedNodes.map((n) => n.data?.createdAt || 0));

		const animatedNodes = layoutedNodes.map((node) => {
			const shouldAnimate = node.data?.createdAt === latestCreatedAt;

			return {
				...node,
				data: {
					...node.data,
					animate: shouldAnimate,
				},
			};
		});

		setNodes(animatedNodes);
		setEdges(layoutedEdges);
		setTempEdges(layoutedEdges);

		setTimeout(() => {
			setNodes((prevNodes) =>
				prevNodes.map((node) => ({
					...node,
					data: {
						...node.data,
						animate: false,
					},
				}))
			);
			onSave();
		}, 1000);
	}, [descendants, filterBy]);

	const onLayout = useCallback(
		(direction: 'TB' | 'LR') => {
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

			const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutElements(
				nodes,
				edges,
				height,
				width,
				direction
			);

			setNodes([...layoutedNodes]);
			setEdges([...layoutedEdges]);
		},
		[nodes, edges, setEdges, setMapContext, setNodes]
	);

	const onNodeDragStop = async (_: MouseEvent, node: Node) => {
		const intersections = getIntersectingNodes(node).map((n) => n.id);
		if (intersections.length === 0) return setEdges(tempEdges);

		setDraggedNodeId(node.id);
		setIntersectedNodeId(intersections[0]);
		setMapContext((prev) => ({ ...prev, moveStatementModal: true }));
	};

	const onNodeDrag = useCallback(
		(_: MouseEvent, node: Node) => {
			setEdges([]);
			const intersection = getIntersectingNodes(node).find((n) => n.id);
			setNodes((ns) =>
				ns.map((n) => ({
					...n,
					className: intersection?.id === n.id ? 'highlight' : '',
				}))
			);
		},
		[getIntersectingNodes, setEdges, setNodes]
	);

	const onSave = useCallback(() => {
		if (rfInstance) {
			const flow = rfInstance.toObject();
			localStorage.setItem('flowKey', JSON.stringify(flow));
		}
	}, [rfInstance]);

	const onRestore = useCallback(() => {
		const restoreFlow = async () => {
			const getFlow = localStorage.getItem('flowKey');
			if (!getFlow) return;
			const flow = JSON.parse(getFlow);
			if (flow) {
				setNodes(flow.nodes ?? []);
				setEdges(flow.edges ?? []);
			}
		};
		restoreFlow();
	}, [setNodes, setEdges]);

	const handleMoveStatement = async (move: boolean) => {
		if (move) {
			const [draggedStatement, newDraggedStatementParent] = await Promise.all([
				getStatementFromDB(draggedNodeId),
				getStatementFromDB(intersectedNodeId),
			]);
			if (!draggedStatement || !newDraggedStatementParent) return;
			await updateStatementParents(draggedStatement, newDraggedStatementParent);
		} else {
			onRestore();
		}
		setMapContext((prev) => ({
			...prev,
			moveStatementModal: !prev.moveStatementModal,
		}));
	};

	function findStatementById(results: Results, id: string): Statement | null {
		if (results.top.statementId === id) return results.top;
		for (const sub of results.sub) {
			const found = findStatementById(sub, id);
			if (found) return found;
		}

		return null;
	}

	const handleAddSiblingNode = () => {
		const hoveredStatement = findStatementById(descendants, selectedId) ?? descendants.top;
		setMapContext((prev) => ({
			...prev,
			showModal: true,
			parentStatement: hoveredStatement,
		}));
	};

	return (
		<>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				fitView
				zoomOnDoubleClick={false}
				style={{ height: `100vh`, width: `100vw` }}
				nodesDraggable={isAdmin}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onNodeDrag={onNodeDrag}
				onNodeDragStop={onNodeDragStop}
				onInit={(reactFlowInstance) => {
					setRfInstance(reactFlowInstance);
					const flow = reactFlowInstance.toObject();
					localStorage.setItem('flowKey', JSON.stringify(flow));
				}}
			>
				<Controls showInteractive={isAdmin} />
				<Panel position='bottom-right' className='btnsPanel'>
					{!isButtonVisible && (
						<div className='mainButton'>
							<button onClick={handleHamburgerClick}>
								<img src={MapHamburgerIcon} alt='Hamburger' />
							</button>
						</div>
					)}
					{isButtonVisible && (
						<div className={`arc-buttons ${isButtonVisible ? 'open' : ''}`}>
							<button onClick={handleCancelClick}>
								<img src={MapCancelIcon} alt='Cancel' />
							</button>
							<button onClick={() => onLayout('TB')}>
								<img src={MapVerticalLayoutIcon} alt='vertical layout' />
							</button>
							<button onClick={() => onLayout('LR')}>
								<img src={MapHorizontalLayoutIcon} alt='horizontal layout' />
							</button>
							<button onClick={onRestore}>
								<img src={MapRestoreIcon} alt='Restore' />
							</button>
							<button onClick={handleAddSiblingNode}>
								<img src={MapSaveIcon} alt='Add' />
							</button>
						</div>
					)}
				</Panel>
			</ReactFlow>

			{mapContext.moveStatementModal && (
				<Modal>
					<div style={{ padding: '1rem' }}>
						<h1>Are you sure you want to move statement here?</h1>
						<br />
						<div className='btnBox'>
							<button onClick={() => handleMoveStatement(true)} className='btn btn--large btn--add'>
								Yes
							</button>
							<button onClick={() => handleMoveStatement(false)} className='btn btn--large btn--disagree'>
								No
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}

export default memo(MindMapChart);
