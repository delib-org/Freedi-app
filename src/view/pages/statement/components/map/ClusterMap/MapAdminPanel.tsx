import {
	FC,
	PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import { setDoc } from 'firebase/firestore';
import { Settings, X } from 'lucide-react';
import {
	Statement,
	StatementSettings,
	MapSettings,
	MapSynthVisibility,
	MapFilterMetric,
} from '@freedi/shared-types';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { LocalMapFilter } from './mapLocalFilter';
import styles from './MapAdminPanel.module.scss';

interface MapAdminPanelProps {
	statement: Statement;
	settings: StatementSettings;
	/**
	 * True when the viewer is an admin/creator who can change every map setting
	 * AND write the shared filter for everyone. False for a permitted non-admin
	 * viewer, whose filter is always local to their own device.
	 */
	canConfigure: boolean;
	/** This viewer's local filter override (null = following the shared filter). */
	localFilter: LocalMapFilter | null;
	/** Persist/clear this viewer's local filter override. */
	onLocalFilterChange: (filter: LocalMapFilter | null) => void;
	/**
	 * Admin-only scope switch. true (default) → filter edits write the SHARED
	 * setting (everyone sees them); false → edits stay in the admin's local view.
	 */
	applyToEveryone: boolean;
	onApplyToEveryoneChange: (everyone: boolean) => void;
}

const filterMetricOrder: MapFilterMetric[] = ['none', 'consensus', 'average'];

// The filter threshold spans the full evaluation range; -1 means "show all".
const FILTER_MIN = -1;
const FILTER_MAX = 1;
const FILTER_STEP = 0.05;
const FILTER_DEFAULT = -1;

// Mirror the ClusterBoard defaults so the panel shows what the map renders.
const CARD_FONT_DEFAULT = 0.9;
const CLUSTER_FONT_DEFAULT = 1;
const FONT_MIN = 0.6;
const FONT_MAX = 2.2;
const FONT_STEP = 0.05;

const HANDLE_Y_KEY = 'freedi_map_admin_handle_y';
const HANDLE_HEIGHT_PX = 56;
const DRAG_THRESHOLD_PX = 4;
const CLICK_SUPPRESS_MS = 250;

const visibilityOrder: MapSynthVisibility[] = ['all', 'clusters-only', 'originals-only'];

interface DragState {
	pointerId: number;
	startClientY: number;
	startHandleTop: number;
	moved: boolean;
}

function clampHandleY(y: number): number {
	const maxY = Math.max(0, window.innerHeight - HANDLE_HEIGHT_PX);

	return Math.max(0, Math.min(maxY, y));
}

function loadHandleY(): number | null {
	try {
		const raw = localStorage.getItem(HANDLE_Y_KEY);
		if (raw === null) return null;
		const v = Number(raw);

		return Number.isFinite(v) ? v : null;
	} catch {
		return null;
	}
}

/**
 * Admin map-control panel — a floating edge handle (draggable vertically,
 * position persisted) that opens a right-side drawer of map settings. Modeled
 * on the Join app's FacilitatorPanel so admins get a consistent control surface.
 */
const MapAdminPanel: FC<MapAdminPanelProps> = ({
	statement,
	settings,
	canConfigure,
	localFilter,
	onLocalFilterChange,
	applyToEveryone,
	onApplyToEveryoneChange,
}) => {
	// The app applies RTL via the CSS `direction` property but does NOT set a
	// `dir="rtl"` attribute, so `[dir='rtl']` selectors never match. Drive RTL
	// off the app's own direction via a scoped `.rtl` class instead.
	const { t, dir } = useTranslation();
	const isRtl = dir === 'rtl';
	const [open, setOpen] = useState(false);
	const [handleY, setHandleY] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef<DragState | null>(null);
	const lastDragEndRef = useRef(0);

	useEffect(() => {
		setHandleY(loadHandleY());
	}, []);

	// Close on Escape.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		window.addEventListener('keydown', onKey);

		return () => window.removeEventListener('keydown', onKey);
	}, [open]);

	// Keep the dragged handle on-screen across viewport resizes.
	useEffect(() => {
		const onResize = () => {
			setHandleY((y) => (y === null ? y : clampHandleY(y)));
		};
		window.addEventListener('resize', onResize);

		return () => window.removeEventListener('resize', onResize);
	}, []);

	const map: MapSettings = settings.map ?? {};
	const cardFont = map.cardFontRem ?? CARD_FONT_DEFAULT;
	const clusterFont = map.clusterFontRem ?? CLUSTER_FONT_DEFAULT;
	const synthVisibility: MapSynthVisibility = map.synthVisibility ?? 'all';
	const showProvenance = map.showProvenance ?? true;
	const allowViewerFilter = map.allowViewerFilter ?? false;

	// The filter that actually drives this viewer's board: their local override
	// when present (viewer, or admin "only me"), otherwise the shared setting.
	// Admin edits write the shared setting only when `writeShared` is true.
	const writeShared = canConfigure && applyToEveryone;
	const filterMetric: MapFilterMetric = localFilter?.filterMetric ?? map.filterMetric ?? 'none';
	const minConsensus = localFilter?.minConsensus ?? map.minConsensus ?? FILTER_DEFAULT;
	const minAverageEvaluation =
		localFilter?.minAverageEvaluation ?? map.minAverageEvaluation ?? FILTER_DEFAULT;

	const update = useCallback(
		(patch: Partial<MapSettings>) => {
			void setDoc(
				createStatementRef(statement.statementId),
				{ statementSettings: { map: patch } },
				{ merge: true },
			).catch((error) => {
				logError(error, {
					operation: 'mapAdminPanel.update',
					statementId: statement.statementId,
				});
			});
		},
		[statement.statementId],
	);

	// Filter writes. When an admin has "apply to everyone" on, edits go to the
	// SHARED statementSettings.map (everyone's view). Otherwise — a non-admin
	// viewer, or an admin filtering "only me" — the edit stays in this device's
	// local override and never touches the shared setting or the DB.
	const updateFilter = useCallback(
		(
			patch: Pick<Partial<MapSettings>, 'filterMetric' | 'minConsensus' | 'minAverageEvaluation'>,
		) => {
			if (writeShared) {
				update(patch);

				return;
			}
			onLocalFilterChange({
				filterMetric: patch.filterMetric ?? filterMetric,
				minConsensus: patch.minConsensus ?? minConsensus,
				minAverageEvaluation: patch.minAverageEvaluation ?? minAverageEvaluation,
			});
		},
		[writeShared, update, onLocalFilterChange, filterMetric, minConsensus, minAverageEvaluation],
	);

	// Admin scope switch. Turning "apply to everyone" ON drops the admin's local
	// override so they see/edit the shared filter; turning it OFF seeds a local
	// override from the current view so they keep filtering just for themselves.
	const handleApplyToEveryone = useCallback(
		(everyone: boolean) => {
			onApplyToEveryoneChange(everyone);
			onLocalFilterChange(everyone ? null : { filterMetric, minConsensus, minAverageEvaluation });
		},
		[
			onApplyToEveryoneChange,
			onLocalFilterChange,
			filterMetric,
			minConsensus,
			minAverageEvaluation,
		],
	);

	const onHandlePointerDown = (e: ReactPointerEvent) => {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dragRef.current = {
			pointerId: e.pointerId,
			startClientY: e.clientY,
			startHandleTop: rect.top,
			moved: false,
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onHandlePointerMove = (e: ReactPointerEvent) => {
		const drag = dragRef.current;
		if (!drag || e.pointerId !== drag.pointerId) return;
		const dy = e.clientY - drag.startClientY;
		if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
		drag.moved = true;
		setDragging(true);
		setHandleY(clampHandleY(drag.startHandleTop + dy));
	};

	const onHandlePointerUp = (e: ReactPointerEvent) => {
		const drag = dragRef.current;
		if (!drag || e.pointerId !== drag.pointerId) return;
		const el = e.currentTarget as HTMLElement;
		if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
		const wasMoved = drag.moved;
		dragRef.current = null;
		setDragging(false);
		if (wasMoved) {
			lastDragEndRef.current = Date.now();
			setHandleY((y) => {
				if (y !== null) {
					try {
						localStorage.setItem(HANDLE_Y_KEY, String(Math.round(y)));
					} catch {
						/* ignore persistence failure */
					}
				}

				return y;
			});
		}
	};

	const onHandleClick = () => {
		// A drag-with-movement fires a trailing click; suppress it within a window.
		if (Date.now() - lastDragEndRef.current < CLICK_SUPPRESS_MS) return;
		setOpen((o) => !o);
	};

	const positioned = handleY !== null;
	const handleClasses = [
		styles.handle,
		open ? styles.handleOpen : '',
		positioned ? styles.handlePositioned : '',
		dragging ? styles.handleDragging : '',
	]
		.filter(Boolean)
		.join(' ');

	const visibilityLabel = (v: MapSynthVisibility): string =>
		v === 'all'
			? t('Clusters + originals')
			: v === 'clusters-only'
				? t('Clusters only')
				: t('Originals only');

	const filterMetricLabel = (m: MapFilterMetric): string =>
		m === 'none' ? t('None') : m === 'consensus' ? t('Consensus') : t('Average rating');

	// The active threshold + which field it writes depend on the chosen metric.
	const activeThreshold = filterMetric === 'average' ? minAverageEvaluation : minConsensus;
	const thresholdDisplay =
		filterMetric === 'consensus'
			? `${Math.round(activeThreshold * 100)}%`
			: activeThreshold.toFixed(2);

	return (
		<div className={`${styles.root} ${isRtl ? styles.rtl : ''}`}>
			<button
				type="button"
				className={handleClasses}
				style={positioned ? { top: `${clampHandleY(handleY)}px` } : undefined}
				aria-expanded={open}
				aria-controls="map-admin-drawer"
				aria-label={t('Map settings')}
				title={t('Map settings')}
				onPointerDown={onHandlePointerDown}
				onPointerMove={onHandlePointerMove}
				onPointerUp={onHandlePointerUp}
				onPointerCancel={onHandlePointerUp}
				onClick={onHandleClick}
			>
				<span className={styles.handleIcon} aria-hidden>
					<Settings size={24} />
				</span>
			</button>

			{open && (
				<div className={styles.backdrop} onClick={() => setOpen(false)} role="presentation" />
			)}

			<aside
				id="map-admin-drawer"
				className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
				role="dialog"
				aria-modal={open}
				aria-hidden={!open}
				aria-label={t('Map settings')}
			>
				<header className={styles.header}>
					<h2 className={styles.title}>{t('Map settings')}</h2>
					<button
						type="button"
						className={styles.close}
						onClick={() => setOpen(false)}
						aria-label={t('Close')}
					>
						<X size={18} />
					</button>
				</header>

				{/* Filter responses — shown to admins and to permitted viewers */}
				<section className={styles.section}>
					<span className={styles.sectionTitle}>{t('Filter responses')}</span>
					<div className={styles.row}>
						<div className={styles.segmented} role="radiogroup" aria-label={t('Filter by')}>
							{filterMetricOrder.map((m) => {
								const active = filterMetric === m;

								return (
									<button
										key={m}
										type="button"
										role="radio"
										aria-checked={active}
										className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
										onClick={() => updateFilter({ filterMetric: m })}
									>
										{filterMetricLabel(m)}
									</button>
								);
							})}
						</div>
						{filterMetric !== 'none' && (
							<div className={styles.sliderRow}>
								<span className={styles.sliderLabel}>
									{filterMetric === 'consensus' ? t('Minimum consensus') : t('Minimum rating')}
								</span>
								<input
									type="range"
									className={styles.slider}
									min={FILTER_MIN}
									max={FILTER_MAX}
									step={FILTER_STEP}
									value={activeThreshold}
									aria-label={
										filterMetric === 'consensus' ? t('Minimum consensus') : t('Minimum rating')
									}
									onChange={(e) =>
										updateFilter(
											filterMetric === 'average'
												? { minAverageEvaluation: Number(e.target.value) }
												: { minConsensus: Number(e.target.value) },
										)
									}
								/>
								<span className={styles.sliderValue}>{thresholdDisplay}</span>
							</div>
						)}
						<p className={styles.rowHelp}>{t('Only show responses at or above this score')}</p>

						{canConfigure ? (
							<>
								<div className={styles.rowMain}>
									<span className={styles.rowLabel}>{t('Apply filter to everyone')}</span>
									<button
										type="button"
										role="switch"
										aria-checked={applyToEveryone}
										aria-label={t('Apply filter to everyone')}
										className={`${styles.toggle} ${applyToEveryone ? styles.toggleOn : ''}`}
										onClick={() => handleApplyToEveryone(!applyToEveryone)}
									>
										<span className={styles.toggleTrack} />
										<span className={styles.toggleKnob} />
									</button>
								</div>
								<p className={styles.rowHelp}>
									{applyToEveryone
										? t('Your filter changes what everyone sees on this map')
										: t('Your filter changes only your own view')}
								</p>
							</>
						) : (
							<>
								<p className={styles.rowHelp}>{t('Your filter changes only your own view')}</p>
								{localFilter && (
									<button
										type="button"
										className={styles.resetLink}
										onClick={() => onLocalFilterChange(null)}
									>
										{t('Reset to shared view')}
									</button>
								)}
							</>
						)}
					</div>
				</section>

				{canConfigure && (
					<>
						{/* Text size */}
						<section className={styles.section}>
							<span className={styles.sectionTitle}>{t('Map text size')}</span>
							<div className={styles.sliderRow}>
								<span className={styles.sliderLabel}>{t('Cluster title size')}</span>
								<input
									type="range"
									className={styles.slider}
									min={FONT_MIN}
									max={FONT_MAX}
									step={FONT_STEP}
									value={clusterFont}
									aria-label={t('Cluster title size')}
									onChange={(e) => update({ clusterFontRem: Number(e.target.value) })}
								/>
								<span className={styles.sliderValue}>{clusterFont.toFixed(2)}</span>
							</div>
							<div className={styles.sliderRow}>
								<span className={styles.sliderLabel}>{t('Response card size')}</span>
								<input
									type="range"
									className={styles.slider}
									min={FONT_MIN}
									max={FONT_MAX}
									step={FONT_STEP}
									value={cardFont}
									aria-label={t('Response card size')}
									onChange={(e) => update({ cardFontRem: Number(e.target.value) })}
								/>
								<span className={styles.sliderValue}>{cardFont.toFixed(2)}</span>
							</div>
						</section>

						{/* What the map shows */}
						<section className={styles.section}>
							<span className={styles.sectionTitle}>{t('What the map shows')}</span>
							<div className={styles.row}>
								<div
									className={styles.segmented}
									role="radiogroup"
									aria-label={t('What the map shows')}
								>
									{visibilityOrder.map((v) => {
										const active = synthVisibility === v;

										return (
											<button
												key={v}
												type="button"
												role="radio"
												aria-checked={active}
												className={`${styles.segment} ${active ? styles.segmentActive : ''}`}
												onClick={() => update({ synthVisibility: v })}
											>
												{visibilityLabel(v)}
											</button>
										);
									})}
								</div>
								<p className={styles.rowHelp}>
									{t(
										'Choose whether the map groups responses into clusters, or shows every response on its own.',
									)}
								</p>
							</div>
						</section>

						{/* Provenance */}
						<section className={styles.section}>
							<span className={styles.sectionTitle}>{t('Cluster provenance')}</span>
							<div className={styles.row}>
								<div className={styles.rowMain}>
									<span className={styles.rowLabel}>
										<span className={styles.rowIcon} aria-hidden>
											✨
										</span>
										{t('Show what each cluster was made from')}
									</span>
									<button
										type="button"
										role="switch"
										aria-checked={showProvenance}
										aria-label={t('Show what each cluster was made from')}
										className={`${styles.toggle} ${showProvenance ? styles.toggleOn : ''}`}
										onClick={() => update({ showProvenance: !showProvenance })}
									>
										<span className={styles.toggleTrack} />
										<span className={styles.toggleKnob} />
									</button>
								</div>
								<p className={styles.rowHelp}>
									{t(
										'Display a "made from N responses" line on each cluster so people see how it was formed.',
									)}
								</p>
							</div>
						</section>

						{/* Sharing — let non-admin viewers adjust the filter */}
						<section className={styles.section}>
							<span className={styles.sectionTitle}>{t('Sharing')}</span>
							<div className={styles.row}>
								<div className={styles.rowMain}>
									<span className={styles.rowLabel}>{t('Let viewers filter the map')}</span>
									<button
										type="button"
										role="switch"
										aria-checked={allowViewerFilter}
										aria-label={t('Let viewers filter the map')}
										className={`${styles.toggle} ${allowViewerFilter ? styles.toggleOn : ''}`}
										onClick={() => update({ allowViewerFilter: !allowViewerFilter })}
									>
										<span className={styles.toggleTrack} />
										<span className={styles.toggleKnob} />
									</button>
								</div>
								<p className={styles.rowHelp}>
									{t('When on, anyone who can view the map can adjust the filter')}
								</p>
							</div>
						</section>
					</>
				)}
			</aside>
		</div>
	);
};

export default MapAdminPanel;
