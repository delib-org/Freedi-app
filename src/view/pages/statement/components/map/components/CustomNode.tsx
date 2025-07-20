import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Handle, NodeProps, useStore } from 'reactflow';
import '../mapHelpers/reactFlow.scss';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useMapContext } from '@/controllers/hooks/useMap';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement } from 'delib-npm';
import NodeMenu from './nodeMenu/NodeMenu';

const nodeStyle = (statementColor: {
	backgroundColor: string;
	color: string;
}) => {
	const style = {
		backgroundColor: statementColor.backgroundColor,
		color: statementColor.color,
		minWidth: '5ch',
		maxWidth: '30ch',
		margin: '0.2rem',
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

function CustomNode(props: NodeProps) {
	const { id, data } = props;

	// ✅ Get the passed-in trigger function safely from node.data
	const setLastEditedNodeId = data.setLastEditedNodeId as ((id: string) => void) | undefined;

	const navigate = useNavigate();
	const { result, parentStatement, dimensions } = data;
	const { statementId, statement } = result.top as Statement;

	const { mapContext, setMapContext } = useMapContext();
	const selectedId = mapContext?.selectedId ?? null;
	const showBtns = selectedId === statementId;
	const [isEdit, setIsEdit] = useState(false);
	const [localStatement, setLocalStatement] = useState(result.top);
	const [wordLength, setWordLength] = useState<null | number>(null);

	const statementColor = useStatementColor({ statement: localStatement });
	const [showMenu, setShowMenu] = useState(false);
	const { shortVersion: title } = statementTitleToDisplay(statement, 100);
	const { isVoted, isChosen, statementType } = result.top;

	useEffect(() => {
		setLocalStatement(result.top);
	}, [isVoted, isChosen, statementType]);

	const zoom = useStore((state) => state.transform[2]);

	const addChildRef = useRef(null);
	const addSiblingRef = useRef(null);
	const menuButtonRef = useRef(null);
	const menuContainerRef = useRef(null);

	const getNodeWidth = () => {
		if (isEdit && wordLength) {
			return `${Math.max(wordLength * 8, 100)}px`;
		}
		if (dimensions) {
			return `${dimensions.width}px`;
		}

		return 'auto';
	};

	const nodeWidth = getNodeWidth();

	const dynamicNodeStyle = {
		...nodeStyle(statementColor),
		width: nodeWidth,
		minHeight: 'auto',
	};

	useEffect(() => {
		if (zoom && showBtns) {
			const scale = 1 / zoom;

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
				menuContainerRef.current.style.transform = `scale(${scale})`;
				menuContainerRef.current.style.transformOrigin = 'bottom right';
			}
		}
	}, [zoom, showBtns, showMenu]);

	useEffect(() => {
		setShowMenu(false);
	}, [selectedId]);

	const handleNodeDoubleClick = () => {
		if (!isEdit) {
			navigate(`/statement/${statementId}/chat`, {
				state: { from: window.location.pathname },
			});
		}
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

	const handleMenuClick = () => {
		setShowMenu((prev) => !prev);
	};

	function handleUpdateStatement(e) {
		if (e.key === 'Enter') {
			const title = e.target.value.trim();
			if (title) {
				updateStatementText(result.top, title);
				setIsEdit(false);
				setWordLength(null);

				// ✅ Trigger animation for this edited node
				setLastEditedNodeId?.(id);
			}
		}
	}

	function onTextChang(e) {
		const textLength = e.target.value.length;
		setWordLength(textLength);
	}

	return (
		<div className={`node__container`}>
			<button
				onDoubleClick={handleNodeDoubleClick}
				onClick={handleNodeClick}
				data-id={statementId}
				className={`node__content ${data.animate ? 'tremble-animate' : ''}`}
				style={{
					...dynamicNodeStyle,
					textAlign: 'center',
					wordBreak: 'break-word',
				}}
			>
				{isEdit ? (
					<textarea
						defaultValue={title}
						onBlur={() => setIsEdit(false)}
						onChange={onTextChang}
						onKeyUp={handleUpdateStatement}
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
							right: mapContext.direction === 'TB' ? 'calc(50% - 0.5rem)' : '-.8rem',
							bottom: mapContext.direction === 'TB' ? '-.8rem' : 'calc(50% - 0.5rem)',
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
							left: mapContext.direction === 'TB' ? '-.5rem' : 'calc(50% - 0.5rem)',
							top: mapContext.direction === 'TB' ? 'calc(50% - 0.5rem)' : '-.8rem',
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
								marginBottom: '10px',
								transformOrigin: 'bottom right',
								zIndex: 999,
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
		</div>
	);
}

export default CustomNode;
