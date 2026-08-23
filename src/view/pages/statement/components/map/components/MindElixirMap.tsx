import React, { useEffect, useRef, useCallback, useState, memo, useMemo } from 'react';
import MindElixir from 'mind-elixir';
// Library CSS loads with this lazy chunk instead of the global stylesheet
import 'mind-elixir/style.css';
import type { MindElixirInstance, NodeObj, Operation, Topic } from 'mind-elixir';
import { useNavigate } from 'react-router';
import { Results, Statement, StatementType } from '@freedi/shared-types';
import { useMapContext } from '@/controllers/hooks/useMap';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	moveStatementBranch,
	updateMapSide,
	updateSiblingOrder,
} from '@/controllers/db/statements/moveStatementBranch';
import type { MapSide } from '@/controllers/db/statements/moveStatementBranch';
import Modal from '@/view/components/modal/Modal';
import { toMindElixirData, canHaveChildren } from '../mapHelpers/mindElixirTransform';
import type { ClusterKind } from '../mapHelpers/mindElixirTransform';
import { filterResultsByLayer } from '../mapHelpers/layerFilter';
import type { LayerVisibility } from '../mapHelpers/layerFilter';
import {
	createMindMapChild,
	createMindMapSibling,
	updateMindMapNodeText,
} from '../mapHelpers/mindMapStatements';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import {
	findNodeContext,
	getTypeChangeChoices,
	hasAnyTypeChange,
	TYPE_LABEL_KEYS,
} from '../mapHelpers/statementTypeChoices';
import {
	collectSubtree,
	computeSiblingOrder,
	flattenResults,
	resolveNewParent,
	validateMove,
} from '../mapHelpers/moveBranch';
import type { DropKind } from '../mapHelpers/moveBranch';
import { FilterType } from '@/controllers/general/sorting';
import PanZoomControls from './PanZoomControls';
import styles from './MindElixirMap.module.scss';
import { logError } from '@/utils/errorHandling';
import { useSelector } from 'react-redux';
import { getEvaluationScale } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { evaluationSelector } from '@/redux/evaluations/evaluationsSlice';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { findAncestorChain, resolveEvaluationSettings } from '../mapHelpers/evaluationSettings';

// Zoom bounds + button step, shared by the wheel, pinch, and button handlers.
const SCALE_MIN = 0.2;
const SCALE_MAX = 3;
const ZOOM_BUTTON_STEP = 1.25;

interface Props {
	descendants: Results;
	filterBy: FilterType;
	layerVisibility: LayerVisibility;
	isAdmin: boolean;
	/**
	 * Allow dragging/regrouping nodes even for non-admins. Used by the shareable
	 * cluster board where any participant with access can co-edit. Defaults to
	 * admin-only behavior so the in-app statement map is unchanged.
	 */
	allowRegroup?: boolean;
	/** Render with the sticky-note "cluster board" styling (per-branch colors). */
	boardMode?: boolean;
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

function MindElixirMap({
	descendants,
	isAdmin,
	filterBy,
	layerVisibility,
	allowRegroup = false,
	boardMode = false,
}: Readonly<Props>) {
	const navigate = useNavigate();
	// Dragging/regrouping is allowed for admins, or for anyone when the board
	// explicitly opts into open co-editing.
	const canDrag = isAdmin || allowRegroup;
	const containerRef = useRef<HTMLDivElement>(null);
	const mindRef = useRef<MindElixirInstance | null>(null);
	const { mapContext, setMapContext } = useMapContext();
	const { t } = useTranslation();

	// Pending drag-and-drop move, awaiting the user's confirmation. Holds every
	// dragged node (MindElixir supports multi-select drags) plus the resolved
	// new parent.
	const [pendingMove, setPendingMove] = useState<{
		draggedIds: string[];
		newParentId: string;
		targetId: string;
		kind: DropKind;
		mapSide?: MapSide;
	} | null>(null);

	// Translation key explaining why a drop was refused (the drop is undone and
	// the modal turns into an explanation instead of a confirmation).
	const [moveError, setMoveError] = useState<string | null>(null);

	// State for controls panel
	const [isButtonVisible, setIsButtonVisible] = useState(false);

	// Live zoom level (1 = 100%) shown in the floating zoom controls.
	const [mapScale, setMapScale] = useState(1);

	// State for toolbar overlay (rendered in React, outside MindElixir DOM)
	const [toolbarState, setToolbarState] = useState<{
		visible: boolean;
		top: number;
		left: number;
		statementId: string;
		isRoot: boolean;
	}>({ visible: false, top: 0, left: 0, statementId: '', isRoot: false });

	// Whether the "change type" popover under the node toolbar is open
	const [typeMenuOpen, setTypeMenuOpen] = useState(false);

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
		setTypeMenuOpen(false);
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

		setTypeMenuOpen(false);

		// Use viewport coordinates directly (toolbar is position: fixed)
		setToolbarState({
			visible: true,
			// Anchored by its own bottom edge (see .toolbar's translateY(-100%)) so
			// the strip clears the node whether or not it carries the rating row.
			top: nodeRect.top - 6,
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
	// Translated count badges for cluster nodes ("5 merged" / "7 grouped").
	const formatClusterTag = useCallback(
		(kind: ClusterKind, count: number) =>
			kind === 'synth' ? `${count} ${t('merged')}` : `${count} ${t('grouped')}`,
		[t],
	);

	const data = useMemo(() => {
		const byLayer = filterResultsByLayer(descendants, layerVisibility);
		const filtered =
			filterBy === FilterType.questionsResults ? filterDescendants(byLayer) : byLayer;

		return filtered ? toMindElixirData(filtered, [], formatClusterTag, { boardMode }) : null;
	}, [descendants, filterBy, layerVisibility, formatClusterTag, boardMode]);

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
			draggable: canDrag, // Admins always; others when the board allows co-editing
			contextMenu: true,
			toolBar: false, // We'll use our own toolbar
			keypress: false, // We handle keyboard shortcuts ourselves
			editable: true, // Allow inline editing
			allowUndo: true,
			overflowHidden: false,
			// Widen the library's zoom range (defaults cap at 1.4) so zoom controls
			// and wheel zoom have real room to work.
			scaleMin: SCALE_MIN,
			scaleMax: SCALE_MAX,
			// Wheel zooms toward the cursor (Space+drag is for panning). Continuous
			// delta keeps both mouse wheel and trackpad smooth.
			handleWheel: (e: WheelEvent) => {
				if (!mindRef.current) return;
				e.preventDefault();
				const delta = -e.deltaY * 0.002;
				const currentScale = mindRef.current.scaleVal;
				// scale() takes an ABSOLUTE target (not a factor) and zooms toward the
				// given point.
				const targetScale = currentScale * (1 + delta);
				const clampedScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, targetScale));
				if (Math.abs(clampedScale - currentScale) < 0.001) return;
				const containerRect = container.getBoundingClientRect();
				mindRef.current.scale(clampedScale, {
					x: e.clientX - containerRect.left,
					y: e.clientY - containerRect.top,
				});
				setMapScale(clampedScale);
			},
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

		// SIDE layout, but every first-level branch carries an explicit side (see
		// `toMindElixirData`), so a map nobody has arranged still draws entirely
		// to the right — SIDE's auto-balancing never gets a say. Then scale the
		// whole map to fill the available canvas (instead of just centering the
		// root, which leaves a large tree mostly off-screen).
		setTimeout(() => {
			if (mindRef.current) {
				mindRef.current.initSide();
				mindRef.current.scaleFit();
				setMapScale(mindRef.current.scaleVal);
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

		/**
		 * Shared landing point for every drop, whatever produced it: either
		 * re-order silently, open the confirmation, or refuse with a reason.
		 * `onRefuse` puts the canvas back — MindElixir's own drops need an undo,
		 * a drop on the root never moved anything visually so it needs nothing.
		 */
		const applyDrop = async (
			draggedIds: string[],
			targetId: string,
			dropKind: DropKind,
			onRefuse: () => void,
			/** Only set for root drops: which side of the subject to hang from. */
			mapSide?: MapSide,
		) => {
			const all = flattenResults(descendantsRef.current);
			const newParent = resolveNewParent(all, targetId, dropKind);
			const dragged = draggedIds
				.map((id) => all.find((candidate) => candidate.statementId === id))
				.filter((candidate): candidate is Statement => Boolean(candidate));

			if (!newParent || dragged.length === 0) {
				onRefuse();

				return;
			}

			const validIds = dragged.map((node) => node.statementId);

			// Reordering under the parent a node already has changes nothing
			// structural, so it is saved straight away — asking "move here?" for
			// a nudge between siblings would be noise.
			const isReorderOnly = dragged.every((node) => node.parentId === newParent.statementId);
			if (isReorderOnly) {
				// Dropping a branch the root already owns beside the root is not a
				// re-parent, it is a side change — the only way to cross the subject.
				// Leave the sibling order alone: the drop zone is the root's own band,
				// so the pointer's height says nothing about where in the list it goes.
				if (mapSide) {
					await Promise.all(
						dragged
							.filter((node) => node.mapSide !== mapSide)
							.map((node) => updateMapSide(node.statementId, mapSide)),
					);

					return;
				}

				await updateSiblingOrder(
					computeSiblingOrder(all, newParent.statementId, validIds, targetId, dropKind),
				);

				return;
			}

			const refusal = dragged
				.map((node) => validateMove(node, newParent, collectSubtree(all, node.statementId)))
				.find((validation) => !validation.allowed);

			if (refusal) {
				onRefuse();
				setPendingMove(null);
				setMoveError(refusal.reasonKey ?? 'This move is not allowed');
			} else {
				setMoveError(null);
				setPendingMove({
					draggedIds: validIds,
					newParentId: newParent.statementId,
					targetId,
					kind: dropKind,
					mapSide,
				});
			}

			setMapContext((prev) => ({
				...prev,
				moveStatementModal: true,
			}));
		};

		// Event: Operation happened (for tracking node moves and text edits)
		mind.bus.addListener('operation', async (operation: Operation) => {
			// Drag-and-drop. MindElixir fires `{ objs, toObj }` (plural — a drag can
			// carry a multi-selection) for all three drop kinds; dropping *next to*
			// a node re-parents to that node's parent.
			const dropKind: DropKind | null =
				operation.name === 'moveNodeIn'
					? 'in'
					: operation.name === 'moveNodeBefore'
						? 'before'
						: operation.name === 'moveNodeAfter'
							? 'after'
							: null;

			if (canDrag && dropKind && 'objs' in operation && 'toObj' in operation) {
				const typedOp = operation as { objs: NodeObj[]; toObj: NodeObj; name: string };
				await applyDrop(
					typedOp.objs.map((obj) => obj.id),
					typedOp.toObj.id,
					dropKind,
					() => mind.undo(),
				);
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

		// ------------------------------------------------------------------
		// Dropping onto — or beside — the root ("main") node.
		//
		// MindElixir refuses the root as a drop target: its hit test requires
		// `nodeObj.parent`, which the root has not got, so `meet` stays null and
		// no operation is ever fired — dragging a node onto the subject did
		// nothing at all. Handle exactly that gap here. This runs only when the
		// library itself found no target, so the two never both act on one drop.
		//
		// The drop zone reaches past the root on both sides, and which side the
		// pointer is on decides which side of the map the branch hangs from.
		// That is the only way to move a branch across the root: MindElixir has
		// no drag gesture for `direction` at all.
		// ------------------------------------------------------------------
		const ROOT_DROP_CLASS = 'mind-map-root-drop';
		// How far beyond the root counts as "drop it on this side".
		const ROOT_DROP_MARGIN_X = 180;
		const ROOT_DROP_MARGIN_Y = 40;
		let rootDropSide: MapSide | null = null;

		const getRootTopic = () => container.querySelector('me-root > me-tpc') as HTMLElement | null;

		const setRootDropSide = (side: MapSide | null) => {
			rootDropSide = side;
			const rootTopic = getRootTopic();
			if (!rootTopic) return;
			rootTopic.classList.toggle(ROOT_DROP_CLASS, side !== null);
			if (side) {
				rootTopic.dataset.dropSide = side;
			} else {
				delete rootTopic.dataset.dropSide;
			}
		};

		// Mirror of MindElixir's own "can this element be met" test, so we only
		// step in for drops it has declined.
		const libraryWouldMeet = (element: Element | null, dragged: Topic[]): boolean => {
			if (!element || element.tagName !== 'ME-TPC') return false;
			const { nodeObj } = element as HTMLElement & { nodeObj?: { parent?: unknown } };
			if (!nodeObj?.parent) return false;

			return dragged.every(
				(node) => node !== element && !node.parentElement?.parentElement?.contains(element),
			);
		};

		const handleRootDragMove = (e: PointerEvent) => {
			const dragged = mindRef.current?.dragged ?? [];
			if (!canDrag || dragged.length === 0) {
				if (rootDropSide) setRootDropSide(null);

				return;
			}

			// Same probe offsets the library uses, so its verdict is reproduced.
			const offset = 12 * (mindRef.current?.scaleVal ?? 1);
			const probes = [
				document.elementFromPoint(e.clientX, e.clientY),
				document.elementFromPoint(e.clientX, e.clientY - offset),
				document.elementFromPoint(e.clientX, e.clientY + offset),
			];

			if (probes.some((element) => libraryWouldMeet(element, dragged))) {
				setRootDropSide(null);

				return;
			}

			const rootRect = getRootTopic()?.getBoundingClientRect();
			if (!rootRect) {
				setRootDropSide(null);

				return;
			}

			const inZone =
				e.clientX >= rootRect.left - ROOT_DROP_MARGIN_X &&
				e.clientX <= rootRect.right + ROOT_DROP_MARGIN_X &&
				e.clientY >= rootRect.top - ROOT_DROP_MARGIN_Y &&
				e.clientY <= rootRect.bottom + ROOT_DROP_MARGIN_Y;

			if (!inZone) {
				setRootDropSide(null);

				return;
			}

			setRootDropSide(e.clientX < rootRect.left + rootRect.width / 2 ? 'left' : 'right');
		};

		const handleRootDrop = async () => {
			const side = rootDropSide;
			if (!side) return;
			const dragged = mindRef.current?.dragged ?? [];
			setRootDropSide(null);
			if (dragged.length === 0) return;

			const draggedIds = dragged
				.map((node) => node.nodeObj?.id)
				.filter((id): id is string => Boolean(id));

			// Nothing moved on the canvas, so a refusal has nothing to undo.
			await applyDrop(draggedIds, descendantsRef.current.top.statementId, 'in', () => {}, side);
		};

		const handleRootDragCancel = () => setRootDropSide(null);

		// Capture phase for the drop: the library's own pointerup clears `dragged`.
		window.addEventListener('pointermove', handleRootDragMove);
		window.addEventListener('pointerup', handleRootDrop, true);
		window.addEventListener('pointercancel', handleRootDragCancel, true);

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

		// Space + drag to pan. MindElixir pans natively while its `spacePressed`
		// flag is set (and shows a grab cursor via the `space-pressed` class), but
		// it only flips that flag from a keydown listener on its own container —
		// so it silently fails unless the map has focus. Drive it from the window
		// so Space+drag works regardless of where focus is.
		const setSpacePan = (on: boolean) => {
			const mind = mindRef.current as unknown as {
				spacePressed?: boolean;
				container?: HTMLElement;
			} | null;
			if (!mind) return;
			mind.spacePressed = on;
			// MindElixir nests its own `.map-container` inside our el; the grab-cursor
			// CSS is scoped to that element, so toggle the class there.
			(mind.container ?? container).classList.toggle('space-pressed', on);
		};

		const handleZoomKeyDown = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				const activeEl = document.activeElement as HTMLElement;
				if (activeEl?.isContentEditable || activeEl?.id === 'input-box') return;
				if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;
				e.preventDefault();
				setSpacePan(true);
			}
		};

		const handleZoomKeyUp = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				setSpacePan(false);
			}
		};

		window.addEventListener('keydown', handleZoomKeyDown);
		window.addEventListener('keyup', handleZoomKeyUp);

		// Pinch to zoom (mobile)
		let initialPinchDistance = 0;
		let initialScale = 1;

		const getDistance = (t1: Touch, t2: Touch): number => {
			const dx = t1.clientX - t2.clientX;
			const dy = t1.clientY - t2.clientY;

			return Math.sqrt(dx * dx + dy * dy);
		};

		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 2 && mindRef.current) {
				initialPinchDistance = getDistance(e.touches[0], e.touches[1]);
				initialScale = mindRef.current.scaleVal;
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (e.touches.length !== 2 || !mindRef.current || initialPinchDistance === 0) return;
			e.preventDefault();

			const currentDistance = getDistance(e.touches[0], e.touches[1]);
			const pinchRatio = currentDistance / initialPinchDistance;
			const newScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, initialScale * pinchRatio));

			const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			const rect = container.getBoundingClientRect();

			// scale() takes an ABSOLUTE target, zooming toward the pinch midpoint.
			mindRef.current.scale(newScale, {
				x: midX - rect.left,
				y: midY - rect.top,
			});
			setMapScale(newScale);
		};

		const handleTouchEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) {
				initialPinchDistance = 0;
			}
		};

		container.addEventListener('touchstart', handleTouchStart, { passive: true });
		container.addEventListener('touchmove', handleTouchMove, { passive: false });
		container.addEventListener('touchend', handleTouchEnd, { passive: true });

		// Cleanup
		return () => {
			window.removeEventListener('pointermove', handleRootDragMove);
			window.removeEventListener('pointerup', handleRootDrop, true);
			window.removeEventListener('pointercancel', handleRootDragCancel, true);
			setRootDropSide(null);
			selectionObserver.disconnect();
			container.removeEventListener('keydown', handleKeyDown);
			container.removeEventListener('click', handleContainerClick);
			window.removeEventListener('keydown', handleZoomKeyDown);
			window.removeEventListener('keyup', handleZoomKeyUp);
			container.removeEventListener('touchstart', handleTouchStart);
			container.removeEventListener('touchmove', handleTouchMove);
			container.removeEventListener('touchend', handleTouchEnd);
			removeNodeButtons();
			mind.destroy();
			mindRef.current = null;
		};
	}, [data?.nodeData.id, canDrag]);

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

	const closeMoveModal = useCallback(() => {
		setMapContext((prev) => ({
			...prev,
			moveStatementModal: false,
		}));
		setPendingMove(null);
		setMoveError(null);
	}, [setMapContext]);

	// Handle move statement confirmation. The whole branch travels with the
	// dragged node, so every descendant's ancestor chain is rewritten too.
	const handleMoveStatement = useCallback(
		async (move: boolean) => {
			if (!move || !pendingMove) {
				mindRef.current?.undo();
				closeMoveModal();

				return;
			}

			const all = flattenResults(descendants);
			const newParent = all.find((candidate) => candidate.statementId === pendingMove.newParentId);

			if (!newParent) {
				mindRef.current?.undo();
				closeMoveModal();

				return;
			}

			const siblingOrder = computeSiblingOrder(
				all,
				pendingMove.newParentId,
				pendingMove.draggedIds,
				pendingMove.targetId,
				pendingMove.kind,
			);

			for (const draggedId of pendingMove.draggedIds) {
				const dragged = all.find((candidate) => candidate.statementId === draggedId);
				if (!dragged) continue;

				const result = await moveStatementBranch({
					statement: dragged,
					newParent,
					subtree: collectSubtree(all, draggedId),
					siblingOrder,
					mapSide: pendingMove.mapSide,
				});

				if (!result.success) {
					mindRef.current?.undo();
					break;
				}
			}

			closeMoveModal();
		},
		[pendingMove, descendants, closeMoveModal],
	);

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

	// Fit map to screen using built-in scaleFit
	const handleFitToScreen = useCallback(() => {
		if (!mindRef.current) return;
		mindRef.current.scaleFit();
		setMapScale(mindRef.current.scaleVal);
	}, []);

	// Zoom around the viewport center by a fixed step (floating controls).
	const handleZoomBy = useCallback((step: number) => {
		const mind = mindRef.current;
		if (!mind) return;
		const current = mind.scaleVal;
		const target = Math.min(SCALE_MAX, Math.max(SCALE_MIN, current * step));
		if (Math.abs(target - current) < 0.001) return;
		const rect = containerRef.current?.getBoundingClientRect();
		// scale() takes an ABSOLUTE target; zoom around the viewport center.
		mind.scale(target, rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 });
		setMapScale(target);
	}, []);

	const handleZoomIn = useCallback(() => handleZoomBy(ZOOM_BUTTON_STEP), [handleZoomBy]);
	const handleZoomOut = useCallback(() => handleZoomBy(1 / ZOOM_BUTTON_STEP), [handleZoomBy]);

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

	// Which types this node may switch to. Computed from the unfiltered tree so
	// hidden layers still count towards the "has option children" rule.
	const typeChoices = useMemo(() => {
		if (!toolbarState.statementId) return [];
		const context = findNodeContext(descendants, toolbarState.statementId);
		if (!context) return [];

		return getTypeChangeChoices(context);
	}, [descendants, toolbarState.statementId]);

	const canChangeType = isAdmin && hasAnyTypeChange(typeChoices);

	const handleChangeType = useCallback(
		async (newType: StatementType) => {
			const statement = findStatementById(descendants, toolbarState.statementId);
			if (!statement) return;

			const result = await changeStatementType(statement, newType, isAdmin);
			if (!result.success) {
				logError(new Error(result.error ?? 'Type change refused'), {
					operation: 'components.MindElixirMap.handleChangeType',
					statementId: statement.statementId,
					metadata: { newType },
				});

				return;
			}

			setTypeMenuOpen(false);
			removeNodeButtons();
		},
		[descendants, toolbarState.statementId, isAdmin, removeNodeButtons],
	);

	const handleToolbarDelete = useCallback(() => {
		if (!toolbarState.statementId) return;
		const statement = findStatementById(descendants, toolbarState.statementId);
		if (!statement) return;
		deleteStatementFromDB(statement, true, t).then(() => {
			removeNodeButtons();
		});
	}, [toolbarState.statementId, descendants, t, removeNodeButtons]);

	// ── Node evaluation ──────────────────────────────────────────────────────
	// The toolbar doubles as the rating surface: pick a face and the vote is
	// written for the selected node. Which faces appear is inherited from the
	// question the node hangs under — see resolveEvaluationSettings.
	const { creator } = useAuthentication();

	const selectedStatement = useMemo(
		() =>
			toolbarState.statementId ? findStatementById(descendants, toolbarState.statementId) : null,
		[descendants, toolbarState.statementId],
	);

	// The map is rooted at the question being viewed, which is not necessarily
	// the top question — read that one from the store so its settings still act
	// as the global fallback for a node deep inside a sub-question.
	const topStatementSelector = useMemo(
		() => statementSelector(descendants.top.topParentId),
		[descendants.top.topParentId],
	);
	const topStatement = useSelector(topStatementSelector);

	const ancestorChain = useMemo(() => {
		const chain = toolbarState.statementId
			? (findAncestorChain(descendants, toolbarState.statementId) ?? [])
			: [];
		if (!topStatement || chain.some((a) => a.statementId === topStatement.statementId)) {
			return chain;
		}

		return [...chain, topStatement];
	}, [descendants, toolbarState.statementId, topStatement]);

	const evaluationSettings = useMemo(
		() => resolveEvaluationSettings(ancestorChain),
		[ancestorChain],
	);
	const evaluationScale = useMemo(
		() => getEvaluationScale(evaluationSettings.ratingMode),
		[evaluationSettings.ratingMode],
	);

	// A halted question freezes rating here exactly as it does on the cards.
	const { isHalted } = useIsProcessHalted(ancestorChain[0]);

	// Votes are stored per parent, and only the selected node's are needed, so
	// the listener follows the selection instead of subscribing to the whole map.
	const evaluationParentId = selectedStatement?.parentId;
	useEffect(() => {
		if (!evaluationParentId || !creator?.uid) return;
		const unsubscribe = listenToEvaluations(evaluationParentId, undefined, creator.uid);

		return () => unsubscribe?.();
	}, [evaluationParentId, creator?.uid]);

	const storedEvaluationSelector = useMemo(
		() => evaluationSelector(toolbarState.statementId),
		[toolbarState.statementId],
	);
	const storedEvaluation = useAppSelector(storedEvaluationSelector);

	// Shown immediately on click; the listener overwrites it once the write
	// lands, so a rejected vote falls back to the stored value on its own.
	const [optimisticEvaluation, setOptimisticEvaluation] = useState<number | undefined>(undefined);
	useEffect(() => {
		setOptimisticEvaluation(storedEvaluation);
	}, [storedEvaluation, toolbarState.statementId]);

	const handleEvaluate = useCallback(
		(value: number) => {
			if (!selectedStatement || !creator) return;
			setOptimisticEvaluation(value);
			setEvaluationToDB(selectedStatement, creator, value);
		},
		[selectedStatement, creator],
	);

	// The root is the question itself: nothing above it to rate it against, and
	// no parentId to file a vote under.
	const canEvaluateNode =
		!toolbarState.isRoot &&
		Boolean(selectedStatement?.parentId) &&
		Boolean(creator) &&
		evaluationSettings.enableEvaluation &&
		!isHalted;

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
			<div
				ref={containerRef}
				className={`${styles.mindElixirContainer}${boardMode ? ` ${styles.boardMode}` : ''}`}
				tabIndex={0}
			/>

			{/* Node toolbar overlay — rendered in React, outside MindElixir's DOM */}
			{toolbarState.visible && (
				<div
					className={styles.toolbar}
					style={{ top: toolbarState.top, left: toolbarState.left }}
					onMouseDown={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				>
					<div className={styles.toolbarRow}>
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
						{canChangeType && (
							<button
								className={`${styles.toolbarBtn} ${typeMenuOpen ? styles.toolbarBtnActive : ''}`}
								onClick={() => setTypeMenuOpen((open) => !open)}
								aria-label="Change statement type"
								aria-expanded={typeMenuOpen}
								title={t('Change type')}
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<rect x="3" y="13" width="8" height="8" rx="2" />
									<circle cx="17" cy="17" r="4" />
									<path d="M7 3 3 9h8L7 3z" />
								</svg>
							</button>
						)}
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

					{canEvaluateNode && (
						<div className={styles.evaluationRow} role="group" aria-label={t('Rate this')}>
							{evaluationScale.map((entry) => {
								const isActive = optimisticEvaluation === entry.value;

								return (
									<button
										key={entry.value}
										type="button"
										className={`${styles.evaluationBtn} ${isActive ? styles.evaluationBtnActive : ''}`}
										onClick={() => handleEvaluate(entry.value)}
										aria-label={t(entry.labelKey)}
										aria-pressed={isActive}
										title={t(entry.labelKey)}
									>
										<span className={styles.evaluationEmoji} aria-hidden>
											{entry.emoji}
										</span>
									</button>
								);
							})}
						</div>
					)}
					{typeMenuOpen && (
						<div className={styles.typeMenu} role="menu">
							{typeChoices.map((choice) => (
								<button
									key={choice.type}
									role="menuitem"
									className={`${styles.typeMenuItem} ${choice.isCurrent ? styles.typeMenuItemCurrent : ''}`}
									disabled={!choice.allowed}
									title={choice.reasonKey ? t(choice.reasonKey) : undefined}
									onClick={() => handleChangeType(choice.type)}
								>
									<span className={styles.typeMenuSwatch} data-type={choice.type} aria-hidden />
									{t(TYPE_LABEL_KEYS[choice.type] ?? choice.type)}
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* Persistent zoom controls (bottom-start, clear of the FAB). */}
			<PanZoomControls
				fixed
				align="start"
				scale={mapScale}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onFit={handleFitToScreen}
			/>

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
						<button
							onClick={handleFitToScreen}
							title={t('Fit to screen')}
							aria-label={t('Fit to screen')}
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
								<path d="M15 3h6v6" />
								<path d="M9 21H3v-6" />
								<path d="M21 3l-7 7" />
								<path d="M3 21l7-7" />
							</svg>
						</button>
					</div>
				)}
			</div>

			{/* Move Statement Confirmation Modal (or refusal notice) */}
			{mapContext.moveStatementModal && (
				<Modal>
					<div className={styles.moveModal}>
						<h1>{moveError ? t(moveError) : t('Are you sure you want to move statement here?')}</h1>
						<div className={styles.btnBox}>
							{moveError ? (
								<button onClick={closeMoveModal} className="btn btn--large btn--add">
									{t('OK')}
								</button>
							) : (
								<>
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
								</>
							)}
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}

export default memo(MindElixirMap);
