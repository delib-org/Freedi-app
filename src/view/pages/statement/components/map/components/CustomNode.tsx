import React from 'react';
// Third party
import { useNavigate } from 'react-router';
import { Handle, NodeProps } from 'reactflow';
// Hooks
// Icons
import PlusIcon from '@/assets/icons/plusIcon.svg?react';
// Statements functions
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useMapContext } from '@/controllers/hooks/useMap';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement } from 'delib-npm';

const nodeStyle = (
	parentStatement: Statement | 'top',
	statementColor: { backgroundColor: string; color: string }
) => {
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
	const statementColor = useStatementColor({ statement: result.top });
	const { mapContext, setMapContext } = useMapContext();
	const hoveredId = mapContext?.hoveredId ?? null;
	const showBtns = hoveredId === statementId;

	const dynamicNodeStyle = {
		...nodeStyle(parentStatement, statementColor),
		width: dimensions ? `${dimensions.width}px` : 'auto',
		minHeight: 'auto',
	};

	const handleNodeHover = () => {
		if (hoveredId !== statementId) {
			setMapContext((prev) => ({
				...prev,
				hoveredId: statementId,
			}));
		}
	};

	const handleNodeDoubleClick = () => {
		navigate(`/statement/${statementId}/chat`, {
			state: { from: window.location.pathname },
		});
	};

	const handleAddChildNode = () => {
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

	return (
		<>
			<button
				onDoubleClick={handleNodeDoubleClick}
				onMouseEnter={handleNodeHover}
				data-id={statementId}
				style={{
					...dynamicNodeStyle,
					textAlign: 'center',
					wordBreak: 'break-word',
				}}
				className='node__content'
			>
				{nodeTitle}
			</button>
			{showBtns && (
				<>
					<button
						className='addIcon'
						onClick={handleAddChildNode}
						aria-label='Add child node'
						style={{
							position: 'absolute',
							cursor: 'pointer',
							right:
								mapContext.direction === 'TB' ? 0 : '-1.8rem',
							bottom:
								mapContext.direction === 'TB' ? '-1.8rem' : 0,
						}}
					>
						<PlusIcon />
					</button>
					<button
						className='addIcon'
						onClick={handleAddSiblingNode}
						aria-label='Add sibling node'
						style={{
							position: 'absolute',
							cursor: 'pointer',
							left: mapContext.direction === 'TB' ? '-1.8rem' : 0,
							top: mapContext.direction === 'TB' ? 0 : '-1.8rem',
						}}
					>
						<PlusIcon />
					</button>
				</>
			)}
			<Handle type='target' position={mapContext.targetPosition} />
			<Handle type='source' position={mapContext.sourcePosition} />
		</>
	);
}
export default React.memo(CustomNode, (prevProps, nextProps) => {
	// Check if mapContext exists before accessing hoveredId
	const prevMapContext = prevProps.data.mapContext ?? {};
	const nextMapContext = nextProps.data.mapContext ?? {};

	const prevId = prevProps.data.result.top.statement.statementId;
	const nextId = nextProps.data.result.top.statement.statementId;

	// Only re-render if this specific node's hover state changed
	const prevHovered = prevMapContext.hoveredId === prevId;
	const nextHovered = nextMapContext.hoveredId === nextId;

	return prevHovered === nextHovered;
});
