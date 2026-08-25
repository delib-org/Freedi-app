import {
	FC,
	PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import clsx from 'clsx';
import { Settings, X } from 'lucide-react';
import {
	CutoffBy,
	EvaluationUI,
	ResultsBy,
	SortType,
	Statement,
	evaluationType,
} from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { UI } from '@/constants/common';
import {
	getActiveRankBy,
	requestTopOptionsRecompute,
	setCutoffMethod,
	setCutoffValue,
	setManualOptionOrder,
	setRankBy,
	setResultsBy,
	type RankBy,
} from '@/controllers/db/statements/setTopAnswersSettings';
import {
	formatRangeValue,
	getRangeConfig,
	toDisplayValue,
} from '../settings/components/choseBy/resultsRangeConfig';
import { setRatingScale } from '@/controllers/db/evaluation/setEvaluation';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import ManualOrderModal from './ManualOrderModal';
import styles from './TopAnswersPanel.module.scss';

/**
 * Top Answers — the admin's floating control over which answers are marked as
 * the leading ones, and in what order the list is read.
 *
 * The same four controls the Join app's FacilitatorPanel puts in a facilitator's
 * hand during a live session, writing the same Firestore fields, so a question
 * behaves identically whichever app the admin is standing in. Everything here
 * is a *marking* decision — no answer is ever hidden from participants by it.
 *
 * The drawer chrome (handle, backdrop, panel, rows, segmented controls) is the
 * shared `admin-drawer` molecule, also used by MapAdminPanel.
 */

const HANDLE_Y_KEY = 'freedi_top_answers_handle_y';
const HANDLE_HEIGHT_PX = 56;
const DRAG_THRESHOLD_PX = 4;
const CLICK_SUPPRESS_MS = 250;

const TOP_N_MIN = 1;
const TOP_N_MAX = 20;
const TOP_N_DEFAULT = 5;

/**
 * Rank-by segments. Glyphs and order match `SORT_OPTIONS` in the Join app's
 * FacilitatorPanel so an admin reads the same control in both places.
 */
const RANK_OPTIONS: ReadonlyArray<{ value: RankBy; icon: string; label: string }> = [
	{ value: SortType.accepted, icon: '🤝', label: 'By agreement' },
	{ value: SortType.averageEvaluation, icon: '📊', label: 'By average rating' },
	{ value: SortType.random, icon: '🎲', label: 'Random' },
	{ value: SortType.newest, icon: '✨', label: 'Newest first' },
	{ value: 'manual', icon: '✋', label: 'Hand-placed order' },
];

/**
 * The rating scale participants actually tap. Values, labels and tooltips are
 * the ones the full settings screen already offers (InstantSettings' rating
 * scale), so the two surfaces cannot describe the same choice differently.
 */
const SCALE_OPTIONS: ReadonlyArray<{
	value: evaluationType;
	icon: string;
	label: string;
	hint: string;
}> = [
	{
		value: evaluationType.range,
		icon: '😀',
		label: 'Agree - Disagree',
		hint: '5 faces, from strongly against to strongly for (-1 to +1)',
	},
	{
		value: evaluationType.likeDislike,
		icon: '👍',
		label: 'Thumbs up or down',
		hint: 'Simple +1 or -1',
	},
	{
		value: evaluationType.singleLike,
		icon: '❤️',
		label: 'Likes only',
		hint: 'Positive-only, 0 or 1 — no downvotes',
	},
	{
		value: evaluationType.communityVoice,
		icon: '👥',
		label: 'Community Voice',
		hint: 'Respectful 4-level resonance scale',
	},
];

const SCORE_OPTIONS: ReadonlyArray<{ value: ResultsBy; label: string }> = [
	{ value: ResultsBy.consensus, label: 'Agreement' },
	{ value: ResultsBy.mostLiked, label: 'Most liked' },
	{ value: ResultsBy.averageLikesDislikes, label: 'Liked minus disliked' },
];

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
		const value = Number(raw);

		return Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

interface TopAnswersPanelProps {
	statement: Statement;
}

const TopAnswersPanel: FC<TopAnswersPanelProps> = ({ statement }) => {
	// The app applies RTL via the CSS `direction` property but does NOT set a
	// `dir` attribute, so `[dir='rtl']` selectors never match. Drive RTL off the
	// app's own direction via the `admin-drawer--rtl` modifier instead.
	const { t, dir } = useTranslation();
	const isRtl = dir === 'rtl';

	const [open, setOpen] = useState(false);
	const [showReorder, setShowReorder] = useState(false);
	const [handleY, setHandleY] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef<DragState | null>(null);
	const lastDragEndRef = useRef(0);
	const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const { statementId, resultsSettings, statementSettings } = statement;

	// The rating scale only exists in suggestion mode — voting and clustering
	// impose their own, which is why the settings screen hides the control there
	// rather than offering a choice that would be ignored.
	const evaluationUI = statement.evaluationSettings?.evaluationUI ?? EvaluationUI.suggestions;
	const scaleApplies = evaluationUI === EvaluationUI.suggestions;
	const currentScale = statementSettings?.evaluationType ?? evaluationType.range;
	const usesReactions = statementSettings?.ratingMode === 'reactions';

	const resultsBy = resultsSettings?.resultsBy ?? ResultsBy.consensus;
	const cutoffBy = resultsSettings?.cutoffBy ?? CutoffBy.topOptions;
	const activeRank = getActiveRankBy(statement);

	const rangeConfig = getRangeConfig(resultsBy);
	const isTopN = cutoffBy === CutoffBy.topOptions;

	// The slider is uncontrolled between pointer-down and the debounced write, so
	// it holds its own display value and re-seeds whenever the stored one moves.
	const storedSliderValue = isTopN
		? (resultsSettings?.numberOfResults ?? TOP_N_DEFAULT)
		: toDisplayValue(rangeConfig, resultsBy, resultsSettings?.cutoffNumber ?? 0);
	const [sliderValue, setSliderValue] = useState<number>(storedSliderValue);
	useEffect(() => {
		setSliderValue(storedSliderValue);
	}, [storedSliderValue]);

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
		const onResize = () => setHandleY((y) => (y === null ? y : clampHandleY(y)));
		window.addEventListener('resize', onResize);

		return () => window.removeEventListener('resize', onResize);
	}, []);

	useEffect(() => {
		return () => {
			if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
		};
	}, []);

	/**
	 * Every `resultsSettings` change has to be followed by a recompute, or the
	 * top-answer marks on the cards stay on the previous cutoff until somebody
	 * next rates something.
	 */
	const writeAndRecompute = useCallback(
		async (write: () => Promise<void>) => {
			await write();
			await requestTopOptionsRecompute(statementId);
		},
		[statementId],
	);

	/** Slider drags fire continuously; write once on the trailing edge. */
	const debouncedCutoffValue = useCallback(
		(displayValue: number) => {
			if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
			writeTimerRef.current = setTimeout(() => {
				writeTimerRef.current = null;
				const stored = isTopN ? displayValue : rangeConfig.convert(displayValue);
				void writeAndRecompute(() => setCutoffValue(statementId, resultsSettings, stored));
			}, UI.DEBOUNCE_DELAY);
		},
		[isTopN, rangeConfig, statementId, resultsSettings, writeAndRecompute],
	);

	function handleScaleChange(value: evaluationType): void {
		// `setRatingScale` also refreshes the derived `enhancedEvaluation` flag,
		// which parts of the UI still read — never write `evaluationType` alone.
		setRatingScale(statement, value);
	}

	function handleReactionsChange(next: boolean): void {
		setStatementSettingToDB({
			statement,
			property: 'ratingMode',
			newValue: next ? 'reactions' : 'agree-disagree',
			settingsSection: 'statementSettings',
		});
	}

	function handleRankChange(value: RankBy): void {
		if (value === 'manual') {
			setShowReorder(true);

			return;
		}
		void setRankBy(statementId, value);
	}

	async function handleSaveManualOrder(optionIds: string[]): Promise<void> {
		await setManualOptionOrder(statementId, optionIds);
	}

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
		if (!wasMoved) return;

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
	};

	const onHandleClick = () => {
		// A drag-with-movement fires a trailing click; suppress it within a window.
		if (Date.now() - lastDragEndRef.current < CLICK_SUPPRESS_MS) return;
		setOpen((o) => !o);
	};

	const positioned = handleY !== null;
	const panelLabel = t('Top answers');
	const sliderDisplay = isTopN
		? String(sliderValue)
		: formatRangeValue(rangeConfig, Math.round(sliderValue));

	return (
		<div className={clsx('admin-drawer', isRtl && 'admin-drawer--rtl')}>
			<button
				type="button"
				className={clsx(
					'admin-drawer__handle',
					styles.handle,
					open && 'admin-drawer__handle--open',
					positioned && 'admin-drawer__handle--positioned',
					dragging && 'admin-drawer__handle--dragging',
				)}
				style={positioned ? { top: `${clampHandleY(handleY)}px` } : undefined}
				aria-expanded={open}
				aria-controls="top-answers-drawer"
				aria-label={panelLabel}
				title={panelLabel}
				onPointerDown={onHandlePointerDown}
				onPointerMove={onHandlePointerMove}
				onPointerUp={onHandlePointerUp}
				onPointerCancel={onHandlePointerUp}
				onClick={onHandleClick}
			>
				<span className="admin-drawer__handle-icon" aria-hidden>
					<Settings size={24} />
				</span>
			</button>

			{open && (
				<div
					className="admin-drawer__backdrop"
					onClick={() => setOpen(false)}
					role="presentation"
				/>
			)}

			<aside
				id="top-answers-drawer"
				className={clsx('admin-drawer__panel', open && 'admin-drawer__panel--open')}
				role="dialog"
				aria-modal={open}
				aria-hidden={!open}
				aria-label={panelLabel}
			>
				<header className="admin-drawer__header">
					<h2 className="admin-drawer__title">{panelLabel}</h2>
					<button
						type="button"
						className="admin-drawer__close"
						onClick={() => setOpen(false)}
						aria-label={t('Close')}
					>
						<X size={18} />
					</button>
				</header>

				{/* How people rate — the scale participants actually tap */}
				<section className="admin-drawer__section">
					<span className="admin-drawer__section-title">{t('How people rate')}</span>
					{scaleApplies ? (
						<div className="admin-drawer__row">
							<div
								className="admin-drawer__segmented"
								role="radiogroup"
								aria-label={t('How people rate')}
							>
								{SCALE_OPTIONS.map((option) => {
									const active = currentScale === option.value;
									const label = t(option.label);

									return (
										<button
											key={option.value}
											type="button"
											role="radio"
											aria-checked={active}
											aria-label={label}
											title={`${label} — ${t(option.hint)}`}
											className={clsx(
												'admin-drawer__segment',
												active && 'admin-drawer__segment--active',
											)}
											onClick={() => handleScaleChange(option.value)}
										>
											<span aria-hidden>{option.icon}</span>
										</button>
									);
								})}
							</div>
							<p className="admin-drawer__row-help">
								{t('What each participant taps on a suggestion')}
							</p>
							<p className="admin-drawer__row-help">
								{t(SCALE_OPTIONS.find((o) => o.value === currentScale)?.hint ?? '')}
							</p>

							{/* Only the agree/disagree scale has a second face set to swap in. */}
							{currentScale === evaluationType.range && (
								<>
									<div className="admin-drawer__row-main">
										<span className="admin-drawer__row-label">{t('Use emoji reactions')}</span>
										<button
											type="button"
											role="switch"
											aria-checked={usesReactions}
											aria-label={t('Use emoji reactions')}
											className={clsx(
												'admin-drawer__toggle',
												usesReactions && 'admin-drawer__toggle--on',
											)}
											onClick={() => handleReactionsChange(!usesReactions)}
										>
											<span className="admin-drawer__toggle-track" />
											<span className="admin-drawer__toggle-knob" />
										</button>
									</div>
									<p className="admin-drawer__row-help">
										{t('Show playful emoji instead of agree/disagree faces')}
									</p>
								</>
							)}
						</div>
					) : (
						<p className="admin-drawer__row-help">
							{t('Rating scale is set automatically for this mode')}
						</p>
					)}
				</section>

				{/* Rank by — the order the answer list is read in */}
				<section className="admin-drawer__section">
					<span className="admin-drawer__section-title">{t('Rank by')}</span>
					<div className="admin-drawer__row">
						<div className="admin-drawer__segmented" role="radiogroup" aria-label={t('Rank by')}>
							{RANK_OPTIONS.map((option) => {
								const active = activeRank === option.value;
								const label = t(option.label);

								return (
									<button
										key={String(option.value)}
										type="button"
										role="radio"
										aria-checked={active}
										aria-label={label}
										title={label}
										className={clsx(
											'admin-drawer__segment',
											active && 'admin-drawer__segment--active',
										)}
										onClick={() => handleRankChange(option.value)}
									>
										<span aria-hidden>{option.icon}</span>
									</button>
								);
							})}
						</div>
						<p className="admin-drawer__row-help">
							{t('Sets the order everyone sees this question’s answers in.')}
						</p>
						{activeRank === 'manual' && (
							<button
								type="button"
								className="admin-drawer__link"
								onClick={() => setShowReorder(true)}
							>
								{t('Reorder manually…')}
							</button>
						)}
					</div>
				</section>

				{/* Score by — what "leading" is measured on */}
				<section className="admin-drawer__section">
					<span className="admin-drawer__section-title">{t('Score answers by')}</span>
					<div className="admin-drawer__row">
						<div
							className="admin-drawer__segmented"
							role="radiogroup"
							aria-label={t('Score answers by')}
						>
							{SCORE_OPTIONS.map((option) => {
								const active = resultsBy === option.value;

								return (
									<button
										key={option.value}
										type="button"
										role="radio"
										aria-checked={active}
										className={clsx(
											'admin-drawer__segment',
											active && 'admin-drawer__segment--active',
										)}
										onClick={() =>
											void writeAndRecompute(() =>
												setResultsBy(statementId, resultsSettings, option.value),
											)
										}
									>
										{t(option.label)}
									</button>
								);
							})}
						</div>
					</div>
				</section>

				{/* Cut off — how many answers count as top */}
				<section className="admin-drawer__section">
					<span className="admin-drawer__section-title">{t('Which answers count as top')}</span>
					<div className="admin-drawer__row">
						<div
							className="admin-drawer__segmented"
							role="radiogroup"
							aria-label={t('Which answers count as top')}
						>
							{[
								{ value: CutoffBy.topOptions, label: 'The top few' },
								{ value: CutoffBy.aboveThreshold, label: 'Above a score' },
							].map((option) => {
								const active = cutoffBy === option.value;

								return (
									<button
										key={option.value}
										type="button"
										role="radio"
										aria-checked={active}
										className={clsx(
											'admin-drawer__segment',
											active && 'admin-drawer__segment--active',
										)}
										onClick={() =>
											void writeAndRecompute(() =>
												setCutoffMethod(statementId, resultsSettings, option.value),
											)
										}
									>
										{t(option.label)}
									</button>
								);
							})}
						</div>

						<div className="admin-drawer__slider-row">
							<span className="admin-drawer__slider-label">
								{isTopN ? t('How many') : t('Minimum score')}
							</span>
							<input
								type="range"
								className="admin-drawer__slider"
								min={isTopN ? TOP_N_MIN : rangeConfig.min}
								max={isTopN ? TOP_N_MAX : rangeConfig.max}
								step={isTopN ? 1 : rangeConfig.step}
								value={sliderValue}
								aria-label={isTopN ? t('How many') : t('Minimum score')}
								onChange={(e) => {
									const next = e.target.valueAsNumber;
									setSliderValue(next);
									debouncedCutoffValue(next);
								}}
							/>
							<span className="admin-drawer__slider-value">{sliderDisplay}</span>
						</div>

						<p className="admin-drawer__row-help">
							{t(
								'Top answers are highlighted for everyone. Nothing is hidden — every answer stays in the list.',
							)}
						</p>
					</div>
				</section>
			</aside>

			<ManualOrderModal
				statementId={statementId}
				isOpen={showReorder}
				onClose={() => setShowReorder(false)}
				onSave={handleSaveManualOrder}
			/>
		</div>
	);
};

export default TopAnswersPanel;
