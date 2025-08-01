import { FC, useEffect, useRef } from 'react';
import { useStore } from 'reactflow';
import styles from './NodeMenu.module.scss';
// icons

import DeleteIcon from '@/assets/icons/delete.svg?react';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import ChangeStatementType from '@/assets/icons/changeStatementType.svg?react';
import AddChildStatement from '@/assets/icons/addChildStatement.svg?react';
import AddSiblingStatement from '@/assets/icons/addSiblingStatement.svg?react';

import ClusterButton from './clusterButton/ClusterButton';

import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { Statement, StatementType } from 'delib-npm';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import EnhancedEvaluation from '../../../evaluations/components/evaluation/enhancedEvaluation/EnhancedEvaluation';

interface Props {
	selectedId?: string;
	statement?: Statement;
	setIsEdit?: (isEdit: boolean) => void;
	setStatement?: (s: Statement) => void;
	handleAddChildNode: () => void;
	handleAddSiblingNode: () => void;
}

const NodeMenu: FC<Props> = ({
	selectedId,
	statement,
	setIsEdit,
	setStatement,
	handleAddChildNode,
	handleAddSiblingNode,
}) => {
	const nodeMenuRef = useRef(null);
	const iconsRef = useRef([]);
	// Get the current zoom level from the react-flow store
	const zoom = useStore((state) => state.transform[2]);
	const { isAuthorized } = useAuthorization(selectedId);

	useEffect(() => {
		if (nodeMenuRef.current && zoom) {
			// Apply scaling to the container only, not affecting its children
			// We don't want to scale the container as that affects padding, etc.
			nodeMenuRef.current.style.transform = ''; // Remove transform from container

			// Instead, scale each SVG icon directly
			iconsRef.current.forEach((iconElement) => {
				if (iconElement) {
					// Find the SVG elements inside the buttons
					const svgElement = iconElement.querySelector('svg');
					if (svgElement) {
						// Apply inverse scaling only to the SVG itself
						const scale = 1;

						// Set a fixed size for the SVG based on the zoom level
						// This ensures consistent size while preserving button clickability
						svgElement.style.transform = `scale(${scale})`;
						svgElement.style.transformOrigin = 'center center';
						svgElement.style.display = 'block';
					}
				}
			});
		}
	}, [zoom]);

	// Function to add ref to icons array
	const addToIconsRef = (el) => {
		if (el && !iconsRef.current.includes(el)) {
			iconsRef.current.push(el);
		}
	};
	const deleteNode = async () => {
		await deleteStatementFromDB(statement, isAuthorized);
	};
	const changeNodeStatementType = async () => {
		const newType =
			statement.statementType === StatementType.option
				? StatementType.question
				: StatementType.option;
		const statementChange = await changeStatementType(
			statement,
			newType,
			isAuthorized
		);
		if (!statementChange) return;
		setStatement?.({ ...statement, statementType: newType });
	};
	const editStatement = () => {
		setIsEdit(true);
	};

	return (
		<div className={styles.nodeMenu} ref={nodeMenuRef}>
			<div className={styles.iconContainer}>
				<button ref={addToIconsRef} onClick={handleAddSiblingNode}>
					<AddSiblingStatement />
				</button>
				<button ref={addToIconsRef} onClick={handleAddChildNode}>
					<AddChildStatement />
				</button>
				<button ref={addToIconsRef} onClick={changeNodeStatementType}>
					<ChangeStatementType />
				</button>
				<button
					className={styles.deleteButton}
					ref={addToIconsRef}
					onClick={deleteNode}
				>
					<DeleteIcon />
				</button>

				<button
					className={styles.editBtn}
					ref={addToIconsRef}
					onClick={editStatement}
				>
					<EditIcon />
				</button>
				<ClusterButton
					selectedId={selectedId}
					addToIconsRef={addToIconsRef}
				/>
			</div>
			{statement.statementType === StatementType.option && (
				<div className={styles.rateMenuContainer}>
					<EnhancedEvaluation
						statement={statement}
					/>
				</div>
			)}
		</div>
	);
};

export default NodeMenu;
