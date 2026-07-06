import {
	CSSProperties,
	DragEvent,
	FC,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { arrayRemove, arrayUnion, updateDoc } from 'firebase/firestore';
import type { MapFilterMetric, MapSynthVisibility, Results, Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { isAdmin as isAdminRole } from '@/controllers/general/helpers';
import { setStatement, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { store } from '@/redux/store';
import { createMindMapChild, updateMindMapNodeText } from '../mapHelpers/mindMapStatements';
import { saveStatementToDB } from '@/controllers/db/statements/setStatements';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	createEmptyCluster,
	setGroupOverride,
	ungroupCluster,
	STANDALONE_OVERRIDE,
} from '@/controllers/db/statements/condensationCuration';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { TIME } from '@/constants/common';
import { CLUSTER_PALETTE, type ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import { focusEditField } from '../mapHelpers/focusEditField';
import { usePanZoom } from '../hooks/usePanZoom';
import PanZoomControls from '../components/PanZoomControls';
import ClusterCard from './ClusterCard';
import type { LocalMapFilter } from './mapLocalFilter';
import styles from './ClusterBoard.module.scss';

interface Props {
	/** Results tree from useMindMap: top = subject, sub = clusters, cluster.sub = members. */
	results: Results;
	/**
	 * Per-viewer local filter override (localStorage-backed, owned by ClusterMap).
	 * When set it takes precedence over the shared statementSettings.map filter, so
	 * a viewer's — or an admin's "only me" — filter affects only their own view.
	 */
	localFilter?: LocalMapFilter | null;
}

// Card + layout geometry (px).
const CARD = 120;
const GAP = 12;
const COLS = 3;
const PILL_RADIUS = 210;
const PILL_W = 180; // approx pill footprint, for spacing pills around the ring
const HUB = 120;

const UNGROUPED_ID = '__ungrouped__';
const UNGROUPED_COLOR: ClusterPaletteEntry = { line: '#9aa3b2', card: '#e7eaf0', text: '#3d4d71' };
const DRAG_MIME = 'application/x-freedi-statement-id';

// Default map typography (rem). Admins override these per question via
// statementSettings.map; the SCSS reads them as CSS custom properties so the
// defaults here and the SCSS fallbacks stay in lock-step.
const MAP_FONT_CARD_DEFAULT = 0.9; // sticky-note text
const MAP_FONT_CLUSTER_DEFAULT = 1; // cluster pill + hub title
// Sensible bounds so a stray setting can't make the board unreadable.
const MAP_FONT_MIN = 0.6;
const MAP_FONT_MAX = 2.2;
const MAP_SYNTH_VISIBILITY_DEFAULT: MapSynthVisibility = 'all';

// A freshly-added option starts at 0 consensus/evaluation, so an active filter
// would hide it the instant it's created — including the card the add-flow just
// dropped into edit mode. We keep the author's new options visible for this long,
// then ask whether to keep showing them or let the filter hide them.
const KEEP_VISIBLE_GRACE_MS = 2 * TIME.MINUTE;

function clampFont(value: number | undefined, fallback: number): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return fallback;

	return Math.min(MAP_FONT_MAX, Math.max(MAP_FONT_MIN, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match) return null;
	const value = parseInt(match[1], 16);

	return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function toHex(r: number, g: number, b: number): string {
	return (
		'#' +
		[r, g, b]
			.map((v) =>
				Math.max(0, Math.min(255, Math.round(v)))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

/** Build a full cluster palette (pill line, light card tint, readable text) from one chosen color. */
function deriveClusterPalette(hex: string): ClusterPaletteEntry {
	const rgb = hexToRgb(hex);
	if (!rgb) return UNGROUPED_COLOR;
	const { r, g, b } = rgb;

	return {
		line: hex,
		card: toHex(r + (255 - r) * 0.82, g + (255 - g) * 0.82, b + (255 - b) * 0.82),
		text: toHex(r * 0.4, g * 0.4, b * 0.4),
	};
}

/**
 * Stable index into the palette derived from the cluster's id. Using the id
 * (not the cluster's position in the array) keeps a cluster's color fixed as
 * notes/clusters are added, removed, or re-sorted — otherwise the same cluster
 * would change color between renders.
 */
function paletteIndexForId(id: string): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}

	return Math.abs(hash) % CLUSTER_PALETTE.length;
}

/** A cluster's color: its saved `color`, else a stable default palette slot from its id. */
function resolveClusterColor(hex: string | undefined, clusterId: string): ClusterPaletteEntry {
	if (!hex) return CLUSTER_PALETTE[paletteIndexForId(clusterId)];
	const preset = CLUSTER_PALETTE.find((entry) => entry.line.toLowerCase() === hex.toLowerCase());

	return preset ?? deriveClusterPalette(hex);
}

/**
 * A normalized cluster ready to render. Clusters and their members all live
 * FLAT under the question; membership is the cluster's `integratedOptions[]`
 * (resolved into `members` by resultsByParentId), so notes stay visible in the
 * main app's option list. The synthetic "Ungrouped" group holds options not in
 * any cluster.
 */
interface BoardCluster {
	id: string;
	label: string;
	color: ClusterPaletteEntry;
	members: Results[];
	/** The cluster statement (isCluster option) — null for the synthetic "Ungrouped" group. */
	clusterStatement: Statement | null;
	/**
	 * Member count BEFORE the map filter hides any — so the "made from N
	 * responses" provenance line reflects how the cluster was formed, not how
	 * many members happen to pass the current filter.
	 */
	sourceCount: number;
}

interface PlacedCluster extends BoardCluster {
	pill: { x: number; y: number };
	grid: { x: number; y: number };
	cols: number;
	/** Half of the grid's largest dimension — used to size the canvas. */
	half: number;
}

/**
 * Custom radial cluster board: a central "Subject" hub with colored cluster
 * pills around it, each cluster's member statements packed as a grid of
 * sticky-note cards. Clusters are isCluster options under the question and
 * notes are options under the question — the same model as the app's grouped
 * suggestions — so everything stays consistent with the main app. Admins manage
 * every card; authors manage their own; anyone with access can add and
 * evaluate. Real-time updates flow in via ClusterMap's mind-map listener.
 */
const ClusterBoard: FC<Props> = ({ results, localFilter }) => {
	const { t } = useTranslation();
	const { user, creator } = useAuthentication();
	const subject = results.top;
	const children = useMemo(() => results.sub ?? [], [results.sub]);

	const subscription = useAppSelector(
		statementSubscriptionSelector(subject.topParentId ?? subject.statementId),
	);
	// The board owner (subject creator) is always an admin of the board, even
	// before their subscription role loads — mirrors StatementTopNav.
	const isAdmin = isAdminRole(subscription?.role) || (!!user && subject.creatorId === user.uid);
	const showEval = subject.statementSettings?.showEvaluation ?? false;
	// How participants rate options on this board — inherited from the question
	// so the sticky notes match every other surface (reactions vs agree/disagree).
	const ratingMode = subject.statementSettings?.ratingMode;
	const canContribute = !!user;

	// Admin-controlled map display (font sizes, which layers render, provenance).
	const mapSettings = subject.statementSettings?.map;
	const synthVisibility = mapSettings?.synthVisibility ?? MAP_SYNTH_VISIBILITY_DEFAULT;
	const showProvenance = mapSettings?.showProvenance ?? true;

	// Response filter. Hides notes whose consensus / average evaluation falls
	// below the threshold; clusters left with no visible members drop off the
	// board. The shared filter is persisted on the question (everyone sees it);
	// a per-viewer `localFilter` (this user's own, or an admin's "only me")
	// overrides it for this device only, so it takes precedence when present.
	const filterMetric: MapFilterMetric =
		localFilter?.filterMetric ?? mapSettings?.filterMetric ?? 'none';
	const minConsensus = localFilter?.minConsensus ?? mapSettings?.minConsensus ?? -1;
	const minAverageEvaluation =
		localFilter?.minAverageEvaluation ?? mapSettings?.minAverageEvaluation ?? -1;

	// Options this user just added that are kept visible past an active filter for
	// a grace period (see KEEP_VISIBLE_GRACE_MS) — session-only and local to this
	// user, so the shared, persisted filter view everyone else sees is untouched.
	// `filterPrompts` queues the "keep visible or hide?" question raised once an
	// exempt option's grace period ends while it's still below the threshold.
	const [exemptIds, setExemptIds] = useState<Set<string>>(() => new Set());
	const [filterPrompts, setFilterPrompts] = useState<{ id: string; text: string }[]>([]);
	const graceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const membersByIdRef = useRef<Map<string, Statement>>(new Map());

	// The filter exactly as configured (ignores the local exemption) — used when a
	// grace period ends to check whether the option now clears the filter on its own.
	const passesRawFilter = useCallback(
		(statement: Statement): boolean => {
			if (filterMetric === 'consensus') return (statement.consensus ?? 0) >= minConsensus;
			if (filterMetric === 'average') {
				return (statement.evaluation?.averageEvaluation ?? 0) >= minAverageEvaluation;
			}

			return true;
		},
		[filterMetric, minConsensus, minAverageEvaluation],
	);
	const passesRawFilterRef = useRef(passesRawFilter);
	passesRawFilterRef.current = passesRawFilter;

	const passesFilter = useCallback(
		(statement: Statement): boolean =>
			exemptIds.has(statement.statementId) || passesRawFilter(statement),
		[exemptIds, passesRawFilter],
	);
	// Drive the SCSS typography off CSS custom properties so admin font sizes
	// apply live to every card/pill/hub without re-styling each node inline.
	const boardFontVars = useMemo<CSSProperties>(
		() =>
			({
				'--map-card-font': `${clampFont(mapSettings?.cardFontRem, MAP_FONT_CARD_DEFAULT)}rem`,
				'--map-cluster-font': `${clampFont(
					mapSettings?.clusterFontRem,
					MAP_FONT_CLUSTER_DEFAULT,
				)}rem`,
			}) as CSSProperties,
		[mapSettings?.cardFontRem, mapSettings?.clusterFontRem],
	);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [colorPickerId, setColorPickerId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const canvasRef = useRef<HTMLDivElement>(null);
	const prevRectsRef = useRef<Map<string, { x: number; y: number; cluster: string }>>(new Map());

	const canManage = useCallback(
		(statement: Statement) => isAdmin || (!!user && statement.creatorId === user.uid),
		[isAdmin, user],
	);

	// Split the question's children into clusters (isCluster) and loose options
	// (rendered in an "Ungrouped" block). resultsByParentId already nested each
	// cluster's members under it via integratedOptions.
	const boardClusters = useMemo(() => {
		const containers: BoardCluster[] = [];
		const loose: Results[] = [];

		// originals-only: ignore clustering entirely — every option (cluster
		// members included) renders as a flat note with no pills/synth groups.
		if (synthVisibility === 'originals-only') {
			children.forEach((child) => {
				if (child.top.isCluster) {
					(child.sub ?? []).forEach((member) => loose.push(member));
				} else {
					loose.push(child);
				}
			});
			const sourceCount = loose.length;
			const visibleLoose = loose.filter((member) => passesFilter(member.top));
			if (visibleLoose.length > 0) {
				containers.push({
					id: UNGROUPED_ID,
					label: t('All responses'),
					color: UNGROUPED_COLOR,
					members: visibleLoose,
					clusterStatement: null,
					sourceCount,
				});
			}

			return containers;
		}

		children.forEach((child) => {
			if (child.top.isCluster) {
				const allMembers = child.sub ?? [];
				const visibleMembers = allMembers.filter((member) => passesFilter(member.top));
				// Drop a cluster only when the filter hid ALL of its members. A
				// genuinely empty cluster (e.g. one just created via "Add cluster",
				// or awaiting its first note) must still render so it can be filled.
				if (allMembers.length > 0 && visibleMembers.length === 0) return;
				containers.push({
					id: child.top.statementId,
					label: child.top.statement,
					color: resolveClusterColor(child.top.color, child.top.statementId),
					members: visibleMembers,
					clusterStatement: child.top,
					sourceCount: allMembers.length,
				});
			} else if (passesFilter(child.top)) {
				loose.push(child);
			}
		});

		// clusters-only: hide the synthetic "Ungrouped" block of un-clustered
		// originals; the cluster/synth groups are all that render.
		if (loose.length > 0 && synthVisibility !== 'clusters-only') {
			containers.push({
				id: UNGROUPED_ID,
				label: t('Ungrouped'),
				color: UNGROUPED_COLOR,
				members: loose,
				clusterStatement: null,
				sourceCount: loose.length,
			});
		}

		return containers;
	}, [children, t, synthVisibility, passesFilter]);

	// Place clusters on a ring. Pills sit on an inner ring near the hub; each
	// grid then hugs its OWN pill at a radius set by that cluster's own size, so
	// small/empty clusters stay close instead of being flung out to match the
	// biggest cluster. Only neighbours that would actually overlap get pushed
	// apart, using their real sizes (law of cosines on their grid centres).
	const layout = useMemo(() => {
		const n = Math.max(boardClusters.length, 1);
		const angleStep = (2 * Math.PI) / n;
		const sinHalf = Math.max(Math.sin(angleStep / 2), 0.001);

		const blocks = boardClusters.map((cluster) => {
			const memberCount = cluster.members.length + (canContribute ? 1 : 0);
			const cols = Math.max(1, Math.min(COLS, memberCount || 1));
			const rows = Math.max(1, Math.ceil((memberCount || 1) / cols));
			const w = cols * CARD + (cols - 1) * GAP;
			const h = rows * CARD + (rows - 1) * GAP;

			// Bounding-circle radius of the block, for collision checks.
			return { cols, w, h, half: Math.hypot(w, h) / 2 };
		});

		// Pills on an inner ring, spaced so the pills themselves don't overlap.
		const pillRing = n > 1 ? Math.max(PILL_RADIUS, (PILL_W + 28) / (2 * sinHalf)) : PILL_RADIUS;

		const angles = boardClusters.map((_, i) => -Math.PI / 2 + i * angleStep);

		// Start each grid just past its pill. The block is axis-aligned, so how far
		// it juts back toward the hub depends on its angle: |w/2·cosθ| + |h/2·sinθ|.
		// Using that (instead of the diagonal) keeps short/wide clusters close.
		const radii = blocks.map((b, i) => {
			const a = angles[i];
			const radialReach = Math.abs((b.w / 2) * Math.cos(a)) + Math.abs((b.h / 2) * Math.sin(a));

			return pillRing + 40 + radialReach;
		});

		// Tangential (sideways-along-the-ring) extent of each axis-aligned block at
		// its angle — this is the room a neighbour actually needs, far less than the
		// block's bounding circle, so we don't over-space radially-placed grids.
		const tang = blocks.map((b, i) => {
			const a = angles[i];

			return Math.abs((b.w / 2) * Math.sin(a)) + Math.abs((b.h / 2) * Math.cos(a));
		});

		// Push apart only neighbouring grids that genuinely overlap.
		if (n > 1) {
			const cos = Math.cos(angleStep);
			for (let pass = 0; pass < 6; pass++) {
				for (let i = 0; i < n; i++) {
					const j = (i + 1) % n;
					const needed = tang[i] + tang[j] + 24;
					const d = Math.sqrt(radii[i] ** 2 + radii[j] ** 2 - 2 * radii[i] * radii[j] * cos);
					if (d < needed) {
						const bump = (needed - d) / 2 + 1;
						radii[i] += bump;
						radii[j] += bump;
					}
				}
			}
		}

		return boardClusters.map((cluster, i): PlacedCluster => {
			const angle = angles[i];
			const dir = { x: Math.cos(angle), y: Math.sin(angle) };

			return {
				...cluster,
				pill: { x: dir.x * pillRing, y: dir.y * pillRing },
				grid: { x: dir.x * radii[i], y: dir.y * radii[i] },
				cols: blocks[i].cols,
				half: blocks[i].half,
			};
		});
	}, [boardClusters, canContribute]);

	// Canvas big enough to hold the outermost grids; hub is centered.
	const reach = useMemo(() => {
		let max = PILL_RADIUS + 240;
		for (const l of layout) {
			max = Math.max(max, Math.hypot(l.grid.x, l.grid.y) + l.half + 60);
		}

		return max;
	}, [layout]);

	const size = reach * 2;
	const cx = reach;
	const cy = reach;

	// Pan & zoom navigation: wheel/pinch to zoom, drag (or Space+drag) to pan,
	// buttons to zoom and fit the whole board into view.
	const {
		viewportRef,
		transform,
		scaleRef,
		spaceHeld,
		isPanning,
		zoomIn,
		zoomOut,
		fit,
		onPointerDown,
	} = usePanZoom({ contentWidth: size, contentHeight: size });

	// memberId → the cluster statement it currently belongs to (for moves).
	const sourceClusterByMember = useMemo(() => {
		const map = new Map<string, Statement>();
		for (const cluster of boardClusters) {
			if (!cluster.clusterStatement) continue;
			for (const member of cluster.members) {
				map.set(member.top.statementId, cluster.clusterStatement);
			}
		}

		return map;
	}, [boardClusters]);

	const membersById = useMemo(() => {
		const map = new Map<string, Statement>();
		for (const cluster of boardClusters) {
			for (const member of cluster.members) {
				map.set(member.top.statementId, member.top);
			}
		}

		return map;
	}, [boardClusters]);
	// Keep the grace-timer callback reading the latest member statements (fresh
	// consensus/evaluation) without re-arming the timer on every board update.
	membersByIdRef.current = membersById;

	const clusterById = useMemo(() => {
		const map = new Map<string, Statement | null>();
		for (const cluster of boardClusters) {
			map.set(cluster.id, cluster.clusterStatement);
		}

		return map;
	}, [boardClusters]);

	// Keep a freshly-added option visible past an active filter, then — once the
	// grace period ends — either stop exempting it silently (it has since cleared
	// the filter, or was deleted) or ask the author whether to keep showing it.
	const keepVisibleDuringGrace = useCallback((statementId: string) => {
		setExemptIds((prev) => {
			if (prev.has(statementId)) return prev;
			const next = new Set(prev);
			next.add(statementId);

			return next;
		});
		const existing = graceTimers.current.get(statementId);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			graceTimers.current.delete(statementId);
			const statement = membersByIdRef.current.get(statementId);
			if (!statement || passesRawFilterRef.current(statement)) {
				setExemptIds((prev) => {
					if (!prev.has(statementId)) return prev;
					const next = new Set(prev);
					next.delete(statementId);

					return next;
				});

				return;
			}
			setFilterPrompts((prev) =>
				prev.some((p) => p.id === statementId)
					? prev
					: [...prev, { id: statementId, text: statement.statement }],
			);
		}, KEEP_VISIBLE_GRACE_MS);
		graceTimers.current.set(statementId, timer);
	}, []);

	// Answer the "keep visible or hide?" prompt: keep leaves the option exempt for
	// the rest of the session; hide drops the exemption so the filter hides it.
	const resolveFilterPrompt = useCallback((statementId: string, keep: boolean) => {
		setFilterPrompts((prev) => prev.filter((p) => p.id !== statementId));
		if (keep) return;
		setExemptIds((prev) => {
			if (!prev.has(statementId)) return prev;
			const next = new Set(prev);
			next.delete(statementId);

			return next;
		});
	}, []);

	// When the filter is switched off there's nothing to exempt or ask about —
	// drop any pending timers, exemptions and prompts.
	useEffect(() => {
		if (filterMetric !== 'none') return;
		graceTimers.current.forEach((timer) => clearTimeout(timer));
		graceTimers.current.clear();
		setExemptIds((prev) => (prev.size ? new Set() : prev));
		setFilterPrompts((prev) => (prev.length ? [] : prev));
	}, [filterMetric]);

	// Clear any outstanding grace timers on unmount.
	useEffect(() => {
		const timers = graceTimers.current;

		return () => timers.forEach((timer) => clearTimeout(timer));
	}, []);

	// FLIP: animate a card gliding to its new spot ONLY when it actually changes
	// cluster (a real move, local or from another participant). Cards that merely
	// shift because the board reflowed (an add/remove elsewhere, canvas resize)
	// jump instantly — otherwise the whole board "bumps" on every update.
	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		const canvasRect = canvas.getBoundingClientRect();
		const cards = canvas.querySelectorAll<HTMLElement>('[data-flip-id]');
		const nextRects = new Map<string, { x: number; y: number; cluster: string }>();

		cards.forEach((el) => {
			const id = el.getAttribute('data-flip-id');
			if (!id) return;
			const cluster = el.getAttribute('data-cluster-id') ?? '';
			const rect = el.getBoundingClientRect();
			const pos = { x: rect.left - canvasRect.left, y: rect.top - canvasRect.top, cluster };
			nextRects.set(id, pos);

			if (reduceMotion) return;
			const prev = prevRectsRef.current.get(id);
			// Only animate a genuine cluster change.
			if (!prev || prev.cluster === cluster) return;
			// Rects are measured in (scaled) screen space; the card's own transform
			// is applied in its local space, so divide out the canvas zoom.
			const zoom = scaleRef.current || 1;
			const dx = (prev.x - pos.x) / zoom;
			const dy = (prev.y - pos.y) / zoom;
			if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

			// Invert: jump back to the old position with no transition…
			el.style.transition = 'none';
			el.style.transform = `translate(${dx}px, ${dy}px)`;
			// …then play: animate to the natural new position on the next frame.
			requestAnimationFrame(() => {
				el.style.transition = 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)';
				el.style.transform = '';
				const onEnd = () => {
					el.style.transition = '';
					el.removeEventListener('transitionend', onEnd);
				};
				el.addEventListener('transitionend', onEnd);
			});
		});

		prevRectsRef.current = nextRects;
		// Re-measure only when the board structure changes — NOT on every pan/zoom
		// re-render, which would query every card's rect on each pointer move.
	}, [layout]);

	// Listen to the current user's evaluations under the subject and each cluster
	// so cast votes show their selected state.
	useEffect(() => {
		if (!user) return;
		const parentIds = [subject.statementId, ...children.map((c) => c.top.statementId)];
		const unsubscribers = parentIds.map((id) => listenToEvaluations(id, undefined, user.uid));

		return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
	}, [user, subject.statementId, children]);

	const saveText = async (statement: Statement, value: string) => {
		setEditingId(null);
		const trimmed = value.trim();
		if (!trimmed || trimmed === statement.statement) return;
		await updateMindMapNodeText({ statement, newText: trimmed });
	};

	const setClusterColor = async (clusterStatement: Statement, hex: string) => {
		setColorPickerId(null);
		if (clusterStatement.color === hex) return;
		try {
			await updateDoc(createStatementRef(clusterStatement.statementId), {
				color: hex,
				lastUpdate: getCurrentTimestamp(),
			});
		} catch (error) {
			logError(error, {
				operation: 'ClusterBoard.setClusterColor',
				statementId: clusterStatement.statementId,
			});
		}
	};

	// Update membership: members and clusters all stay parented to the question;
	// only the clusters' integratedOptions and the parent's override map change.
	const assignMember = async (memberId: string, from: Statement | null, to: Statement | null) => {
		const ts = getCurrentTimestamp();
		const ops: Promise<void>[] = [];
		if (from) {
			ops.push(
				updateDoc(createStatementRef(from.statementId), {
					integratedOptions: arrayRemove(memberId),
					lastUpdate: ts,
				}),
			);
		}
		if (to) {
			ops.push(
				updateDoc(createStatementRef(to.statementId), {
					integratedOptions: arrayUnion(memberId),
					lastUpdate: ts,
				}),
			);
		}
		await Promise.all(ops);
		// Mirror the change into the parent's creator overrides so the
		// condensation pipeline and the grouped view stay consistent.
		await setGroupOverride({
			parentStatementId: subject.statementId,
			originalId: memberId,
			targetClusterId: to ? to.statementId : STANDALONE_OVERRIDE,
			currentAssignments: subject.creatorOverrides?.assignments ?? {},
		}).catch(() => {
			// best-effort; integratedOptions is the source of truth for display
		});
	};

	// New notes are options under the question; if added to a cluster, also join
	// that cluster's integratedOptions.
	const addMember = async (cluster: BoardCluster) => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await createMindMapChild({ parentStatement: subject });
			if (created) {
				setEditingId(created.statementId);
				// A new option starts below any active filter; keep it visible to the
				// author for a grace period instead of letting it vanish instantly.
				if (filterMetric !== 'none') keepVisibleDuringGrace(created.statementId);
				// Assign to the cluster in the background so a slow write never
				// leaves the add button stuck disabled.
				if (cluster.clusterStatement) {
					assignMember(created.statementId, null, cluster.clusterStatement).catch((error) =>
						logError(error, {
							operation: 'ClusterBoard.addMember.assign',
							statementId: created.statementId,
						}),
					);
				}
			}
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.addMember', statementId: subject.statementId });
		} finally {
			setBusy(false);
		}
	};

	// A cluster is an isCluster option under the question (same as the app's
	// grouped suggestions), so it stays consistent with the main app.
	const addCluster = async () => {
		if (busy || !creator) return;
		setBusy(true);
		try {
			await createEmptyCluster({ parentStatement: subject, title: t('New cluster'), creator });
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.addCluster', statementId: subject.statementId });
		} finally {
			setBusy(false);
		}
	};

	// Delete a cluster: the cluster statement is removed and any overrides that
	// pointed at it are cleared. Its notes are plain options under the question,
	// so they survive and reappear in the "Ungrouped" block.
	const removeCluster = async (cluster: BoardCluster) => {
		if (!cluster.clusterStatement || busy) return;
		const confirmed = window.confirm(t('Delete this cluster? Its notes will move to Ungrouped.'));
		if (!confirmed) return;
		setBusy(true);
		try {
			await ungroupCluster({
				parentStatementId: subject.statementId,
				clusterId: cluster.clusterStatement.statementId,
				currentAssignments: subject.creatorOverrides?.assignments ?? {},
			});
		} catch (error) {
			logError(error, {
				operation: 'ClusterBoard.removeCluster',
				statementId: cluster.clusterStatement.statementId,
			});
		} finally {
			setBusy(false);
		}
	};

	const duplicate = async (member: Statement, cluster: BoardCluster) => {
		if (busy) return;
		setBusy(true);
		try {
			const created = await saveStatementToDB({
				text: member.statement,
				parentStatement: subject,
				statementType: member.statementType,
			});
			if (created) {
				store.dispatch(setStatement(created));
				// Like a new option, a duplicate starts below any active filter — keep
				// it visible to the author for a grace period rather than vanishing.
				if (filterMetric !== 'none') keepVisibleDuringGrace(created.statementId);
				if (cluster.clusterStatement) {
					await assignMember(created.statementId, null, cluster.clusterStatement);
				}
			}
		} catch (error) {
			logError(error, { operation: 'ClusterBoard.duplicate', statementId: member.statementId });
		} finally {
			setBusy(false);
		}
	};

	const remove = async (member: Statement) => {
		await deleteStatementFromDB(member, canManage(member), t);
	};

	const moveMember = async (member: Statement, targetClusterId: string) => {
		if (!canManage(member)) return;
		const from = sourceClusterByMember.get(member.statementId) ?? null;
		const to = clusterById.get(targetClusterId) ?? null;
		if (from?.statementId === to?.statementId) return;
		try {
			await assignMember(member.statementId, from, to);
		} catch (error) {
			logError(error, {
				operation: 'ClusterBoard.moveMember',
				statementId: member.statementId,
				metadata: { targetClusterId },
			});
		}
	};

	const handleDrop = (e: DragEvent, targetClusterId: string) => {
		e.preventDefault();
		const draggedId = e.dataTransfer.getData(DRAG_MIME);
		const dragged = draggedId ? membersById.get(draggedId) : undefined;
		if (dragged) moveMember(dragged, targetClusterId);
	};

	const handleDragStart = (e: DragEvent, member: Statement) => {
		e.dataTransfer.setData(DRAG_MIME, member.statementId);
		e.dataTransfer.effectAllowed = 'move';
	};

	return (
		<div
			className={`${styles.scroll} ${spaceHeld ? styles.spaceReady : ''} ${
				isPanning ? styles.panning : ''
			}`}
			ref={viewportRef}
			onPointerDown={onPointerDown}
			style={boardFontVars}
		>
			<div
				className={styles.pan}
				style={{
					transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
				}}
			>
				<div className={styles.canvas} ref={canvasRef} style={{ width: size, height: size }}>
					{colorPickerId && (
						<div
							className={styles.pickerBackdrop}
							// data-no-pan so the press isn't swallowed by canvas panning.
							data-no-pan
							onPointerDown={() => setColorPickerId(null)}
							aria-hidden
						/>
					)}
					<svg className={styles.connectors} width={size} height={size} aria-hidden>
						{layout.map((l) => {
							const x2 = cx + l.pill.x;
							const y2 = cy + l.pill.y;
							const c1y = cy + l.pill.y * 0.25;
							const c2x = cx + l.pill.x * 0.75;

							return (
								<path
									key={l.id}
									d={`M ${cx} ${cy} C ${cx} ${c1y}, ${c2x} ${y2}, ${x2} ${y2}`}
									fill="none"
									stroke={l.color.line}
									strokeWidth={2}
									opacity={0.7}
								/>
							);
						})}
					</svg>

					<div
						className={styles.hub}
						style={{ left: cx, top: cy, width: HUB, height: HUB }}
						title={subject.statement}
					>
						<span className={styles.hubText}>{subject.statement}</span>
					</div>

					{canContribute && (
						<button
							type="button"
							className={styles.addCluster}
							style={{ left: cx, top: cy + HUB / 2 + 18 }}
							onClick={addCluster}
							disabled={busy || !creator}
							title={!creator ? t('Signing you in…') : undefined}
						>
							+ {t('Add cluster')}
						</button>
					)}

					{layout.map((l) => {
						const canEditPill = !!l.clusterStatement && canManage(l.clusterStatement);
						const moveTargets = boardClusters
							.filter((c) => c.id !== l.id)
							.map((c) => ({ id: c.id, label: c.label }));

						return (
							<div key={l.id}>
								<div
									className={styles.pill}
									style={{
										left: cx + l.pill.x,
										top: cy + l.pill.y,
										background: l.color.line,
										zIndex: colorPickerId === l.id ? 12 : undefined,
									}}
									// Keep the pill clickable (edit/color/delete) — don't let a press
									// on it start a canvas pan, which would swallow the double-click.
									data-no-pan
									onDoubleClick={canEditPill ? () => setEditingId(l.id) : undefined}
								>
									{editingId === l.id && l.clusterStatement ? (
										<textarea
											className={styles.pillEdit}
											defaultValue={l.clusterStatement.statement}
											// Focus on pointer devices only; on touch this would scroll
											// the field into view and yank the map viewport.
											ref={focusEditField}
											onFocus={(e) => e.currentTarget.select()}
											onBlur={(e) =>
												saveText(l.clusterStatement as Statement, e.currentTarget.value)
											}
											onKeyDown={(e) => {
												if (e.key === 'Enter' && !e.shiftKey) {
													e.preventDefault();
													e.currentTarget.blur();
												}
												if (e.key === 'Escape') setEditingId(null);
											}}
										/>
									) : (
										l.label
									)}

									{showProvenance &&
										l.clusterStatement &&
										editingId !== l.id &&
										l.sourceCount > 0 && (
											<span
												className={styles.provenance}
												title={t('This cluster was made from these responses')}
											>
												{t('made from {count} responses').replace('{count}', String(l.sourceCount))}
											</span>
										)}

									{canEditPill && editingId !== l.id && (
										<button
											type="button"
											className={styles.colorDot}
											aria-label={t('Change color')}
											title={t('Change color')}
											onClick={(e) => {
												e.stopPropagation();
												setColorPickerId((id) => (id === l.id ? null : l.id));
											}}
										/>
									)}

									{canEditPill && editingId !== l.id && (
										<button
											type="button"
											className={styles.deleteDot}
											aria-label={t('Delete cluster')}
											title={t('Delete cluster')}
											disabled={busy}
											onClick={(e) => {
												e.stopPropagation();
												removeCluster(l);
											}}
										>
											×
										</button>
									)}

									{colorPickerId === l.id && l.clusterStatement && (
										<div className={styles.colorPopover}>
											{CLUSTER_PALETTE.map((entry) => (
												<button
													key={entry.line}
													type="button"
													className={styles.swatch}
													style={{ background: entry.line }}
													aria-label={entry.line}
													onClick={() =>
														setClusterColor(l.clusterStatement as Statement, entry.line)
													}
												/>
											))}
											<input
												type="color"
												className={styles.colorInput}
												defaultValue={l.color.line}
												aria-label={t('Custom color')}
												onChange={(e) =>
													setClusterColor(l.clusterStatement as Statement, e.target.value)
												}
											/>
										</div>
									)}
								</div>

								<div
									className={styles.grid}
									style={{
										left: cx + l.grid.x,
										top: cy + l.grid.y,
										gridTemplateColumns: `repeat(${l.cols}, ${CARD}px)`,
										gap: GAP,
									}}
									onDragOver={(e) => e.preventDefault()}
									onDrop={(e) => handleDrop(e, l.id)}
								>
									{l.members.map((member) => (
										<ClusterCard
											key={member.top.statementId}
											statement={member.top}
											color={l.color}
											canManage={canManage(member.top)}
											showEval={showEval}
											ratingMode={ratingMode}
											isEditing={editingId === member.top.statementId}
											onRequestEdit={() => setEditingId(member.top.statementId)}
											onSaveText={(value) => saveText(member.top, value)}
											onCancelEdit={() => setEditingId(null)}
											onDuplicate={() => duplicate(member.top, l)}
											onDelete={() => remove(member.top)}
											onDragStart={(e) => handleDragStart(e, member.top)}
											clusterId={l.id}
											moveTargets={moveTargets}
											onMove={(targetId) => moveMember(member.top, targetId)}
										/>
									))}
									{canContribute && (
										<button
											type="button"
											className={styles.addCard}
											style={{ color: l.color.text }}
											onClick={() => addMember(l)}
											disabled={busy}
											aria-label={t('Add statement')}
										>
											+
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<PanZoomControls scale={transform.scale} onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={fit} />

			{filterPrompts.length > 0 && (
				<div className={styles.filterPrompt} role="alertdialog" aria-live="polite" data-no-pan>
					<div className={styles.filterPromptBody}>
						<span className={styles.filterPromptTitle}>
							{t('Your new option does not meet the current filter yet.')}
						</span>
						<span className={styles.filterPromptText} dir="auto">
							{filterPrompts[0].text || t('Untitled option')}
						</span>
					</div>
					<div className={styles.filterPromptActions}>
						<button
							type="button"
							className={styles.filterPromptKeep}
							onClick={() => resolveFilterPrompt(filterPrompts[0].id, true)}
						>
							{t('Keep visible')}
						</button>
						<button
							type="button"
							className={styles.filterPromptHide}
							onClick={() => resolveFilterPrompt(filterPrompts[0].id, false)}
						>
							{t('Hide')}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default ClusterBoard;
