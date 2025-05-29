import React, { useEffect, useState, useRef } from 'react';
// Third party
import { useNavigate } from 'react-router';
import { Handle, NodeProps, useStore } from 'reactflow';
// Hooks
// Icons
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
// Statements functions
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useMapContext } from '@/controllers/hooks/useMap';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement } from 'delib-npm';
import NodeMenu from './nodeMenu/NodeMenu';
import { updateStatementText } from '@/controllers/db/statements/setStatements';

const nodeStyle = (statementColor: {
	backgroundColor: string;
	color: string;
}) => {
	const style = {
		backgroundColor: statementColor.backgroundColor,
		color: statementColor.color,
		minWidth: '5ch',
		maxWidth: '30ch',
		margin: '0.5rem',
		borderRadius: '5px',
		padding: '.5rem ',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
		fontSize: '1rem',
		textAlign: 'center',
		whiteSpace: 'normal',
	};

	return style;
};

function CustomNode({ data }: NodeProps) {
	const navigate = useNavigate();
	const { result, parentStatement, dimensions } = data;
	const { statementId, statement } = result.top as Statement;

	const { shortVersion: nodeTitle } = statementTitleToDisplay(statement, 80);
	const { mapContext, setMapContext } = useMapContext();
	const selectedId = mapContext?.selectedId ?? null;
	const showBtns = selectedId === statementId;
	const [isEdit, setIsEdit] = useState(false);
	const [title, setTitle] = useState(nodeTitle);
	const [localStatement, setLocalStatement] = useState(result.top);

	const statementColor = useStatementColor({ statement: localStatement });
	const [showMenu, setShowMenu] = useState(false);

	const { isVoted, isChosen, statementType } = result.top;
	useEffect(() => {
		setLocalStatement(result.top);
	}, [isVoted, isChosen, statementType]);

	// Get zoom level from React Flow store
	const zoom = useStore((state) => state.transform[2]);

	// Create refs for buttons that need fixed sizing
	const addChildRef = useRef(null);
	const addSiblingRef = useRef(null);
	const menuButtonRef = useRef(null);
	const menuContainerRef = useRef(null);

	const dynamicNodeStyle = {
		...nodeStyle(statementColor),
		width: dimensions ? `${dimensions.width}px` : 'auto',
		minHeight: 'auto',
	};

	// Apply inverse scale to buttons when zoom changes
	useEffect(() => {
		if (zoom && showBtns) {
			const scale = 1 / zoom; // Inverse scaling factor

			// Apply scaling to all button refs
			if (addChildRef.current) {
				addChildRef.current.style.transform = `scale(${scale})`;
				addChildRef.current.style.transformOrigin = 'center center';
			}

			if (addSiblingRef.current) {
				addSiblingRef.current.style.transform = `scale(${scale})`;
				addSiblingRef.current.style.transformOrigin = 'center center';
			}

			if (menuButtonRef.current) {
				menuButtonRef.current.style.transform = `scale(${scale})`;
				menuButtonRef.current.style.transformOrigin = 'center center';
			}

			if (menuContainerRef.current) {
				// Scale the menu container
				menuContainerRef.current.style.transform = `scale(${scale})`;
				// Set transform origin to bottom right to maintain position
				menuContainerRef.current.style.transformOrigin = 'bottom right';
			}
		}
	}, [zoom, showBtns, showMenu]);

	//effects
	//close menu every time a node is selected
	useEffect(() => {
		setShowMenu(false);
	}, [selectedId]);

	//handlers
	const handleNodeDoubleClick = () => {
		if (isEdit) {
			return;
		}
		navigate(`/statement/${statementId}/chat`, {
			state: { from: window.location.pathname },
		});
	};

	const handleNodeClick = () => {
		if (selectedId === statementId) {
			setMapContext((prev) => ({
				...prev,
				selectedId: null,
			}));
		} else {
			setMapContext((prev) => ({
				...prev,
				selectedId: statementId,
			}));
		}
	};

	const handleAddChildNode = () => {
		setMapContext((prev) => ({
			...prev,
			selectedId: null,
		}));
		setMapContext((prev) => ({
			...prev,
			showModal: true,
			parentStatement: result.top,
		}));
	};

	const handleAddSiblingNode = () => {
		setMapContext((prev) => ({
			...prev,
			showModal: true,
			parentStatement: parentStatement,
		}));
	};

	function handleMenuClick() {
		setShowMenu((prev) => !prev);
	}
	function handleUpdateStatement(e) {
		if (e.key === 'Enter') {
			const title = e.target.value;

			updateStatementText(result.top, title);
			setIsEdit(false);
			setTitle(title);
		}
	}

	return (
		<>
			<button
				onDoubleClick={handleNodeDoubleClick}
				onClick={handleNodeClick}
				data-id={statementId}
				style={{
					...dynamicNodeStyle,
					textAlign: 'center',
					wordBreak: 'break-word',
				}}
				className='node__content'
			>
				{isEdit ? (
					<input
						type='text'
						defaultValue={title}
						onBlur={() => setIsEdit(false)}
						onKeyUp={(e) => handleUpdateStatement(e)}
					/>
				) : (
					title
				)}
			</button>
			{showBtns && (
				<>
					<button
						className='addIcon'
						onClick={handleAddChildNode}
						aria-label='Add child node'
						ref={addChildRef}
						style={{
							position: 'absolute',
							cursor: 'pointer',
							right:
								mapContext.direction === 'TB'
									? 'calc(50% - 0.5rem)'
									: '-.8rem',
							bottom:
								mapContext.direction === 'TB'
									? '-.8rem'
									: 'calc(50% - 0.5rem)',
						}}
					>
						<PlusIcon />
					</button>
					<button
						className='addIcon'
						onClick={handleAddSiblingNode}
						aria-label='Add sibling node'
						ref={addSiblingRef}
						style={{
							position: 'absolute',
							cursor: 'pointer',
							left:
								mapContext.direction === 'TB'
									? '-.5rem'
									: 'calc(50% - 0.5rem)',
							top:
								mapContext.direction === 'TB'
									? 'calc(50% - 0.5rem)'
									: '-.8rem',
						}}
					>
						<PlusIcon />
					</button>
					<button
						aria-label='open settings menu'
						className='addIcon'
						onClick={handleMenuClick}
						ref={menuButtonRef}
						style={{
							position: 'absolute',
							cursor: 'pointer',
							right: '-.5rem',
							top: '-.5rem',
						}}
					>
						<EllipsisIcon />
					</button>
					{showMenu && (
						<div
							ref={menuContainerRef}
							style={{
								position: 'absolute',
								cursor: 'pointer',
								right: '0',
								bottom: '100%',
								marginBottom: '10px', // Fixed distance regardless of zoom
								transformOrigin: 'bottom right',
								zIndex: 999, // Ensure menu appears above other elements
							}}
						>
							<NodeMenu
								setStatement={setLocalStatement}
								setIsEdit={setIsEdit}
								statement={result.top}
								selectedId={selectedId}
								handleAddChildNode={handleAddChildNode}
								handleAddSiblingNode={handleAddSiblingNode}
							/>
						</div>
					)}
				</>
			)}
			<Handle type='target' position={mapContext.targetPosition} />
			<Handle type='source' position={mapContext.sourcePosition} />
		</>
	);
}
export default CustomNode;
