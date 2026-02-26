import React, { useEffect, useRef, useCallback, useState, memo, useMemo } from 'react';
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
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { FilterType } from '@/controllers/general/sorting';
import styles from './MindElixirMap.module.scss';
import { logError } from '@/utils/errorHandling';

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

	// State for toolbar overlay (rendered in React, outside MindElixir DOM)
	const [toolbarState, setToolbarState] = useState<{
		visible: boolean;
		top: number;
		left: number;
		statementId: string;
		isRoot: boolean;
	}>({ visible: false, top: 0, left: 0, statementId: '', isRoot: false });

	// Double click handler ref
	const lastClickRef = useRef<{ time: number; nodeId: string }>({ time: 0, nodeId: '' });

	// Ref to hold current descendants for keyboard handler (avoids re-creating MindElixir on data change)
	const descendantsRef = useRef<Results>(descendants);
	descendantsRef.current = descendants;

	// Track injected DOM elements for cleanup
	const injectedElementsRef = useRef<HTMLElement[]>([]);

	// Ref for inject function to avoid stale closures in event handlers
	const injectNodeButtonsRef = useRef<(nodeId: string) => void>(() => {});

	// Refs for toolbar actions (avoids stale closures in injected DOM handlers)
	const navigateRef = useRef(navigate);
	navigateRef.current = navigate;
	const tRef = useRef(t);
	tRef.current = t;
	const isAdminRef = useRef(isAdmin);
	isAdminRef.current = isAdmin;

	// Ref to track node ID pending inline edit (set after creating a node)
	const pendingEditNodeIdRef = useRef<string | null>(null);

	// Ref to re-select a node after edit finishes and data refreshes
	const reselectAfterRefreshRef = useRef<string | null>(null);

	// Remove previously injected node buttons
	const removeNodeButtons = useCallback(() => {
		injectedElementsRef.current.forEach((el) => el.remove());
		injectedElementsRef.current = [];
		setToolbarState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
	}, []);

	// Position the React toolbar overlay above a selected node
	const showToolbarForNode = useCallback((nodeId: string) => {
		if (!containerRef.current) return;

		const tpcEl = containerRef.current.querySelector('me-tpc.selected') as HTMLElement | null;
		if (!tpcEl) return;

		const nodeRect = tpcEl.getBoundingClientRect();
		const statementId = nodeId.startsWith('me') ? nodeId.substring(2) : nodeId;
		const isRoot = tpcEl.parentElement?.tagName === 'ME-ROOT';

		// Use viewport coordinates directly (toolbar is position: fixed)
		setToolbarState({
			visible: true,
			top: nodeRect.top - 44,
			left: nodeRect.left + nodeRect.width / 2,
			statementId,
			isRoot: !!isRoot,
		});
	}, []);

	// After creating a node, wait for it to appear in the DOM, then select and edit it
	const waitAndEditNode = useCallback(
		(nodeId: string) => {
			// Store in ref so the refresh useEffect can also trigger edit after DOM rebuild
			pendingEditNodeIdRef.current = nodeId;

			let attempts = 0;
			const maxAttempts = 20; // Try for ~2 seconds
			const tryEdit = () => {
				attempts++;
				if (!mindRef.current) return;
				// If another edit was requested, stop this one
				if (pendingEditNodeIdRef.current !== nodeId) return;
				try {
					const tpc = mindRef.current.findEle(nodeId);
					pendingEditNodeIdRef.current = null;
					removeNodeButtons();
					mindRef.current.selectNode(tpc, true);
					mindRef.current.beginEdit(tpc);
				} catch {
					// Node not in DOM yet - retry
					if (attempts < maxAttempts) {
						setTimeout(tryEdit, 100);
					}
				}
			};
			setTimeout(tryEdit, 100);
		},
		[removeNodeButtons],
	);

	// Inject "+" buttons on a selected MindElixir node
	const injectNodeButtons = useCallback(
		(nodeId: string) => {
			removeNodeButtons();

			if (!containerRef.current) return;

			// Find the selected me-tpc element
			const tpcElement = containerRef.current.querySelector(
				'me-tpc.selected',
			) as HTMLElement | null;
			if (!tpcElement) return;

			const parentElement = tpcElement.parentElement;
			if (!parentElement) return;

			// Ensure parent is positioned for absolute children
			parentElement.style.position = 'relative';

			// MindElixir prefixes node IDs with "me" in the DOM - strip it for statement lookup
			const statementId = nodeId.startsWith('me') ? nodeId.substring(2) : nodeId;
			const statement = findStatementById(descendantsRef.current, statementId);
			if (!statement) return;

			const nodeCanAddChild = canHaveChildren(statement.statementType);

			// Show React toolbar overlay (positioned outside MindElixir DOM)
			showToolbarForNode(nodeId);

			// Create child "+" button (if allowed)
			if (nodeCanAddChild) {
				const childBtn = document.createElement('button');
				childBtn.className = 'mind-map-add-btn mind-map-add-btn--child';
				childBtn.textContent = '+';
				childBtn.setAttribute('aria-label', 'Add child node (Tab)');
				childBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					e.preventDefault();
					const newChild = await createMindMapChild({ parentStatement: statement });
					if (newChild) {
						waitAndEditNode(newChild.statementId);
					}
				});
				parentElement.appendChild(childBtn);
				injectedElementsRef.current.push(childBtn);
			}

			// Create sibling "+" button (only if parent is in the tree)
			const parentOfNode = statement.parentId
				? findStatementById(descendantsRef.current, statement.parentId)
				: null;

			if (parentOfNode) {
				const siblingBtn = document.createElement('button');
				siblingBtn.className = 'mind-map-add-btn mind-map-add-btn--sibling';
				siblingBtn.textContent = '+';
				siblingBtn.setAttribute('aria-label', 'Add sibling node (Enter)');
				siblingBtn.addEventListener('click', async (e) => {
					e.stopPropagation();
					e.preventDefault();
					const newSibling = await createMindMapSibling({
						currentStatement: statement,
						parentStatement: parentOfNode,
					});
					if (newSibling) {
						waitAndEditNode(newSibling.statementId);
					}
				});
				parentElement.appendChild(siblingBtn);
				injectedElementsRef.current.push(siblingBtn);
			}

			// Create keyboard hints (only for actions that have buttons)
			const hints = document.createElement('div');
			hints.className = 'mind-map-hints';

			if (nodeCanAddChild) {
				const childHint = document.createElement('div');
				childHint.className = 'mind-map-hint';
				childHint.innerHTML =
					'<span class="mind-map-key">Tab</span><span class="mind-map-hint-text">to create child</span>';
				hints.appendChild(childHint);
			}

			if (parentOfNode) {
				const siblingHint = document.createElement('div');
				siblingHint.className = 'mind-map-hint';
				siblingHint.innerHTML =
					'<span class="mind-map-key">Enter</span><span class="mind-map-hint-text">to create sibling</span>';
				hints.appendChild(siblingHint);
			}

			if (hints.children.length > 0) {
				parentElement.appendChild(hints);
				injectedElementsRef.current.push(hints);
			}

			// Apply inverse zoom scaling so injected elements stay a consistent size
			if (mindRef.current) {
				const scale = 1 / mindRef.current.scaleVal;
				injectedElementsRef.current.forEach((el) => {
					el.style.transform = `scale(${scale})`;
					el.style.transformOrigin = 'center center';
				});
			}
		},
		[removeNodeButtons, showToolbarForNode],
	);

	// Keep ref in sync for use inside MindElixir event handlers (avoids stale closures)
	injectNodeButtonsRef.current = injectNodeButtons;

	// Memoize data to prevent unnecessary refresh calls that rebuild the DOM.
	// Without memoization, toMindElixirData creates a new object every render,
	// causing the refresh useEffect to fire and destroy any active inline edit (input-box).
	const data = useMemo(() => {
		const filtered =
			filterBy === FilterType.questionsResults ? filterDescendants(descendants) : descendants;

		return filtered ? toMindElixirData(filtered) : null;
	}, [descendants, filterBy]);

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
				removeNodeButtons();
				navigate(`/statement/${nodeObj.id}/chat`, {
					state: { from: window.location.pathname },
				});

				return;
			}

			// Update last click
			lastClickRef.current = { time: now, nodeId: nodeObj.id };

			// Update selected ID in context
			setMapContext((prev) => ({
				...prev,
				selectedId: nodeObj.id,
			}));
		});

		// MutationObserver to detect node selection and inject buttons
		// More reliable than relying on MindElixir's event bus timing
		const selectionObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
					const target = mutation.target as HTMLElement;
					if (target.tagName === 'ME-TPC' && target.classList.contains('selected')) {
						const nodeId = target.getAttribute('data-nodeid') || '';
						injectNodeButtonsRef.current(nodeId);
					}
				}
			}
		});

		selectionObserver.observe(container, {
			attributes: true,
			attributeFilter: ['class'],
			subtree: true,
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
				const nodeId = typedOp.obj.id;
				const statement = findStatementById(descendantsRef.current, nodeId);
				if (statement && typedOp.obj.topic !== typedOp.origin) {
					await updateMindMapNodeText({
						statement,
						newText: typedOp.obj.topic,
					});
				}

				// Keep the node selected after editing finishes.
				// Store in ref so the refresh useEffect can re-select after DOM rebuild.
				reselectAfterRefreshRef.current = nodeId;
				setTimeout(() => {
					try {
						const tpc = mind.findEle(nodeId);
						mind.selectNode(tpc);
					} catch {
						// Node may have been removed by refresh
					}
				}, 50);
			}
		});

		// Keyboard handler for Tab (child) and Enter (sibling)
		const handleKeyDown = async (e: KeyboardEvent) => {
			if (!mindRef.current?.currentNode) return;

			// Don't intercept keys while editing a node
			const activeEl = document.activeElement as HTMLElement;
			if (activeEl?.isContentEditable || activeEl?.id === 'input-box') return;

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
					return;
				}

				const newStatement = await createMindMapChild({
					parentStatement: currentStatement,
				});

				if (newStatement) {
					waitAndEditNode(newStatement.statementId);
				}
			}

			// Enter key - create sibling
			if (e.key === 'Enter' && !e.shiftKey) {
				// Don't intercept Enter if we're editing a node
				const activeElement = document.activeElement;
				if (
					activeElement?.tagName === 'INPUT' ||
					activeElement?.tagName === 'TEXTAREA' ||
					(activeElement as HTMLElement)?.isContentEditable
				) {
					return;
				}

				e.preventDefault();

				// Find parent statement
				const parentStatement = currentStatement.parentId
					? findStatementById(currentDescendants, currentStatement.parentId)
					: null;

				if (!parentStatement) {
					return;
				}

				const newStatement = await createMindMapSibling({
					currentStatement,
					parentStatement,
				});

				if (newStatement) {
					waitAndEditNode(newStatement.statementId);
				}
			}
		};

		// Add keyboard listener to container
		container.addEventListener('keydown', handleKeyDown);

		// Click handler to deselect and remove buttons when clicking empty area
		const handleContainerClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;

			// If click was on a me-tpc, toolbar, or add button, let them handle it
			if (
				target.closest('me-tpc') ||
				target.closest('.mind-map-add-btn') ||
				target.closest('.mind-map-toolbar')
			)
				return;

			// Clicked on empty area - remove buttons
			removeNodeButtons();
			setMapContext((prev) => ({
				...prev,
				selectedId: null,
			}));
		};

		container.addEventListener('click', handleContainerClick);

		// Cleanup
		return () => {
			selectionObserver.disconnect();
			container.removeEventListener('keydown', handleKeyDown);
			container.removeEventListener('click', handleContainerClick);
			removeNodeButtons();
			mind.destroy();
			mindRef.current = null;
		};
	}, [data?.nodeData.id, isAdmin]);

	// Update data when descendants change
	useEffect(() => {
		if (!mindRef.current || !data) return;

		// Skip refresh if the user is currently editing a node inline.
		// MindElixir creates div#input-box for inline editing; refresh would destroy it.
		const inputBox = document.getElementById('input-box');
		if (inputBox) return;

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

		// If a node is pending inline edit, trigger it after the DOM rebuild
		if (pendingEditNodeIdRef.current && mindRef.current) {
			const nodeId = pendingEditNodeIdRef.current;
			const mind = mindRef.current;
			// Let the DOM settle after refresh, then start editing
			setTimeout(() => {
				if (pendingEditNodeIdRef.current !== nodeId) return;
				try {
					const tpc = mind.findEle(nodeId);
					pendingEditNodeIdRef.current = null;
					removeNodeButtons();
					mind.selectNode(tpc, true);
					mind.beginEdit(tpc);
				} catch {
					// Node not found yet, polling in waitAndEditNode will retry
				}
			}, 50);
		}

		// Re-select node after refresh if user just finished editing
		if (reselectAfterRefreshRef.current && mindRef.current) {
			const nodeId = reselectAfterRefreshRef.current;
			const mind = mindRef.current;
			reselectAfterRefreshRef.current = null;
			setTimeout(() => {
				try {
					const tpc = mind.findEle(nodeId);
					mind.selectNode(tpc);
				} catch {
					// Node not found after refresh
				}
			}, 50);
		}
	}, [data, removeNodeButtons]);

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

	// Toolbar action handlers
	const handleToolbarLink = useCallback(() => {
		if (!toolbarState.statementId) return;
		navigate(`/statement/${toolbarState.statementId}/chat`, {
			state: { from: window.location.pathname },
		});
	}, [toolbarState.statementId, navigate]);

	const handleToolbarEdit = useCallback(() => {
		if (!mindRef.current || !toolbarState.statementId) return;
		try {
			const tpc = mindRef.current.findEle(toolbarState.statementId);
			removeNodeButtons();
			mindRef.current.beginEdit(tpc);
		} catch {
			// Node not found
		}
	}, [toolbarState.statementId, removeNodeButtons]);

	const handleToolbarDelete = useCallback(() => {
		if (!toolbarState.statementId) return;
		const statement = findStatementById(descendants, toolbarState.statementId);
		if (!statement) return;
		deleteStatementFromDB(statement, true, t).then(() => {
			removeNodeButtons();
		});
	}, [toolbarState.statementId, descendants, t, removeNodeButtons]);

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

			{/* Node toolbar overlay — rendered in React, outside MindElixir's DOM */}
			{toolbarState.visible && (
				<div
					className={styles.toolbar}
					style={{ top: toolbarState.top, left: toolbarState.left }}
					onMouseDown={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<button
						className={styles.toolbarBtn}
						onClick={handleToolbarLink}
						aria-label="Open statement"
						title={t('Open')}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
							<polyline points="15 3 21 3 21 9" />
							<line x1="10" y1="14" x2="21" y2="3" />
						</svg>
					</button>
					<button
						className={styles.toolbarBtn}
						onClick={handleToolbarEdit}
						aria-label="Edit node"
						title={t('Edit')}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
						</svg>
					</button>
					{!toolbarState.isRoot && (
						<>
							<div className={styles.toolbarDivider} />
							<button
								className={`${styles.toolbarBtn} ${styles.toolbarBtnDelete}`}
								onClick={handleToolbarDelete}
								aria-label="Delete node"
								title={t('Delete')}
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polyline points="3 6 5 6 21 6" />
									<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
									<line x1="10" y1="11" x2="10" y2="17" />
									<line x1="14" y1="11" x2="14" y2="17" />
								</svg>
							</button>
						</>
					)}
				</div>
			)}

			{/* Controls Panel */}
			<div className={styles.controlsPanel}>
				{!isButtonVisible ? (
					<button
						className={styles.mainButton}
						onClick={() => setIsButtonVisible(true)}
						aria-label={t('Menu')}
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
				) : (
					<div className={styles.arcButtons}>
						<button onClick={() => setIsButtonVisible(false)} aria-label={t('Close')}>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
						<button
							onClick={() => handleLayoutChange('SIDE')}
							title={t('Side layout')}
							aria-label={t('Side layout')}
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="12" cy="12" r="3" />
								<line x1="15" y1="5" x2="21" y2="5" />
								<line x1="15" y1="12" x2="21" y2="12" />
								<line x1="15" y1="19" x2="21" y2="19" />
								<line x1="3" y1="5" x2="9" y2="5" />
								<line x1="3" y1="19" x2="9" y2="19" />
							</svg>
						</button>
						<button
							onClick={() => handleLayoutChange('LEFT')}
							title={t('Left layout')}
							aria-label={t('Left layout')}
						>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<circle cx="5" cy="12" r="3" />
								<line x1="8" y1="5" x2="21" y2="5" />
								<line x1="8" y1="12" x2="21" y2="12" />
								<line x1="8" y1="19" x2="21" y2="19" />
							</svg>
						</button>
						<button onClick={handleRestore} title={t('Restore')} aria-label={t('Restore')}>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="1 4 1 10 7 10" />
								<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
							</svg>
						</button>
						<button onClick={handleAddSiblingNode} title={t('Add')} aria-label={t('Add')}>
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<line x1="12" y1="5" x2="12" y2="19" />
								<line x1="5" y1="12" x2="19" y2="12" />
							</svg>
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
