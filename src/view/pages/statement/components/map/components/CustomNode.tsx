import { useEffect, useRef, useState } from 'react';
// Third party
import { useNavigate } from 'react-router';
import { Handle, NodeProps, useStore } from 'reactflow';
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
import { Statement, StatementType } from 'delib-npm';
import NodeMenu from './nodeMenu/NodeMenu';
// Styles
import styles from './CustomNode.module.scss';

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

function CustomNode({ data }: NodeProps) {
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

	// Check if we can add child nodes (options cannot have children)
	const canAddChild = result.top.statementType !== StatementType.option;
	useEffect(() => {
		setLocalStatement(result.top);
	}, [isVoted, isChosen, statementType]);

	// State for tooltips
	const [hoveredButton, setHoveredButton] = useState<string | null>(null);

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
				className={clsx(
					styles.nodeContent,
					data.animate && styles.trembleAnimate
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
								className={clsx(
									styles.nodeFab,
									styles.addChild,
									mapContext.direction === 'TB'
										? styles.addChildTB
										: styles.addChildLR
								)}
								onClick={handleAddChildNode}
								aria-label='Add child node'
								title='Add child node'
								onMouseEnter={() => setHoveredButton('child')}
								onMouseLeave={() => setHoveredButton(null)}
							>
								<AddChildIcon />
							</button>
							{hoveredButton === 'child' && (
								<div className={clsx(styles.tooltip, styles.bottom, styles.visible)}>
									Add child node
								</div>
							)}
						</>
					)}
					<>
						<button
							className={clsx(
								styles.nodeFab,
								styles.addSibling,
								mapContext.direction === 'TB'
									? styles.addSiblingTB
									: styles.addSiblingLR
							)}
							onClick={handleAddSiblingNode}
							aria-label='Add sibling node'
							title='Add sibling node'
							onMouseEnter={() => setHoveredButton('sibling')}
							onMouseLeave={() => setHoveredButton(null)}
						>
							<AddSiblingIcon />
						</button>
						{hoveredButton === 'sibling' && (
							<div className={clsx(styles.tooltip, styles.left, styles.visible)}>
								Add sibling node
							</div>
						)}
					</>
					<button
						aria-label='More options'
						aria-expanded={showMenu}
						className={styles.menuButton}
						onClick={handleMenuClick}
						onMouseEnter={() => setHoveredButton('menu')}
						onMouseLeave={() => setHoveredButton(null)}
					>
						<EllipsisIcon />
					</button>
					{hoveredButton === 'menu' && (
						<div className={clsx(styles.tooltip, styles.top, styles.visible)}>
							More options
						</div>
					)}
					{showMenu && (
						<div className={styles.menuContainer}>
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
			<Handle type='target' position={mapContext.targetPosition} />
			<Handle type='source' position={mapContext.sourcePosition} />
		</div>
	);
}
export default CustomNode;
