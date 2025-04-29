import React, { MouseEvent, useCallback, useEffect, useState } from 'react';

// Styles
import '@/view/pages/statement/components/createStatementModal/CreateStatementModal.scss';

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
import '../mapHelpers/reactFlow.scss';
import 'reactflow/dist/style.css';

// icons
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
import { Results, StatementType } from 'delib-npm';
import { FilterType } from '@/controllers/general/sorting';

// Helper functions

// Hooks

// Custom components

const nodeTypes = {
	custom: CustomNode,
};

interface Props {
	descendants: Results;
	filterBy: FilterType;
	isAdmin: boolean;
}

export default function MindMapChart({
	descendants,
	isAdmin,
	filterBy,
}: Readonly<Props>) {
	const { getIntersectingNodes } = useReactFlow();
	const [nodes, setNodes, onNodesChange] = useNodesState([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);
	const [tempEdges, setTempEdges] = useState(edges);
	const [rfInstance, setRfInstance] = useState<null | ReactFlowInstance<
		unknown,
		unknown
	>>(null);

	const [intersectedNodeId, setIntersectedNodeId] = useState('');
	const [draggedNodeId, setDraggedNodeId] = useState('');

	const { mapContext, setMapContext } = useMapContext();

	const [isButtonVisible, setIsButtonVisible] = useState(false);

	const handleHamburgerClick = () => {
		setIsButtonVisible(true);
	};

	const handleCancelClick = () => {
		setIsButtonVisible(false);
	};
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
			createInitialNodesAndEdges(
				filterBy !== FilterType.questionsResults
					? descendants
					: filtered
			);

		const { nodes: layoutedNodes, edges: layoutedEdges } =
			getLayoutElements(
				createdNodes,
				createdEdges,
				mapContext.nodeHeight,
				mapContext.nodeWidth,
				mapContext.direction
			);

		setNodes(layoutedNodes);
		setEdges(layoutedEdges);
		setTempEdges(layoutedEdges);

		setTimeout(() => {
			onSave();
		}, 500);
	}, [descendants, filterBy]);

	const onLayout = useCallback(
		(direction: 'TB' | 'LR') => {
			const width = direction === 'TB' ? 50 : 90;
			const height = direction === 'TB' ? 50 : 30;

			setMapContext((prev) => ({
				...prev,
				targetPosition:
					direction === 'TB' ? Position.Top : Position.Left,
				sourcePosition:
					direction === 'TB' ? Position.Bottom : Position.Right,
				nodeWidth: width,
				nodeHeight: height,
				direction,
			}));

			const { nodes: layoutedNodes, edges: layoutedEdges } =
				getLayoutElements(nodes, edges, height, width, direction);

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

		setMapContext((prev) => ({
			...prev,
			moveStatementModal: true,
		}));
	};

	const onNodeDrag = useCallback(
		(_: MouseEvent, node: Node) => {
			setEdges([]);

			const intersections = getIntersectingNodes(node).find((n) => n.id);

			setNodes((ns) =>
				ns.map((n) => ({
					...n,
					className: intersections?.id === n.id ? 'highlight' : '',
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
				setNodes(flow.nodes || []);
				setEdges(flow.edges || []);
			}
		};

		restoreFlow();
	}, [setNodes, setEdges]);

	const handleMoveStatement = async (move: boolean) => {
		if (move) {
			const [draggedStatement, newDraggedStatementParent] =
				await Promise.all([
					getStatementFromDB(draggedNodeId),
					getStatementFromDB(intersectedNodeId),
				]);
			if (!draggedStatement || !newDraggedStatementParent) return;
			await updateStatementParents(
				draggedStatement,
				newDraggedStatementParent
			);
		} else {
			onRestore();
		}
		setMapContext((prev) => ({
			...prev,
			moveStatementModal: !prev.moveStatementModal,
		}));
	};

	return (
		<>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				fitView
				style={{ height: `100vh` }}
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
				<Controls />
				<Panel position='bottom-right' className='btnsPanel'>
					{!isButtonVisible && (
						<div className='mainButton'>
							<button onClick={handleHamburgerClick}>
								<img src={MapHamburgerIcon} alt='Hamburger' />
							</button>
						</div>
					)}
					{isButtonVisible && (
						<div
							className={`arc-buttons ${isButtonVisible ? 'open' : ''}`}
						>
							<button onClick={handleCancelClick}>
								<img src={MapCancelIcon} alt='Cancel' />
							</button>
							<button onClick={() => onLayout('TB')}>
								<img
									src={MapVerticalLayoutIcon}
									alt='vertical layout'
								/>
							</button>
							<button onClick={() => onLayout('LR')}>
								<img
									src={MapHorizontalLayoutIcon}
									alt='horizontal layout'
								/>
							</button>
							<button onClick={onRestore}>
								<img src={MapRestoreIcon} alt='Restore' />
							</button>
							{/*it does seem to be a save button remove style to see it*/}
							<button
								onClick={onSave}
								style={{
									pointerEvents: 'none',
								}}
							>
								<img
									src={MapSaveIcon}
									alt='Save'
									style={{ opacity: 0 }}
								/>
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
							<button
								onClick={() => handleMoveStatement(true)}
								className='btn btn--large btn--add'
							>
								Yes
							</button>
							<button
								onClick={() => handleMoveStatement(false)}
								className='btn btn--large btn--disagree'
							>
								No
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}
