import { useEffect, useState, useRef } from 'react';
// Third party
import { useNavigate } from 'react-router';
import { Handle, NodeProps, useReactFlow } from 'reactflow';
import clsx from 'clsx';
// Hooks
// Icons
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import AddChildIcon from '@/assets/icons/addChildIcon.svg?react';
import AddSiblingIcon from '@/assets/icons/addSiblingIcon.svg?react';
// Statements functions
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useMapContext } from '@/controllers/hooks/useMap';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement, StatementType } from '@freedi/shared-types';
import NodeMenu from './nodeMenu/NodeMenu';
// Styles
import styles from './CustomNode.module.scss';

const nodeStyle = (statementColor: { backgroundColor: string; color: string }) => {
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

function CustomNode({ data }: NodeProps) {
	const navigate = useNavigate();
	const { result, parentStatement, dimensions } = data;
	const { statementId, statement } = result.top as Statement;

	// Get zoom from React Flow
	const { getZoom } = useReactFlow();
	const zoom = getZoom();

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

	// Check if we can add child nodes (options cannot have children)
	const canAddChild = result.top.statementType !== StatementType.option;
	useEffect(() => {
		setLocalStatement(result.top);
	}, [isVoted, isChosen, statementType]);

	// Create refs for the buttons that need scaling
	const addChildRef = useRef<HTMLButtonElement>(null);
	const addSiblingRef = useRef<HTMLButtonElement>(null);
	const menuButtonRef = useRef<HTMLButtonElement>(null);
	const menuContainerRef = useRef<HTMLDivElement>(null);

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

	// Apply inverse scale to buttons when zoom changes to maintain ~32px size
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
				// Set transform origin based on orientation to avoid hiding buttons
				if (mapContext.direction === 'TB') {
					menuContainerRef.current.style.transformOrigin = 'bottom right';
				} else {
					// In horizontal mode, position menu on the left to avoid top-center sibling button
					menuContainerRef.current.style.transformOrigin = 'top right';
				}
			}
		}
	}, [zoom, showBtns, showMenu, mapContext.direction]);

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
			setWordLength(null);
		}
	}
	function onTextChang(e) {
		const textLength = e.target.value.length;
		setWordLength(textLength);
	}

	return (
		<div className={styles.nodeContainer}>
			<button
				onDoubleClick={handleNodeDoubleClick}
				onClick={handleNodeClick}
				data-id={statementId}
				className={clsx(styles.nodeContent, data.animate && styles.trembleAnimate)}
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
						onChange={(e) => onTextChang(e)}
						onKeyUp={(e) => handleUpdateStatement(e)}
					/>
				) : (
					title
				)}
			</button>
			{showBtns && (
				<div className={styles.nodeActions}>
					{canAddChild && (
						<>
							<button
								className="addIcon"
								onClick={handleAddChildNode}
								aria-label="Add child node"
								ref={addChildRef}
								style={{
									position: 'absolute',
									cursor: 'pointer',
									right: mapContext.direction === 'TB' ? 'calc(50% - 16px)' : '-16px',
									bottom: mapContext.direction === 'TB' ? '-16px' : 'calc(50% - 16px)',
								}}
							>
								<AddChildIcon />
							</button>
							<button
								className="addIcon"
								onClick={handleAddSiblingNode}
								aria-label="Add sibling node"
								ref={addSiblingRef}
								style={{
									position: 'absolute',
									cursor: 'pointer',
									left: mapContext.direction === 'TB' ? '-16px' : 'calc(50% - 16px)',
									top: mapContext.direction === 'TB' ? 'calc(50% - 16px)' : '-16px',
								}}
							>
								<AddSiblingIcon />
							</button>
						</>
					)}
					<button
						aria-label="open settings menu"
						className="addIcon"
						onClick={handleMenuClick}
						ref={menuButtonRef}
						style={{
							position: 'absolute',
							cursor: 'pointer',
							right: '-16px',
							top: '-16px',
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
								right: mapContext.direction === 'TB' ? '0' : 'auto',
								left: mapContext.direction === 'LR' ? '0' : 'auto',
								bottom: mapContext.direction === 'TB' ? '100%' : 'auto',
								top: mapContext.direction === 'LR' ? '100%' : 'auto',
								marginBottom: mapContext.direction === 'TB' ? '10px' : '0',
								marginTop: mapContext.direction === 'LR' ? '10px' : '0',
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
				</div>
			)}
			<Handle type="target" position={mapContext.targetPosition} />
			<Handle type="source" position={mapContext.sourcePosition} />
		</div>
	);
}
export default CustomNode;
