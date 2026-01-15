import React, { useEffect, useRef, useCallback, useState, memo } from 'react';
import MindElixir, { MindElixirInstance, NodeObj } from 'mind-elixir';
import { useNavigate } from 'react-router-dom';
import { Results, Statement, StatementType, Role } from '@freedi/shared-types';
import { useMapContext } from '@/controllers/hooks/useMap';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { updateStatementParents } from '@/controllers/db/statements/setStatements';
import Modal from '@/view/components/modal/Modal';
import {
	toMindElixirData,
	FreediNodeObj,
	canHaveChildren,
	getStyleForType,
} from '../mapHelpers/mindElixirTransform';
import { FilterType } from '@/controllers/general/sorting';
import styles from './MindElixirMap.module.scss';

// Icons
import MapCancelIcon from '@/assets/icons/MapCancelIcon.svg';
import MapHamburgerIcon from '@/assets/icons/MapHamburgerIcon.svg';
import MapHorizontalLayoutIcon from '@/assets/icons/MapHorizontalLayoutIcon.svg';
import MapVerticalLayoutIcon from '@/assets/icons/MapVerticalLayoutIcon.svg';
import MapRestoreIcon from '@/assets/icons/MapRestoreIcon.svg';
import MapSaveIcon from '@/assets/icons/MapSaveIcon.svg';

interface Props {
	descendants: Results;
	filterBy: FilterType;
	isAdmin: boolean;
}

/**
 * Filter results to show only voted/chosen options
 */
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

/**
 * Find a statement by ID in the Results tree
 */
function findStatementById(results: Results, id: string): Statement | null {
	if (results.top.statementId === id) return results.top;
	for (const sub of results.sub) {
		const found = findStatementById(sub, id);
		if (found) return found;
	}
	return null;
}

function MindElixirMap({ descendants, isAdmin, filterBy }: Readonly<Props>) {
	const navigate = useNavigate();
	const containerRef = useRef<HTMLDivElement>(null);
	const mindRef = useRef<MindElixirInstance | null>(null);
	const { mapContext, setMapContext } = useMapContext();
	const { t } = useTranslation();

	// State for move modal
	const [draggedNodeId, setDraggedNodeId] = useState('');
	const [intersectedNodeId, setIntersectedNodeId] = useState('');

	// State for controls panel
	const [isButtonVisible, setIsButtonVisible] = useState(false);
	const [direction, setDirection] = useState<'SIDE' | 'LEFT' | 'RIGHT'>('SIDE');

	// Apply filter if needed
	const filteredDescendants =
		filterBy === FilterType.questionsResults
			? filterDescendants(descendants)
			: descendants;

	const data = filteredDescendants ? toMindElixirData(filteredDescendants) : null;

	// Initialize MindElixir
	useEffect(() => {
		if (!containerRef.current || !data) return;

		// Create MindElixir instance
		const mind = new MindElixir({
			el: containerRef.current,
			direction: MindElixir.SIDE,
			draggable: isAdmin, // Only admins can drag nodes
			contextMenu: true,
			toolBar: false, // We'll use our own toolbar
			nodeMenu: true,
			keypress: true,
			editable: true, // Allow inline editing
			allowUndo: true,
			overflowHidden: false,
		});

		// Initialize with data
		mind.init(data);

		// Store reference
		mindRef.current = mind;

		// Center the view
		mind.toCenter();

		// Event: Node selected
		mind.bus.addListener('selectNode', (node: NodeObj) => {
			setMapContext((prev) => ({
				...prev,
				selectedId: node.id,
			}));
		});

		// Event: Node double-clicked - navigate to statement
		mind.bus.addListener('dblclickNode', (node: NodeObj) => {
			navigate(`/statement/${node.id}/chat`, {
				state: { from: window.location.pathname },
			});
		});

		// Event: Before adding a node - intercept to show our modal
		mind.bus.addListener('beforeAddChild', (node: NodeObj) => {
			// Find the statement for this node
			const parentStatement = findStatementById(descendants, node.id);

			// Options cannot have children
			if (parentStatement && !canHaveChildren(parentStatement.statementType)) {
				return false; // Prevent adding
			}

			// Show our create modal instead
			setMapContext((prev) => ({
				...prev,
				showModal: true,
				parentStatement: parentStatement || descendants.top,
			}));

			return false; // Prevent MindElixir from adding directly
		});

		// Event: Before adding sibling
		mind.bus.addListener('beforeAddSibling', (node: NodeObj) => {
			// Find the parent statement
			const currentStatement = findStatementById(descendants, node.id);
			const parentStatement = currentStatement?.parentId
				? findStatementById(descendants, currentStatement.parentId)
				: descendants.top;

			// Show our create modal
			setMapContext((prev) => ({
				...prev,
				showModal: true,
				parentStatement: parentStatement || descendants.top,
			}));

			return false; // Prevent MindElixir from adding directly
		});

		// Event: Node moved (drag & drop) - admin only
		if (isAdmin) {
			mind.bus.addListener('moveNode', (fromNode: NodeObj, toNode: NodeObj) => {
				// Store IDs for the move modal
				setDraggedNodeId(fromNode.id);
				setIntersectedNodeId(toNode.id);

				// Show confirmation modal
				setMapContext((prev) => ({
					...prev,
					moveStatementModal: true,
				}));

				return false; // Prevent immediate move, wait for confirmation
			});
		}

		// Cleanup
		return () => {
			// MindElixir doesn't have a destroy method, but we can clean up the container
			if (containerRef.current) {
				containerRef.current.innerHTML = '';
			}
			mindRef.current = null;
		};
	}, [data?.nodeData.id, isAdmin]); // Only reinit when root changes or admin status changes

	// Update data when descendants change
	useEffect(() => {
		if (!mindRef.current || !data) return;

		// Refresh the mind map with new data
		try {
			mindRef.current.refresh(data);
		} catch {
			// If refresh fails, reinitialize
			mindRef.current.init(data);
		}
	}, [data]);

	// Handle layout direction change
	const handleLayoutChange = useCallback((newDirection: 'SIDE' | 'LEFT' | 'RIGHT') => {
		if (!mindRef.current) return;
		setDirection(newDirection);

		// MindElixir supports changing direction
		const directionValue =
			newDirection === 'SIDE'
				? MindElixir.SIDE
				: newDirection === 'LEFT'
					? MindElixir.LEFT
					: MindElixir.RIGHT;

		mindRef.current.changeDirection(directionValue);
	}, []);

	// Handle move statement confirmation
	const handleMoveStatement = async (move: boolean) => {
		if (move && draggedNodeId && intersectedNodeId) {
			const [draggedStatement, newParentStatement] = await Promise.all([
				getStatementFromDB(draggedNodeId),
				getStatementFromDB(intersectedNodeId),
			]);

			if (draggedStatement && newParentStatement) {
				await updateStatementParents(draggedStatement, newParentStatement);
			}
		}

		// Close modal
		setMapContext((prev) => ({
			...prev,
			moveStatementModal: false,
		}));

		// Clear stored IDs
		setDraggedNodeId('');
		setIntersectedNodeId('');
	};

	// Save current state to localStorage
	const handleSave = useCallback(() => {
		if (!mindRef.current) return;
		const data = mindRef.current.getData();
		localStorage.setItem('mindElixirData', JSON.stringify(data));
	}, []);

	// Restore state from localStorage
	const handleRestore = useCallback(() => {
		if (!mindRef.current) return;
		const savedData = localStorage.getItem('mindElixirData');
		if (savedData) {
			try {
				const parsedData = JSON.parse(savedData);
				mindRef.current.init(parsedData);
			} catch {
				console.error('Failed to restore mind map data');
			}
		}
	}, []);

	// Handle add sibling from toolbar
	const handleAddSiblingNode = useCallback(() => {
		const selectedId = mapContext?.selectedId;
		const hoveredStatement = selectedId
			? findStatementById(descendants, selectedId)
			: descendants.top;

		setMapContext((prev) => ({
			...prev,
			showModal: true,
			parentStatement: hoveredStatement ?? descendants.top,
		}));
	}, [mapContext?.selectedId, descendants, setMapContext]);

	if (!data) {
		return (
			<div className={styles.loading}>
				<div className={styles.spinner}></div>
				<div>{t('Loading mind map...')}</div>
			</div>
		);
	}

	return (
		<>
			<div ref={containerRef} className={styles.mindElixirContainer} />

			{/* Controls Panel */}
			<div className={styles.controlsPanel}>
				{!isButtonVisible ? (
					<button
						className={styles.mainButton}
						onClick={() => setIsButtonVisible(true)}
					>
						<img src={MapHamburgerIcon} alt={t('Menu')} />
					</button>
				) : (
					<div className={styles.arcButtons}>
						<button onClick={() => setIsButtonVisible(false)}>
							<img src={MapCancelIcon} alt={t('Close')} />
						</button>
						<button
							onClick={() => handleLayoutChange('SIDE')}
							title={t('Side layout')}
						>
							<img src={MapVerticalLayoutIcon} alt={t('Side layout')} />
						</button>
						<button
							onClick={() => handleLayoutChange('LEFT')}
							title={t('Left layout')}
						>
							<img src={MapHorizontalLayoutIcon} alt={t('Left layout')} />
						</button>
						<button onClick={handleRestore} title={t('Restore')}>
							<img src={MapRestoreIcon} alt={t('Restore')} />
						</button>
						<button onClick={handleAddSiblingNode} title={t('Add')}>
							<img src={MapSaveIcon} alt={t('Add')} />
						</button>
					</div>
				)}
			</div>

			{/* Move Statement Confirmation Modal */}
			{mapContext.moveStatementModal && (
				<Modal>
					<div className={styles.moveModal}>
						<h1>{t('Are you sure you want to move statement here?')}</h1>
						<div className={styles.btnBox}>
							<button
								onClick={() => handleMoveStatement(true)}
								className="btn btn--large btn--add"
							>
								{t('Yes')}
							</button>
							<button
								onClick={() => handleMoveStatement(false)}
								className="btn btn--large btn--disagree"
							>
								{t('No')}
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}

export default memo(MindElixirMap);
