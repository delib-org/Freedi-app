import React, { useEffect, useRef, useCallback, useState, memo } from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, NodeObj, Operation } from 'mind-elixir';
import { useNavigate } from 'react-router';
import { Results, Statement, StatementType } from '@freedi/shared-types';
import { useMapContext } from '@/controllers/hooks/useMap';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { updateStatementParents } from '@/controllers/db/statements/setStatements';
import Modal from '@/view/components/modal/Modal';
import { toMindElixirData, canHaveChildren } from '../mapHelpers/mindElixirTransform';
import {
	createMindMapChild,
	createMindMapSibling,
	updateMindMapNodeText,
} from '../mapHelpers/mindMapStatements';
import { FilterType } from '@/controllers/general/sorting';
import styles from './MindElixirMap.module.scss';
import { logError } from '@/utils/errorHandling';

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

	// Double click handler ref
	const lastClickRef = useRef<{ time: number; nodeId: string }>({ time: 0, nodeId: '' });

	// Ref to hold current descendants for keyboard handler (avoids re-creating MindElixir on data change)
	const descendantsRef = useRef<Results>(descendants);
	descendantsRef.current = descendants;

	// Apply filter if needed
	const filteredDescendants =
		filterBy === FilterType.questionsResults ? filterDescendants(descendants) : descendants;

	const data = filteredDescendants ? toMindElixirData(filteredDescendants) : null;

	// Initialize MindElixir
	useEffect(() => {
		if (!containerRef.current || !data) return;

		// Wait for container to be properly sized
		const container = containerRef.current;
		const rect = container.getBoundingClientRect();

		// If container has no size yet, wait and retry
		if (rect.width < 100 || rect.height < 100) {
			const timeoutId = setTimeout(() => {
				// Force re-render by triggering state update
				if (mindRef.current) {
					mindRef.current.toCenter();
				}
			}, 100);

			return () => clearTimeout(timeoutId);
		}

		// Create MindElixir instance
		const mind = new MindElixir({
			el: container,
			direction: MindElixir.SIDE,
			draggable: isAdmin, // Only admins can drag nodes
			contextMenu: true,
			toolBar: false, // We'll use our own toolbar
			keypress: false, // We handle keyboard shortcuts ourselves
			editable: true, // Allow inline editing
			allowUndo: true,
			overflowHidden: false,
			// Intercept operations before they happen
			before: {
				addChild: async () => {
					// We handle child creation via Tab key
					return false;
				},
				insertSibling: async () => {
					// We handle sibling creation via Enter key
					return false;
				},
			},
		});

		// Initialize with data
		mind.init(data);

		// Store reference
		mindRef.current = mind;

		// Use RIGHT layout for compact single-direction tree, then center
		setTimeout(() => {
			if (mindRef.current) {
				mindRef.current.initRight();
				mindRef.current.toCenter();
			}
		}, 100);

		// Event: Node selected
		mind.bus.addListener('selectNewNode', (nodeObj: NodeObj) => {
			// Check for double click
			const now = Date.now();
			const lastClick = lastClickRef.current;

			if (lastClick.nodeId === nodeObj.id && now - lastClick.time < 300) {
				// Double click detected - navigate to statement
				navigate(`/statement/${nodeObj.id}/chat`, {
					state: { from: window.location.pathname },
				});
			}

			// Update last click
			lastClickRef.current = { time: now, nodeId: nodeObj.id };

			// Update selected ID in context
			setMapContext((prev) => ({
				...prev,
				selectedId: nodeObj.id,
			}));
		});

		// Event: Operation happened (for tracking node moves and text edits)
		mind.bus.addListener('operation', async (operation: Operation) => {
			if (isAdmin && operation.name === 'moveNodeIn') {
				// A node was moved - store IDs for confirmation
				if ('obj' in operation && 'toObj' in operation) {
					const typedOp = operation as { obj: NodeObj; toObj: NodeObj; name: string };
					setDraggedNodeId(typedOp.obj.id);
					setIntersectedNodeId(typedOp.toObj.id);

					// Show confirmation modal
					setMapContext((prev) => ({
						...prev,
						moveStatementModal: true,
					}));
				}
			}

			// Handle inline text editing
			if (operation.name === 'finishEdit' && 'obj' in operation && 'origin' in operation) {
				const typedOp = operation as { obj: NodeObj; origin: string; name: string };
				const statement = findStatementById(descendantsRef.current, typedOp.obj.id);
				if (statement && typedOp.obj.topic !== typedOp.origin) {
					await updateMindMapNodeText({
						statement,
						newText: typedOp.obj.topic,
					});
				}
			}
		});

		// Keyboard handler for Tab (child) and Enter (sibling)
		const handleKeyDown = async (e: KeyboardEvent) => {
			if (!mindRef.current?.currentNode) return;

			const currentNode = mindRef.current.currentNode;
			const nodeData = currentNode.nodeObj as NodeObj;
			// Use ref to get current descendants (avoids stale closure)
			const currentDescendants = descendantsRef.current;
			const currentStatement = findStatementById(currentDescendants, nodeData.id);

			if (!currentStatement) return;

			// Tab key - create child
			if (e.key === 'Tab') {
				e.preventDefault();

				// Check if this node can have children
				if (!canHaveChildren(currentStatement.statementType)) {
					console.info('Options cannot have children');

					return;
				}

				const newStatement = await createMindMapChild({
					parentStatement: currentStatement,
				});

				if (newStatement) {
					// The mind map will update via the data refresh when Firebase listener triggers
					console.info('Child created:', newStatement.statementId);
				}
			}

			// Enter key - create sibling
			if (e.key === 'Enter' && !e.shiftKey) {
				// Don't intercept Enter if we're editing a node
				const activeElement = document.activeElement;
				if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
					return;
				}

				e.preventDefault();

				// Find parent statement
				const parentStatement = currentStatement.parentId
					? findStatementById(currentDescendants, currentStatement.parentId)
					: null;

				if (!parentStatement) {
					console.info('Cannot create sibling for root node');

					return;
				}

				const newStatement = await createMindMapSibling({
					currentStatement,
					parentStatement,
				});

				if (newStatement) {
					console.info('Sibling created:', newStatement.statementId);
				}
			}
		};

		// Add keyboard listener to container
		container.addEventListener('keydown', handleKeyDown);

		// Cleanup
		return () => {
			container.removeEventListener('keydown', handleKeyDown);
			mind.destroy();
			mindRef.current = null;
		};
	}, [data?.nodeData.id, isAdmin]);

	// Update data when descendants change
	useEffect(() => {
		if (!mindRef.current || !data) return;

		// Save current scale and position before refresh
		const currentScale = mindRef.current.scaleVal;
		const mapElement = mindRef.current.map;
		const currentTransform = mapElement?.style.transform || '';

		// Refresh the mind map with new data
		try {
			mindRef.current.refresh(data);
		} catch {
			// If refresh fails, reinitialize
			mindRef.current.init(data);
		}

		// Restore scale and position after refresh
		if (currentScale && mindRef.current) {
			mindRef.current.scaleVal = currentScale;
		}
		if (currentTransform && mapElement) {
			mapElement.style.transform = currentTransform;
		}
	}, [data]);

	// Handle layout direction change
	const handleLayoutChange = useCallback((newDirection: 'SIDE' | 'LEFT' | 'RIGHT') => {
		if (!mindRef.current) return;

		// MindElixir uses init methods for direction change
		switch (newDirection) {
			case 'SIDE':
				mindRef.current.initSide();
				break;
			case 'LEFT':
				mindRef.current.initLeft();
				break;
			case 'RIGHT':
				mindRef.current.initRight();
				break;
		}
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
		} else if (!move && mindRef.current) {
			// Undo the move in MindElixir
			mindRef.current.undo();
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

	// Restore state from localStorage
	const handleRestore = useCallback(() => {
		if (!mindRef.current) return;
		const savedData = localStorage.getItem('mindElixirData');
		if (savedData) {
			try {
				const parsedData = JSON.parse(savedData);
				mindRef.current.init(parsedData);
			} catch {
				logError(new Error('Failed to restore mind map data'), {
					operation: 'components.MindElixirMap.handleRestore',
				});
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
			<div ref={containerRef} className={styles.mindElixirContainer} tabIndex={0} />

			{/* Controls Panel */}
			<div className={styles.controlsPanel}>
				{!isButtonVisible ? (
					<button className={styles.mainButton} onClick={() => setIsButtonVisible(true)}>
						<img src={MapHamburgerIcon} alt={t('Menu')} />
					</button>
				) : (
					<div className={styles.arcButtons}>
						<button onClick={() => setIsButtonVisible(false)}>
							<img src={MapCancelIcon} alt={t('Close')} />
						</button>
						<button onClick={() => handleLayoutChange('SIDE')} title={t('Side layout')}>
							<img src={MapVerticalLayoutIcon} alt={t('Side layout')} />
						</button>
						<button onClick={() => handleLayoutChange('LEFT')} title={t('Left layout')}>
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
							<button onClick={() => handleMoveStatement(true)} className="btn btn--large btn--add">
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
