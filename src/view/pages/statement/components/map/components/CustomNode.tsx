import React, { useEffect, useState, useRef, useCallback } from 'react';
// Third party
import { useNavigate } from 'react-router';
import { Handle, NodeProps, useReactFlow } from 'reactflow';
import clsx from 'clsx';
// Icons
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
// Statements functions
import { updateStatementText } from '@/controllers/db/statements/setStatements';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useMapContext } from '@/controllers/hooks/useMap';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement, StatementType } from '@freedi/shared-types';
import NodeMenu from './nodeMenu/NodeMenu';
// Styles
import styles from './CustomNode.module.scss';

const nodeStyle = (statementColor: { backgroundColor: string; color: string }) => ({
	backgroundColor: statementColor.backgroundColor,
	color: statementColor.color,
	minWidth: '5ch',
	maxWidth: '30ch',
	margin: '0.2rem',
	borderRadius: '5px',
	padding: '.5rem',
	display: 'flex',
	justifyContent: 'center',
	alignItems: 'center',
	fontSize: '1rem',
	textAlign: 'center' as const,
	whiteSpace: 'normal' as const,
});

function CustomNode({ data }: NodeProps) {
	const navigate = useNavigate();
	const { result, parentStatement, dimensions } = data;
	const { statementId, statement } = result.top as Statement;

	// Get zoom from React Flow
	const { getZoom } = useReactFlow();
	const zoom = getZoom();

	const { mapContext, setMapContext } = useMapContext();
	const selectedId = mapContext?.selectedId ?? null;
	const isSelected = selectedId === statementId;
	const [isEdit, setIsEdit] = useState(false);
	const [localStatement, setLocalStatement] = useState(result.top);
	const [wordLength, setWordLength] = useState<null | number>(null);

	const statementColor = useStatementColor({ statement: localStatement });
	const [showMenu, setShowMenu] = useState(false);

	const { shortVersion: title } = statementTitleToDisplay(statement, 100);

	const { isVoted, isChosen, statementType } = result.top;

	// Check if we can add child nodes (options cannot have children)
	const canAddChild = result.top.statementType !== StatementType.option;
	const isLR = mapContext.direction === 'LR';

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

	// Apply inverse scale to buttons when zoom changes
	useEffect(() => {
		if (zoom && isSelected) {
			const scale = 1 / zoom;

			const refs = [addChildRef, addSiblingRef, menuButtonRef, menuContainerRef];
			refs.forEach((ref) => {
				if (ref.current) {
					ref.current.style.transform = `scale(${scale})`;
					ref.current.style.transformOrigin = 'center center';
				}
			});
		}
	}, [zoom, isSelected, showMenu, mapContext.direction]);

	// Close menu every time a node is selected
	useEffect(() => {
		setShowMenu(false);
	}, [selectedId]);

	// Handlers
	const handleNodeDoubleClick = () => {
		if (isEdit) {
			return;
		}
		navigate(`/statement/${statementId}/chat`, {
			state: { from: window.location.pathname },
		});
	};

	const handleNodeClick = () => {
		setMapContext((prev) => ({
			...prev,
			selectedId: isSelected ? null : statementId,
		}));
	};

	const handleAddChildNode = useCallback(() => {
		setMapContext((prev) => ({
			...prev,
			selectedId: null,
			showModal: true,
			parentStatement: result.top,
		}));
	}, [result.top, setMapContext]);

	const handleAddSiblingNode = useCallback(() => {
		setMapContext((prev) => ({
			...prev,
			showModal: true,
			parentStatement: parentStatement,
		}));
	}, [parentStatement, setMapContext]);

	// Keyboard shortcuts: Tab = add child, Enter = add sibling
	useEffect(() => {
		if (!isSelected || isEdit) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Tab') {
				e.preventDefault();
				if (canAddChild) {
					handleAddChildNode();
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				handleAddSiblingNode();
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isSelected, isEdit, canAddChild, handleAddChildNode, handleAddSiblingNode]);

	function handleMenuClick() {
		setShowMenu((prev) => !prev);
	}

	function handleUpdateStatement(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === 'Enter') {
			const title = (e.target as HTMLTextAreaElement).value;
			updateStatementText(result.top, title);
			setIsEdit(false);
			setWordLength(null);
		}
	}

	function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		const textLength = e.target.value.length;
		setWordLength(textLength);
	}

	return (
		<div className={styles.nodeContainer}>
			<button
				onDoubleClick={handleNodeDoubleClick}
				onClick={handleNodeClick}
				data-id={statementId}
				className={clsx(
					styles.nodeContent,
					isSelected && styles.nodeContentSelected,
					data.animate && styles.trembleAnimate,
				)}
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
						onChange={(e) => onTextChange(e)}
						onKeyUp={(e) => handleUpdateStatement(e)}
					/>
				) : (
					title
				)}
			</button>
			{isSelected && (
				<div className={styles.nodeActions}>
					{/* Add child button */}
					{canAddChild && (
						<button
							className={clsx(
								styles.addButton,
								isLR ? styles.addButtonChildLR : styles.addButtonChildTB,
							)}
							onClick={handleAddChildNode}
							aria-label="Add child node (Tab)"
							ref={addChildRef}
						>
							+
						</button>
					)}

					{/* Add sibling button */}
					<button
						className={clsx(
							styles.addButton,
							isLR ? styles.addButtonSiblingLR : styles.addButtonSiblingTB,
						)}
						onClick={handleAddSiblingNode}
						aria-label="Add sibling node (Enter)"
						ref={addSiblingRef}
					>
						+
					</button>

					{/* Menu button */}
					<button
						className={styles.menuButton}
						aria-label="Open settings menu"
						onClick={handleMenuClick}
						ref={menuButtonRef}
					>
						<EllipsisIcon />
					</button>

					{/* Keyboard shortcut hints */}
					<div
						className={clsx(
							styles.keyboardHints,
							isLR ? styles.keyboardHintsLR : styles.keyboardHintsTB,
						)}
					>
						{canAddChild && (
							<div className={styles.keyboardHint}>
								<span className={styles.keyboardKey}>Tab</span>
								<span className={styles.keyboardHintText}>to create child</span>
							</div>
						)}
						<div className={styles.keyboardHint}>
							<span className={styles.keyboardKey}>Enter</span>
							<span className={styles.keyboardHintText}>to create sibling</span>
						</div>
					</div>

					{/* Context menu */}
					{showMenu && (
						<div
							ref={menuContainerRef}
							className={clsx(
								styles.menuContainer,
								isLR ? styles.menuContainerLR : styles.menuContainerTB,
							)}
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
