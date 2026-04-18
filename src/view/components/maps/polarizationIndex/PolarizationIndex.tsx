import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { listenToPolarizationIndex } from '@/controllers/db/polarizationIndex/getPolarizationIndex';
import {
	selectPolarizationIndexByParentId,
	selectEffectiveQuestions,
} from '@/redux/userDemographic/userDemographicSlice';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';
import styles from './PolarizationIndex.module.scss';
import { PolarizationIndex, UserDemographicQuestion } from '@freedi/shared-types';
import {
	listenToUserDemographicQuestions,
	listenToGroupDemographicQuestions,
} from '@/controllers/db/userDemographic/getUserDemographic';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logError } from '@/utils/errorHandling';
import BreakdownPanel from './BreakdownPanel';
import HexClusterPanel from './HexClusterPanel';

const HIT_THRESHOLD_PX = 40;
const MOBILE_BREAKPOINT = 768;
// Auto-suggest hex mode when raw dot count exceeds this — but the user
// always has the toggle.
const HEX_AUTO_THRESHOLD = 60;
// Pointy-top hex pixel size (radius from center to vertex).
const HEX_SIZE = 32;
const HEX_W = Math.sqrt(3) * HEX_SIZE;
const HEX_H = 2 * HEX_SIZE;
type ViewMode = 'dots' | 'hex';

// Quadrant viewports for zoom-into-zone. Each maps a (mean, mad) sub-rectangle
// to the full board. `null` = full view (the default).
type ZoneKey = 'consensus' | 'rejection' | 'polarized' | 'neutral';

interface Viewport {
	meanMin: number;
	meanMax: number;
	madMin: number;
	madMax: number;
}

const FULL_VIEWPORT: Viewport = { meanMin: -1, meanMax: 1, madMin: 0, madMax: 1 };

const ZONE_VIEWPORTS: Record<ZoneKey, Viewport> = {
	// Bottom-right of the chart: high agreement, low polarization.
	consensus: { meanMin: 0, meanMax: 1, madMin: 0, madMax: 0.55 },
	// Bottom-left: high disagreement, low polarization.
	rejection: { meanMin: -1, meanMax: 0, madMin: 0, madMax: 0.55 },
	// Top: high polarization, full mean range.
	polarized: { meanMin: -1, meanMax: 1, madMin: 0.45, madMax: 1 },
	// Bottom-center: low polarization, narrow mean range around 0.
	neutral: { meanMin: -0.4, meanMax: 0.4, madMin: 0, madMax: 0.45 },
};

interface HitTarget {
	kind: 'point' | 'hex';
	x: number;
	y: number;
	label: string;
	mean: number;
	mad: number;
	n: number;
	color: string;
	statementId: string;
	// For hex hits: the underlying point statementIds (length >= 2)
	hexStatementIds?: string[];
}

// Hex bucket of one or more points with the same hex grid cell.
interface HexBin {
	q: number;
	r: number;
	x: number;
	y: number;
	points: Point[];
	avgMean: number;
	avgMad: number;
	totalN: number;
}

function pixelToHex(x: number, y: number): { q: number; r: number } {
	const q = (x * Math.sqrt(3)) / 3 / HEX_SIZE - y / 3 / HEX_SIZE;
	const r = (y * 2) / 3 / HEX_SIZE;

	return cubeRound(q, r);
}

function cubeRound(q: number, r: number): { q: number; r: number } {
	const s = -q - r;
	let rq = Math.round(q);
	let rr = Math.round(r);
	const rs = Math.round(s);
	const dq = Math.abs(rq - q);
	const dr = Math.abs(rr - r);
	const ds = Math.abs(rs - s);
	if (dq > dr && dq > ds) rq = -rr - rs;
	else if (dr > ds) rr = -rq - rs;

	return { q: rq, r: rr };
}

function hexToPixel(q: number, r: number): { x: number; y: number } {
	const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
	const y = HEX_SIZE * ((3 / 2) * r);

	return { x, y };
}

function buildHexBins(points: Point[]): HexBin[] {
	const buckets = new Map<string, HexBin>();
	for (const p of points) {
		if (!p?.position) continue;
		const { q, r } = pixelToHex(p.position.x, p.position.y);
		const key = `${q}_${r}`;
		const existing = buckets.get(key);
		if (existing) {
			existing.points.push(p);
		} else {
			const center = hexToPixel(q, r);
			buckets.set(key, {
				q,
				r,
				x: center.x,
				y: center.y,
				points: [p],
				avgMean: 0,
				avgMad: 0,
				totalN: 0,
			});
		}
	}
	// Aggregate stats per bin (weighted by N so big-cohort solutions matter more).
	for (const bin of buckets.values()) {
		let weightedMean = 0;
		let weightedMad = 0;
		let totalN = 0;
		for (const p of bin.points) {
			const w = Math.max(1, p.overallN);
			weightedMean += p.overallMean * w;
			weightedMad += p.overallMAD * w;
			totalN += p.overallN;
		}
		const totalW = bin.points.reduce((s, p) => s + Math.max(1, p.overallN), 0);
		bin.avgMean = weightedMean / totalW;
		bin.avgMad = weightedMad / totalW;
		bin.totalN = totalN;
	}

	return [...buckets.values()];
}

function agreementPercent(mean: number): number {
	return Math.round(((mean + 1) / 2) * 100);
}

function verdictKey(mad: number, mean: number): string {
	if (mad >= 0.5) return 'Sharply divided';
	if (Math.abs(mean) < 0.2) return 'Neutral';
	if (mean >= 0.5) return 'Strong consensus';
	if (mean <= -0.5) return 'Strong rejection';
	if (mean > 0) return 'Mild agreement';

	return 'Mild disagreement';
}

/**
 * Converts agreement level (-1 to +1) to a color on red-yellow-green gradient
 * -1 = red (disagree), 0 = yellow (neutral), +1 = green (agree)
 */
function getAgreementColor(mean: number): string {
	// Clamp mean to [-1, 1]
	const clampedMean = Math.max(-1, Math.min(1, mean));

	// Red: rgb(220, 53, 69) - #dc3545
	// Yellow: rgb(255, 193, 7) - #ffc107
	// Green: rgb(40, 167, 69) - #28a745

	if (clampedMean <= 0) {
		// Interpolate from red (-1) to yellow (0)
		const t = clampedMean + 1; // 0 to 1
		const r = Math.round(220 + (255 - 220) * t);
		const g = Math.round(53 + (193 - 53) * t);
		const b = Math.round(69 + (7 - 69) * t);

		return `rgb(${r}, ${g}, ${b})`;
	} else {
		// Interpolate from yellow (0) to green (1)
		const t = clampedMean; // 0 to 1
		const r = Math.round(255 + (40 - 255) * t);
		const g = Math.round(193 + (167 - 193) * t);
		const b = Math.round(7 + (69 - 7) * t);

		return `rgb(${r}, ${g}, ${b})`;
	}
}

interface Group {
	option: {
		option: string;
		color?: string;
	};
	mean: number;
	n: number;
	mad: number;
	position?: {
		x: number;
		y: number;
	};
}

interface Axis {
	questionId: string;
	question: string;
	groupsMAD: number;
	groups: Group[];
}

interface Point {
	statementId: string;
	statement: string;
	overallMAD: number;
	overallMean: number;
	overallN: number;
	axes: Axis[];
	color: string;
	position?: {
		x: number;
		y: number;
	};
}

const PolarizationIndexComp = () => {
	const { statementId } = useParams();
	const { t } = useTranslation();
	const statement = useSelector(statementSelector(statementId));
	const topParentId = statement?.topParentId || statementId;
	const polarizationIndexes = useSelector(selectPolarizationIndexByParentId(statementId));
	const userQuestions: UserDemographicQuestion[] = useSelector(
		selectEffectiveQuestions(statementId || '', topParentId || ''),
	);

	const [boardDimensions, setBoardDimensions] = useState({ width: 0, height: 0 });
	const [showGroups, setShowGroups] = useState<string | null>(null);
	const [currentStatementId, setCurrentStatementId] = useState<string | null>(null);
	const [hoveredTarget, setHoveredTarget] = useState<HitTarget | null>(null);
	const [tooltipPinned, setTooltipPinned] = useState(false);
	const [zoomedZone, setZoomedZone] = useState<ZoneKey | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>('dots');
	const [clusterPoints, setClusterPoints] = useState<Point[] | null>(null);
	const boardRef = useRef<HTMLDivElement>(null);

	const viewport = zoomedZone ? ZONE_VIEWPORTS[zoomedZone] : FULL_VIEWPORT;
	const rawPoints = calculatePositions(
		polarizationIndexes,
		boardDimensions,
		userQuestions,
		viewport,
	);
	// When zoomed, filter to points whose (mean, mad) actually fall in the
	// zone — avoids dots being drawn at clamped edges or off-screen.
	const visiblePoints = useMemo(() => {
		if (!zoomedZone) return rawPoints;

		return rawPoints.filter(
			(p) =>
				!!p &&
				p.overallMean >= viewport.meanMin &&
				p.overallMean <= viewport.meanMax &&
				p.overallMAD >= viewport.madMin &&
				p.overallMAD <= viewport.madMax,
		);
	}, [rawPoints, zoomedZone, viewport]);
	// Spread overlapping main dots so each is visible. Only meaningful in dots
	// mode — in hex mode dots are pre-aggregated so overlap is the whole point.
	const points = useMemo(
		() =>
			viewMode === 'dots'
				? spreadOverlappingPoints(visiblePoints, boardDimensions)
				: (visiblePoints.filter((p): p is Point => Boolean(p?.position)) as Point[]),
		[visiblePoints, boardDimensions, viewMode],
	);

	// Hex bins are built from the *unspread* points (since spreading would
	// distort the bins). Only computed when hex mode is on.
	const hexBins = useMemo<HexBin[]>(() => {
		if (viewMode !== 'hex') return [];
		const ps = visiblePoints.filter((p): p is Point => Boolean(p?.position));

		return buildHexBins(ps);
	}, [viewMode, visiblePoints]);

	const handleZoneZoom = useCallback((zone: ZoneKey) => {
		setZoomedZone((cur) => (cur === zone ? null : zone));
		setHoveredTarget(null);
		setTooltipPinned(false);
	}, []);

	const handleResetZoom = useCallback(() => {
		setZoomedZone(null);
		setHoveredTarget(null);
		setTooltipPinned(false);
	}, []);

	// Data shape for the BreakdownPanel — flattened groups across all axes,
	// each tagged with its question for the in-panel listing.
	const breakdownProps = useMemo(() => {
		if (!showGroups) return null;
		const parent = points.find((p) => p?.statementId === showGroups);
		if (!parent) return null;
		const groups = parent.axes.flatMap((axis: Axis) =>
			axis.groups.map((group: Group) => ({
				option: group.option.option,
				color: group.option.color || '#808080',
				mean: group.mean,
				mad: group.mad,
				n: group.n,
				questionId: axis.questionId,
				question: axis.question,
			})),
		);

		return {
			title: parent.statement,
			verdict: verdictKey(parent.overallMAD, parent.overallMean),
			overallMean: parent.overallMean,
			overallN: parent.overallN,
			groups,
		};
	}, [points, showGroups]);

	// Hit targets adapt to the current view mode. In dots mode, each main
	// statement dot is its own target. In hex mode, single-occupant hexes
	// behave like dots and multi-occupant hexes are a single hit target
	// representing the whole cluster.
	const hitTargets = useMemo<HitTarget[]>(() => {
		const targets: HitTarget[] = [];
		if (viewMode === 'dots') {
			for (const point of points) {
				if (!point?.position) continue;
				targets.push({
					kind: 'point',
					x: point.position.x,
					y: point.position.y,
					label: point.statement,
					mean: point.overallMean,
					mad: point.overallMAD,
					n: point.overallN,
					color: getAgreementColor(point.overallMean),
					statementId: point.statementId,
				});
			}
		} else {
			for (const bin of hexBins) {
				if (bin.points.length === 1) {
					const p = bin.points[0];
					if (!p.position) continue;
					targets.push({
						kind: 'point',
						x: p.position.x,
						y: p.position.y,
						label: p.statement,
						mean: p.overallMean,
						mad: p.overallMAD,
						n: p.overallN,
						color: getAgreementColor(p.overallMean),
						statementId: p.statementId,
					});
				} else {
					targets.push({
						kind: 'hex',
						x: bin.x,
						y: bin.y,
						label: `${bin.points.length} ${t('solutions')}`,
						mean: bin.avgMean,
						mad: bin.avgMad,
						n: bin.totalN,
						color: getAgreementColor(bin.avgMean),
						statementId: `hex-${bin.q}-${bin.r}`,
						hexStatementIds: bin.points.map((p) => p.statementId),
					});
				}
			}
		}

		return targets;
	}, [viewMode, points, hexBins, t]);

	const findNearest = useCallback(
		(mx: number, my: number): HitTarget | null => {
			let best: HitTarget | null = null;
			let bestDist = Infinity;
			for (const target of hitTargets) {
				const dist = Math.hypot(target.x - mx, target.y - my);
				if (dist < bestDist) {
					bestDist = dist;
					best = target;
				}
			}

			return best && bestDist <= HIT_THRESHOLD_PX ? best : null;
		},
		[hitTargets],
	);

	useEffect(() => {
		let unsubscribe: () => void;
		let userDataQuestionsUnsubscribe: () => void;
		let groupDemographicsUnsubscribe: () => void;

		if (statementId) {
			unsubscribe = listenToPolarizationIndex(statementId);
			userDataQuestionsUnsubscribe = listenToUserDemographicQuestions(statementId);
		}

		if (topParentId) {
			groupDemographicsUnsubscribe = listenToGroupDemographicQuestions(topParentId);
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
			if (userDataQuestionsUnsubscribe) {
				userDataQuestionsUnsubscribe();
			}
			if (groupDemographicsUnsubscribe) {
				groupDemographicsUnsubscribe();
			}
		};
	}, [statementId, topParentId]);

	useEffect(() => {
		const boardElement = document.querySelector(`.${styles.board}`);
		if (boardElement) {
			const updateDimensions = () => {
				setBoardDimensions({
					width: boardElement.clientWidth,
					height: boardElement.clientHeight,
				});
			};

			updateDimensions();
			window.addEventListener('resize', updateDimensions);

			return () => {
				window.removeEventListener('resize', updateDimensions);
			};
		}
	}, []);

	function handleShowGroups(statementId: string) {
		setShowGroups(statementId);
		setCurrentStatementId(statementId);
	}

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			// On touch, hover is meaningless — we'll surface the tooltip on tap.
			if (e.pointerType === 'touch') return;
			if (tooltipPinned) return;
			const rect = e.currentTarget.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			setHoveredTarget(findNearest(mx, my));
		},
		[findNearest, tooltipPinned],
	);

	const handlePointerLeave = useCallback(() => {
		if (tooltipPinned) return;
		setHoveredTarget(null);
	}, [tooltipPinned]);

	const handleBoardClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const rect = e.currentTarget.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const target = findNearest(mx, my);

			if (!target) {
				// Empty click — clear everything.
				setTooltipPinned(false);
				setHoveredTarget(null);
				setShowGroups(null);
				setCurrentStatementId(null);

				return;
			}

			if (target.kind === 'point') {
				handleShowGroups(target.statementId);
			} else if (target.kind === 'hex' && target.hexStatementIds) {
				// Open the cluster listing for this hex.
				const ids = new Set(target.hexStatementIds);
				const list = points.filter((p): p is Point => Boolean(p && ids.has(p.statementId)));
				setClusterPoints(list);
			}
			// On touch, pin the tooltip until the next empty-area tap.
			if (window.innerWidth <= MOBILE_BREAKPOINT) {
				setHoveredTarget(target);
				setTooltipPinned(true);
			}
		},
		[findNearest, points],
	);

	// Keyboard navigation: arrow keys move focus to the nearest dot in the
	// pressed direction; Enter/Space opens the breakdown for the focused dot;
	// Escape clears focus. The "focused" dot piggybacks on `hoveredTarget` so
	// the same tooltip and visual highlight apply.
	const handleBoardKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			if (!hitTargets.length) return;

			if (e.key === 'Escape') {
				e.preventDefault();
				setHoveredTarget(null);
				setTooltipPinned(false);

				return;
			}

			if (e.key === 'Enter' || e.key === ' ') {
				if (hoveredTarget) {
					e.preventDefault();
					handleShowGroups(hoveredTarget.statementId);
				}

				return;
			}

			const dirs: Record<string, [number, number]> = {
				ArrowRight: [1, 0],
				ArrowLeft: [-1, 0],
				ArrowDown: [0, 1],
				ArrowUp: [0, -1],
			};
			const dir = dirs[e.key];
			if (!dir) return;
			e.preventDefault();

			// First arrow press with no focus: pick the dot nearest the
			// chart center so subsequent arrows have a stable starting point.
			if (!hoveredTarget) {
				const cx = boardDimensions.width / 2;
				const cy = boardDimensions.height / 2;
				let bestIdx = 0;
				let bestDist = Infinity;
				for (let i = 0; i < hitTargets.length; i++) {
					const d = Math.hypot(hitTargets[i].x - cx, hitTargets[i].y - cy);
					if (d < bestDist) {
						bestDist = d;
						bestIdx = i;
					}
				}
				setHoveredTarget(hitTargets[bestIdx]);

				return;
			}

			// Find nearest dot in the requested direction. We project each
			// candidate's offset onto the direction vector — dots opposite the
			// direction are skipped — and combine projection (forward distance)
			// with perpendicular distance, weighting perpendicular more so
			// arrows feel directional rather than just "next-nearest".
			const cur = hoveredTarget;
			let bestIdx = -1;
			let bestScore = Infinity;
			for (let i = 0; i < hitTargets.length; i++) {
				const t = hitTargets[i];
				if (t === cur) continue;
				const dx = t.x - cur.x;
				const dy = t.y - cur.y;
				const forward = dx * dir[0] + dy * dir[1];
				if (forward <= 0) continue;
				const perpendicular = Math.abs(dx * dir[1] - dy * dir[0]);
				const score = forward + perpendicular * 2;
				if (score < bestScore) {
					bestScore = score;
					bestIdx = i;
				}
			}
			if (bestIdx >= 0) {
				setHoveredTarget(hitTargets[bestIdx]);
			}
		},
		[hitTargets, hoveredTarget, boardDimensions.width, boardDimensions.height],
	);

	return (
		<div className={styles.collaborationIndex}>
			{/* Header */}
			<div className={styles.header}>
				<h2 className={styles.header__title}>{t('Collaboration Index')}</h2>
				<p className={styles.header__subtitle}>{t('How people feel about each topic')}</p>
			</div>

			{/* Toolbar — view mode toggle + zoom reset */}
			<div className={styles.toolbar}>
				<div className={styles.toolbar__group} role="group" aria-label={t('View mode')}>
					<button
						type="button"
						className={`${styles.toolbar__segment} ${viewMode === 'dots' ? styles['toolbar__segment--active'] : ''}`}
						aria-pressed={viewMode === 'dots'}
						onClick={() => setViewMode('dots')}
					>
						{t('Dots')}
					</button>
					<button
						type="button"
						className={`${styles.toolbar__segment} ${viewMode === 'hex' ? styles['toolbar__segment--active'] : ''}`}
						aria-pressed={viewMode === 'hex'}
						onClick={() => setViewMode('hex')}
					>
						{t('Hex')}
						{polarizationIndexes.length > HEX_AUTO_THRESHOLD && viewMode === 'dots' && (
							<span className={styles.toolbar__hint} aria-hidden="true">
								{' '}
								&middot;{' '}
								{polarizationIndexes.length}
							</span>
						)}
					</button>
				</div>
				{zoomedZone && (
					<button
						type="button"
						className={styles.toolbar__pill}
						onClick={handleResetZoom}
					>
						<span aria-hidden="true">&#x21BB;</span>
						<span>
							{t('Reset view')} ({t(`Zoomed to ${zoomedZone}`)})
						</span>
					</button>
				)}
			</div>

			{/* Chart Container with Axes */}
			<div className={styles.chartContainer}>
				{/* Y-Axis */}
				<div className={styles.yAxis}>
					<span className={styles.yAxis__label}>{t('Polarization')}</span>
					<div className={styles.yAxis__markers}>
						<span className={`${styles.yAxis__marker} ${styles['yAxis__marker--high']}`}>
							{t('Divided')}
						</span>
						<span className={styles.yAxis__marker}>|</span>
						<span className={`${styles.yAxis__marker} ${styles['yAxis__marker--low']}`}>
							{t('United')}
						</span>
					</div>
				</div>

				{/* Main Board */}
				<div className={styles.boardWrapper}>
					<div
						className={styles.board}
						ref={boardRef}
						onPointerMove={handlePointerMove}
						onPointerLeave={handlePointerLeave}
						onClick={handleBoardClick}
						onKeyDown={handleBoardKeyDown}
						tabIndex={0}
						role="application"
						aria-label={t(
							'Polarization map. Use arrow keys to move between solutions, Enter to view demographic breakdown, Escape to clear.',
						)}
						aria-activedescendant={
							hoveredTarget ? `polarization-dot-${hoveredTarget.statementId}` : undefined
						}
					>
						{/* Background with gradient zones */}
						<div className={styles.boardBackground} />

						{/* Center line */}
						<div className={styles.centerLine} />

						{/* Zone indicators — clickable to zoom into that quadrant. */}
						<div className={styles.zones}>
							{(
								[
									{ key: 'consensus' as ZoneKey, icon: '\u2714', label: 'Consensus' },
									{ key: 'rejection' as ZoneKey, icon: '\u2716', label: 'Rejection' },
									{ key: 'polarized' as ZoneKey, icon: '\u21C6', label: 'Polarized' },
									{ key: 'neutral' as ZoneKey, icon: '\u2194', label: 'Neutral' },
								] as const
							).map((zone) => (
								<button
									key={zone.key}
									type="button"
									className={`${styles.zone} ${styles[`zone--${zone.key}`]} ${zoomedZone === zone.key ? styles['zone--active'] : ''}`}
									onClick={(e) => {
										e.stopPropagation();
										handleZoneZoom(zone.key);
									}}
									aria-pressed={zoomedZone === zone.key}
									aria-label={t(`Zoom into ${zone.label} zone`)}
								>
									<span className={styles.zone__icon} role="img" aria-hidden="true">
										{zone.icon}
									</span>
									<span className={styles.zone__label}>{t(zone.label)}</span>
								</button>
							))}
						</div>

						{/* Data points — visuals only. Hit-testing is delegated to the
						    board via nearest-neighbor in handleBoardClick/handlePointerMove,
						    so individual dots don't listen for events. */}
						{viewMode === 'dots' &&
							points
								.filter((point) => point.position)
								.map((point: Point) => {
									const isSelected = currentStatementId === point.statementId;
									const isHovered =
										hoveredTarget?.kind === 'point' &&
										hoveredTarget.statementId === point.statementId;

									return (
										<div
											className={styles.pointDiv}
											key={point.statementId}
											id={`polarization-dot-${point.statementId}`}
											role="button"
											aria-label={`${point.statement}. ${agreementPercent(point.overallMean)}% agree, ${point.overallN} evaluators.`}
											style={{
												left: point.position?.x ? point.position.x + 'px' : '0px',
												top: point.position?.y ? point.position.y + 'px' : '0px',
											}}
										>
											<div
												className={`${styles.point} ${isSelected ? styles['point--selected'] : ''} ${isHovered ? styles['point--hovered'] : ''}`}
												style={{
													backgroundColor: getAgreementColor(point.overallMean),
												}}
											/>
										</div>
									);
								})}

						{/* Hex bins — single-occupant bins render as a normal dot
						    (so users still see individuals where there's no crowding);
						    multi-occupant bins render as a hex with the count. */}
						{viewMode === 'hex' &&
							hexBins.map((bin) => {
								const isSingle = bin.points.length === 1;
								const id = `hex-${bin.q}-${bin.r}`;
								const isHovered =
									hoveredTarget?.kind === 'hex' && hoveredTarget.statementId === id;
								const point = bin.points[0];

								if (isSingle) {
									return (
										<div
											className={styles.pointDiv}
											key={id}
											style={{
												left: point.position!.x + 'px',
												top: point.position!.y + 'px',
											}}
										>
											<div
												className={`${styles.point} ${
													hoveredTarget?.kind === 'point' &&
													hoveredTarget.statementId === point.statementId
														? styles['point--hovered']
														: ''
												}`}
												style={{ backgroundColor: getAgreementColor(point.overallMean) }}
											/>
										</div>
									);
								}

								return (
									<div
										key={id}
										className={`${styles.hex} ${isHovered ? styles['hex--hovered'] : ''}`}
										style={{
											left: bin.x + 'px',
											top: bin.y + 'px',
											width: HEX_W + 'px',
											height: HEX_H + 'px',
											backgroundColor: getAgreementColor(bin.avgMean),
										}}
										aria-label={`${bin.points.length} solutions in this cluster, ${agreementPercent(bin.avgMean)}% average agreement`}
									>
										<span className={styles.hex__count}>{bin.points.length}</span>
									</div>
								);
							})}

						{/* Demographic group dots are no longer rendered in-place.
						    Clicking a main dot opens the BreakdownPanel below, which
						    plots groups in their own mini scatter with stable tooltips. */}

						{/* Single shared hover tooltip — anchor flips so the bubble
						    stays within the chart bounds. Vertical: above by default,
						    flip below when the dot is near the top edge. */}
						{hoveredTarget &&
							(() => {
								const xPct = boardDimensions.width
									? hoveredTarget.x / boardDimensions.width
									: 0.5;
								const yPct = boardDimensions.height
									? hoveredTarget.y / boardDimensions.height
									: 0.5;
								const hAnchor =
									xPct < 0.2 ? 'left' : xPct > 0.8 ? 'right' : 'center';
								const vAnchor = yPct < 0.18 ? 'below' : 'above';

								return (
									<div
										className={`${styles.hoverTip} ${styles[`hoverTip--h-${hAnchor}`]} ${styles[`hoverTip--v-${vAnchor}`]}`}
										style={{
											left: hoveredTarget.x + 'px',
											top: hoveredTarget.y + 'px',
										}}
									>
										<div className={styles.hoverTip__bubble}>
											<div className={styles.hoverTip__title}>
												{hoveredTarget.label}
											</div>
											<div className={styles.hoverTip__meta}>
												<span
													className={styles.hoverTip__agree}
													style={{ color: hoveredTarget.color }}
												>
													{agreementPercent(hoveredTarget.mean)}%{' '}
													{t('agree')}
												</span>
												<span className={styles.hoverTip__sep}>·</span>
												<span>
													{t(verdictKey(hoveredTarget.mad, hoveredTarget.mean))}
												</span>
												<span className={styles.hoverTip__sep}>·</span>
												<span>
													{hoveredTarget.n} {t('evaluators')}
												</span>
											</div>
										</div>
									</div>
								);
							})()}
					</div>

					{/* X-Axis */}
					<div className={styles.xAxis}>
						<div className={styles.xAxis__markers}>
							<span className={`${styles.xAxis__marker} ${styles['xAxis__marker--left']}`}>
								{t('Disagree')}
							</span>
							<span className={`${styles.xAxis__marker} ${styles['xAxis__marker--center']}`}>
								{t('Neutral')}
							</span>
							<span className={`${styles.xAxis__marker} ${styles['xAxis__marker--right']}`}>
								{t('Agree')}
							</span>
						</div>
						<span className={styles.xAxis__label}>{t('Like-mindedness')}</span>
					</div>
				</div>
			</div>

			{/* Legend */}
			<div className={styles.legend}>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--consensus']}`} />
					<span className={styles.legend__text}>
						{t('Consensus')}: {t('Everyone agrees')}
					</span>
				</div>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--rejection']}`} />
					<span className={styles.legend__text}>
						{t('Rejection')}: {t('Everyone disagrees')}
					</span>
				</div>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--polarized']}`} />
					<span className={styles.legend__text}>
						{t('Polarized')}: {t('People are divided')}
					</span>
				</div>
				<div className={styles.legend__item}>
					<span className={`${styles.legend__dot} ${styles['legend__dot--neutral']}`} />
					<span className={styles.legend__text}>
						{t('Neutral')}: {t('Indifferent')}
					</span>
				</div>
			</div>

			{breakdownProps && (
				<BreakdownPanel
					isOpen={Boolean(showGroups)}
					onClose={() => {
						setShowGroups(null);
						setCurrentStatementId(null);
						setHoveredTarget(null);
						setTooltipPinned(false);
					}}
					title={breakdownProps.title}
					verdict={breakdownProps.verdict}
					overallMean={breakdownProps.overallMean}
					overallN={breakdownProps.overallN}
					groups={breakdownProps.groups}
				/>
			)}

			<HexClusterPanel
				isOpen={Boolean(clusterPoints && clusterPoints.length > 0)}
				points={clusterPoints || []}
				onClose={() => setClusterPoints(null)}
				onPick={(statementId) => {
					setClusterPoints(null);
					handleShowGroups(statementId);
				}}
			/>
		</div>
	);
};

export default PolarizationIndexComp;

function calculatePosition(
	mad: number,
	mean: number,
	boardDimensions: { width: number; height: number },
	viewport: Viewport = FULL_VIEWPORT,
): { x: number; y: number } {
	try {
		if (mad === undefined || mean === undefined || mad === null || mean === null) {
			throw new Error('MAD and Mean must be defined');
		}
		if (mad < 0 || mad > 1) {
			throw new Error('MAD must be between 0 and 1');
		}
		if (mean < -1 || mean > 1) {
			throw new Error('Mean must be between -1 and 1');
		}
		const meanRange = viewport.meanMax - viewport.meanMin || 1;
		const madRange = viewport.madMax - viewport.madMin || 1;
		const x = ((mean - viewport.meanMin) / meanRange) * boardDimensions.width;
		const y = (1 - (mad - viewport.madMin) / madRange) * boardDimensions.height;

		return { x, y };
	} catch (error) {
		logError(error, {
			operation: 'polarizationIndex.PolarizationIndex.x',
			metadata: { message: 'Error calculating points:' },
		});

		return { x: 0, y: 0 };
	}
}

// Iteratively push overlapping main dots apart so each remains visible.
// The model is honest: we treat any dot whose centre lies within a small
// padding of another's centre as a collision and apply equal-and-opposite
// nudges along the connecting line. Bounded to the chart so dots can't
// escape the painted area.
//
// Group dots aren't spread — only one statement's worth is shown at a time
// and they're already laid out from per-demographic stats, so the natural
// distribution is meaningful and shouldn't be perturbed.
const POINT_RADIUS = 16; // matches `.point` 32px / 2
const DOT_PADDING = 2; // breathing room between adjacent dots
const COLLISION_ITERATIONS = 60;

function spreadOverlappingPoints(
	points: Array<Point | undefined>,
	boardDimensions: { width: number; height: number },
): Point[] {
	const list = (points || []).filter((p): p is Point => Boolean(p?.position));
	if (list.length < 2 || boardDimensions.width === 0) return list;

	const minDist = POINT_RADIUS * 2 + DOT_PADDING;
	const minDistSq = minDist * minDist;
	// Mutable working copy; never touch the source positions
	const positions = list.map((p) => ({ x: p.position!.x, y: p.position!.y }));

	for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
		let moved = false;
		for (let i = 0; i < positions.length; i++) {
			for (let j = i + 1; j < positions.length; j++) {
				const a = positions[i];
				const b = positions[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const distSq = dx * dx + dy * dy;
				if (distSq >= minDistSq) continue;

				// Stacked at exact same point — push apart on a stable angle
				// derived from index pair so it's deterministic.
				let nx = dx;
				let ny = dy;
				let dist = Math.sqrt(distSq);
				if (dist < 0.001) {
					const angle = ((i * 31 + j * 17) % 360) * (Math.PI / 180);
					nx = Math.cos(angle);
					ny = Math.sin(angle);
					dist = 0.001;
				} else {
					nx /= dist;
					ny /= dist;
				}

				const overlap = (minDist - dist) / 2;
				a.x -= nx * overlap;
				a.y -= ny * overlap;
				b.x += nx * overlap;
				b.y += ny * overlap;
				moved = true;
			}
		}

		// Clamp to board so dots stay inside the painted gradient.
		for (const p of positions) {
			p.x = Math.max(POINT_RADIUS, Math.min(boardDimensions.width - POINT_RADIUS, p.x));
			p.y = Math.max(POINT_RADIUS, Math.min(boardDimensions.height - POINT_RADIUS, p.y));
		}

		if (!moved) break;
	}

	return list.map((p, i) => ({ ...p, position: positions[i] }));
}

function calculatePositions(
	points: PolarizationIndex[],
	boardDimensions: { width: number; height: number },
	userQuestions: UserDemographicQuestion[],
	viewport: Viewport = FULL_VIEWPORT,
): Point[] {
	try {
		return points.map((point) => {
			try {
				const { statementId, statement, overallMAD, overallMean, overallN, axes, color } = point;
				if (!statementId)
					throw new Error(`Statement ID is required in the point "${point.statement}"`);
				if (!statement) throw new Error(`Statement is required in the point "${point.statement}"`);
				if (overallMAD == undefined || overallMAD === null)
					throw new Error(`Overall MAD is required in the point "${point.statement}"`);
				if (overallMean == undefined || overallMean === null)
					throw new Error(`Overall Mean is required in the point "${point.statement}"`);
				if (!axes || !Array.isArray(axes))
					throw new Error(`Axes must be an array in the point "${point.statement}"`);
				if (axes.length === 0)
					throw new Error(`Axes cannot be empty in the point "${point.statement}"`);
				if (overallN === undefined || overallN < 0)
					throw new Error(
						`Overall N must be a non-negative number in the point "${point.statement}"`,
					);

				if (!color || typeof color !== 'string')
					throw new Error(`Color must be a valid string in the point "${point.statement}"`);

				const position = calculatePosition(overallMAD, overallMean, boardDimensions, viewport);

				return {
					statementId,
					statement,
					overallMAD,
					overallMean,
					overallN,
					position,
					color: color,
					axes: axes.map((axis) => ({
						questionId: axis.axId,
						question: axis.question,
						groupsMAD: axis.groupsMAD,
						groups: axis.groups.map((group: Group) => {
							let color = group.option.color;
							if (!color) {
								const { options } = userQuestions.find((q) => q.userQuestionId === axis.axId) || {
									options: [],
								};
								color =
									options.find((opt) => opt.option === group.option.option)?.color || '#808080';
							}

							return {
								option: {
									option: group.option.option,
									color: color,
								},
								mean: group.mean,
								n: group.n,
								mad: group.mad,
								position: calculatePosition(group.mad, group.mean, boardDimensions, viewport),
							};
						}),
					})),
				};
			} catch (error) {
				logError(error, {
					operation: 'polarizationIndex.PolarizationIndex.unknown',
					metadata: { message: 'Error calculating point:' },
				});
			}
		});
	} catch (error) {
		logError(error, {
			operation: 'polarizationIndex.PolarizationIndex.unknown',
			metadata: { message: 'Error calculating positions:' },
		});

		return [];
	}
}
