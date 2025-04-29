import { useEffect, useState } from 'react';
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
		backgroundColor:
			parentStatement === 'top' && !parentStatement
				? '#b893e7'
				: statementColor.backgroundColor,
		color: statementColor.color,
		minWidth: '5ch',
		maxWidth: '30ch',
		margin: '0.5rem',
		borderRadius: '5px',
		padding: '.9rem ',
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
		fontSize: '1rem',
		textAlign: 'center',
		whiteSpace: 'normal',
	};

	return style;
};

export default function CustomNode({ data }: NodeProps) {
	const navigate = useNavigate();
	const { result, parentStatement, dimensions } = data;
	const { statementId, statement } = result.top as Statement;
	const { shortVersion: nodeTitle } = statementTitleToDisplay(statement, 80);
	const statementColor = useStatementColor({ statement: result.top });
	const { mapContext, setMapContext } = useMapContext();
	const [showBtns, setShowBtns] = useState(false);

	const dynamicNodeStyle = {
		...nodeStyle(parentStatement, statementColor),
		width: dimensions ? `${dimensions.width}px` : 'auto',
		minHeight: 'auto',
	};

	const handleNodeClick = () => {
		if (!showBtns) {
			setShowBtns((prev) => !prev);
		} else {
			navigate(`/statement/${statementId}/chat`, {
				state: { from: window.location.pathname },
			});
		}
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

	useEffect(() => {
		if (!mapContext.showModal) setShowBtns(false);
	}, [mapContext.showModal]);

	return (
		<>
			<button
				onClick={handleNodeClick}
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
