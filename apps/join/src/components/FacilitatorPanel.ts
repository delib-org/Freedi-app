import m from 'mithril';
import { CutoffBy, ResultsBy, SortType, Statement, ThemeStyle } from '@freedi/shared-types';
import type { ResultsSettings } from '@freedi/shared-types';
import { isAdmin } from '@/lib/admin';
import {
	getQuestion,
	setQuestionSetting,
	setSortType,
	setEvaluationEnabled,
	setPowerFollowMe,
	getPowerFollowMePath,
	getMainStatement,
	setMainStatementSetting,
	setThemeStyle,
	getActiveThemeStyle,
	applyThemeStyleToDOM,
} from '@/lib/store';
import { t } from '@/lib/i18n';

let isOpen = false;
let escListenerAttached = false;
let resizeListenerAttached = false;
let sliderWriteTimer: number | null = null;

const DEFAULT_THRESHOLD = 0.5;
const SLIDER_DEBOUNCE_MS = 300;

// --- Draggable handle position (vertical only) -------------------------------
// `handleY` is the user's preferred top-px for the handle. `null` means
// "use the CSS default" (vertically centered via top:50% + translateY(-50%)).
// Persisted to localStorage so Tal's preferred spot survives reloads.
const HANDLE_Y_KEY = 'freedi_join_facilitator_handle_y';
const HANDLE_HEIGHT_PX = 56;
const DRAG_THRESHOLD_PX = 4;

let handleY: number | null = null;
let handleYLoaded = false;

interface HandleDragState {
	pointerId: number;
	startClientY: number;
	startHandleTop: number;
	moved: boolean;
}
let dragState: HandleDragState | null = null;
// Timestamp of the most recent drag-with-movement end, used to suppress the
// synthetic `click` that follows `pointerup`. Touch drags don't always emit a
// click — a flag would stick forever in that case, so we use a time window
// (CLICK_SUPPRESS_WINDOW_MS) that auto-expires.
let lastDragEndTime = 0;
const CLICK_SUPPRESS_WINDOW_MS = 250;

function loadHandleY(): void {
	if (handleYLoaded) return;
	handleYLoaded = true;
	try {
		const raw = localStorage.getItem(HANDLE_Y_KEY);
		if (raw === null) return;
		const v = Number(raw);
		if (Number.isFinite(v)) handleY = v;
	} catch {
		/* ignore — stay on default centered position */
	}
}

function saveHandleY(y: number): void {
	try {
		localStorage.setItem(HANDLE_Y_KEY, String(Math.round(y)));
	} catch {
		/* ignore */
	}
}

function clampHandleY(y: number): number {
	const maxY = Math.max(0, window.innerHeight - HANDLE_HEIGHT_PX);

	return Math.max(0, Math.min(maxY, y));
}

function onHandlePointerDown(e: PointerEvent): void {
	// Mouse: only primary button. Touch/pen: always allow.
	if (e.pointerType === 'mouse' && e.button !== 0) return;
	const target = e.currentTarget as HTMLElement;
	const rect = target.getBoundingClientRect();
	dragState = {
		pointerId: e.pointerId,
		startClientY: e.clientY,
		startHandleTop: rect.top,
		moved: false,
	};
	target.setPointerCapture(e.pointerId);
}

function onHandlePointerMove(e: PointerEvent): void {
	if (!dragState || e.pointerId !== dragState.pointerId) return;
	const dy = e.clientY - dragState.startClientY;
	if (!dragState.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
	dragState.moved = true;
	handleY = clampHandleY(dragState.startHandleTop + dy);
	m.redraw();
}

function onHandlePointerUp(e: PointerEvent): void {
	if (!dragState || e.pointerId !== dragState.pointerId) return;
	const target = e.currentTarget as HTMLElement;
	if (target.hasPointerCapture(e.pointerId)) {
		target.releasePointerCapture(e.pointerId);
	}
	const wasMoved = dragState.moved;
	dragState = null;
	if (wasMoved && handleY !== null) {
		lastDragEndTime = Date.now();
		saveHandleY(handleY);
		m.redraw();
	}
}

function onHandleClick(): void {
	// Mouse drags fire a click immediately after pointerup; touch drags often
	// don't fire one at all. Either way, only suppress within a short window.
	if (Date.now() - lastDragEndTime < CLICK_SUPPRESS_WINDOW_MS) return;
	toggleOpen();
}

function ensureResizeListener(): void {
	if (resizeListenerAttached) return;
	resizeListenerAttached = true;
	window.addEventListener('resize', () => {
		if (handleY === null) return;
		const clamped = clampHandleY(handleY);
		if (clamped !== handleY) {
			handleY = clamped;
			m.redraw();
		}
	});
}

function toggleOpen(): void {
	isOpen = !isOpen;
	m.redraw();
}

function close(): void {
	if (!isOpen) return;
	isOpen = false;
	m.redraw();
}

function ensureEscListener(): void {
	if (escListenerAttached) return;
	escListenerAttached = true;
	window.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape' && isOpen) close();
	});
}

function isThresholdOn(question: Statement): boolean {
	// Threshold is "on" when the admin has explicitly chosen the
	// above-threshold cutoff method. Any value (including 0) is treated as
	// an active filter — the user toggled it on, so honor that.
	return question.resultsSettings?.cutoffBy === CutoffBy.aboveThreshold;
}

function getThresholdValue(question: Statement): number {
	// `cutoffNumber` is the source-of-truth field used by the main app's
	// settings UI and the `updateChosenOptions` Cloud Function. Older builds
	// wrote `minConsensus` instead, so we fall back to it for back-compat
	// when reading existing question docs.
	const rs = question.resultsSettings;

	return rs?.cutoffNumber ?? rs?.minConsensus ?? DEFAULT_THRESHOLD;
}

/** Build a complete `ResultsSettings` patch by filling in any required fields
 *  the existing question may be missing. `resultsBy` is the only non-optional
 *  field on the schema, so we fall back to the schema-default `consensus`. */
function buildResultsSettingsPatch(
	base: ResultsSettings | undefined,
	patch: Partial<ResultsSettings>,
): ResultsSettings {
	return {
		...(base ?? {}),
		resultsBy: base?.resultsBy ?? ResultsBy.consensus,
		...patch,
	};
}

async function flipThreshold(question: Statement): Promise<void> {
	if (isThresholdOn(question)) {
		await setQuestionSetting(question.statementId, {
			resultsSettings: buildResultsSettingsPatch(question.resultsSettings, {
				cutoffBy: CutoffBy.topOptions,
			}),
		});
	} else {
		await setQuestionSetting(question.statementId, {
			resultsSettings: buildResultsSettingsPatch(question.resultsSettings, {
				cutoffBy: CutoffBy.aboveThreshold,
				cutoffNumber: getThresholdValue(question),
			}),
		});
	}
}

function writeThresholdValue(questionId: string, value: number): void {
	if (sliderWriteTimer !== null) window.clearTimeout(sliderWriteTimer);
	sliderWriteTimer = window.setTimeout(() => {
		sliderWriteTimer = null;
		const q = getQuestion();
		void setQuestionSetting(questionId, {
			resultsSettings: buildResultsSettingsPatch(q?.resultsSettings, {
				cutoffBy: CutoffBy.aboveThreshold,
				cutoffNumber: value,
			}),
		});
	}, SLIDER_DEBOUNCE_MS);
}

/** Path the main app would write to `powerFollowMe` to point participants
 *  at this specific question. The join app translates the path back into
 *  its own `/m/:mid/q/:qid` route via `mapMainAppPathToJoinTarget`. */
function broadcastPathForQuestion(questionId: string): string {
	return `/statement/${questionId}`;
}

function isFollowMeOn(question: Statement): boolean {
	return getPowerFollowMePath() === broadcastPathForQuestion(question.statementId);
}

/** Press the button to start broadcasting "follow me to this question";
 *  press it again to stop. The button itself is the only on/off control
 *  now that the standalone indicator has been removed. */
async function pressFollowMe(question: Statement, mainId: string): Promise<void> {
	const next = isFollowMeOn(question) ? '' : broadcastPathForQuestion(question.statementId);
	await setPowerFollowMe(mainId, next);
}

async function flipAllowNewOptions(question: Statement): Promise<void> {
	const next = !(question.statementSettings?.enableAddEvaluationOption ?? false);
	await setQuestionSetting(question.statementId, {
		statementSettings: {
			...question.statementSettings,
			enableAddEvaluationOption: next,
			enableAddVotingOption: next,
		},
	});
}

async function flipAllowChat(question: Statement): Promise<void> {
	const next = !(question.statementSettings?.hasChat ?? true);
	await setQuestionSetting(question.statementId, {
		statementSettings: {
			...question.statementSettings,
			hasChat: next,
		},
	});
}

async function flipShowResults(question: Statement): Promise<void> {
	const next = !(question.statementSettings?.showResults ?? false);
	await setQuestionSetting(question.statementId, {
		statementSettings: {
			...question.statementSettings,
			showResults: next,
		},
	});
}

/** Hub-scoped: writes to the *main* statement so the QR appears for every
 *  participant viewing the hub, regardless of which sub-question they then
 *  drill into. The toggle works from anywhere in the join app — admin doesn't
 *  have to navigate back to the hub to flip it. */
async function flipShowQR(main: Statement): Promise<void> {
	const next = !(main.statementSettings?.showQR ?? false);
	await setMainStatementSetting(main.statementId, {
		statementSettings: {
			...main.statementSettings,
			showQR: next,
		},
	});
}

/** Four-button segmented control for the admin-controlled sort. Writes to the
 *  question's `defaultSortType` so every subscriber sees the same order on
 *  the next snapshot — the chosen sort travels with "follow me" because both
 *  participants and the admin render from the same field. Random pushes a
 *  fresh seed every press so participants get a new shared shuffle. The
 *  segments display icons only; the label travels via aria-label/title. */
const SORT_OPTIONS: Array<{ value: SortType; icon: string; labelKey: string }> = [
	{ value: SortType.accepted, icon: '🤝', labelKey: 'facilitator.sort.consensus' },
	{ value: SortType.averageEvaluation, icon: '📊', labelKey: 'facilitator.sort.average' },
	{ value: SortType.random, icon: '🎲', labelKey: 'facilitator.sort.random' },
	{ value: SortType.newest, icon: '✨', labelKey: 'facilitator.sort.newest' },
];

function renderSortSegmented(question: Statement | null): m.Vnode {
	const current = question?.statementSettings?.defaultSortType ?? SortType.accepted;
	// Treat any non-Join sort value (e.g. legacy `mostUpdated`) as the consensus
	// default so a stale field doesn't leave every segment looking inactive.
	const supported = SORT_OPTIONS.some((o) => o.value === current);
	const active = supported ? current : SortType.accepted;
	const disabled = !question;

	return m('.facilitator-panel__row', [
		m('.facilitator-panel__row-main', [
			m('span.facilitator-panel__row-label', [
				m('span.facilitator-panel__row-icon', { 'aria-hidden': 'true' }, '📋'),
				t('facilitator.sort.label'),
			]),
			m(
				'.facilitator-panel__segmented',
				{ role: 'radiogroup', 'aria-label': t('facilitator.sort.label') },
				SORT_OPTIONS.map((opt) => {
					const isActive = active === opt.value;
					const label = t(opt.labelKey);

					return m(
						`button.facilitator-panel__segment.facilitator-panel__segment--icon${isActive ? '.facilitator-panel__segment--active' : ''}`,
						{
							type: 'button',
							role: 'radio',
							'aria-checked': isActive ? 'true' : 'false',
							'aria-label': label,
							title: label,
							disabled: disabled ? true : undefined,
							onclick: disabled
								? undefined
								: () => {
										if (!question) return;
										void setSortType(question.statementId, opt.value);
									},
						},
						m('span.facilitator-panel__segment-icon', { 'aria-hidden': 'true' }, opt.icon),
					);
				}),
			),
		]),
		m('.facilitator-panel__row-help', t('facilitator.sort.help')),
	]);
}

/** Open / close the 5-face evaluation row on every option card. Backed by
 *  `statementSettings.showEvaluation` (the same flag the main app uses) so
 *  flipping it from the FacilitatorPanel keeps the participant view in
 *  lockstep without further plumbing. Independent from "Show results" — a
 *  facilitator can keep the row visible while still hiding the numbers, or
 *  hide the row but reveal results to discuss them. */
async function flipShowEvaluation(question: Statement): Promise<void> {
	const next = !(question.statementSettings?.showEvaluation ?? false);
	await setEvaluationEnabled(question.statementId, next);
}

/** Show or hide the activist / organizer join row on every option card. The
 *  default is ON (`showJoining ?? true`) so existing questions keep the join
 *  experience the participant expects — admins explicitly write `false` to
 *  collapse the card to a pure-evaluation surface. Parallel to the
 *  showEvaluation toggle above; the two combine independently. */
async function flipShowJoining(question: Statement): Promise<void> {
	const next = !(question.statementSettings?.showJoining ?? true);
	await setQuestionSetting(question.statementId, {
		statementSettings: {
			...question.statementSettings,
			showJoining: next,
		},
	});
}

/** Three-segment theme picker (Serious / Kids / Teen). Writes to the *main*
 *  statement when there's a hub in scope so the chosen mood applies to the
 *  whole join experience; falls back to the question doc on legacy
 *  non-facilitated routes. The DOM `<html data-theme>` attribute is applied
 *  optimistically on click, and the snapshot listener reapplies it once
 *  Firestore confirms — so the palette swaps in instantly without a refresh. */
// Order goes Serious → Teen → Kids — left-to-right reads as a vibrancy ramp,
// from formal earth tones, through warm pinks/lavenders, to the full neon
// psychedelic kit.
const THEME_OPTIONS: Array<{ value: ThemeStyle; icon: string; labelKey: string }> = [
	{ value: ThemeStyle.serious, icon: '🎩', labelKey: 'facilitator.theme.serious' },
	{ value: ThemeStyle.playfulTeen, icon: '🌸', labelKey: 'facilitator.theme.playfulTeen' },
	{ value: ThemeStyle.playfulKids, icon: '🎈', labelKey: 'facilitator.theme.playfulKids' },
];

async function pickThemeStyle(
	value: ThemeStyle,
	targetId: string,
	target: Statement,
): Promise<void> {
	// Optimistic local update + DOM swap so the palette flips before the
	// Firestore round-trip completes. The snapshot listener will overwrite
	// these with the confirmed value (typically identical) once it lands.
	if (target.statementSettings) {
		target.statementSettings.themeStyle = value;
	} else {
		target.statementSettings = { themeStyle: value };
	}
	applyThemeStyleToDOM();
	m.redraw();
	await setThemeStyle(targetId, value);
}

function renderThemeSegmented(question: Statement | null, main: Statement | null): m.Vnode | null {
	// Theme is hub-scoped when there's a main statement — picking a mood for
	// "the room" feels right, and a single write applies to every sub-question.
	// On legacy non-facilitated routes (`/q/:qid`) we fall back to the question
	// itself so the picker still works.
	const target = main ?? question;
	if (!target) return null;

	const active = getActiveThemeStyle();
	const label = t('facilitator.theme.label');

	return m('.facilitator-panel__row', [
		m('.facilitator-panel__row-main', [
			m('span.facilitator-panel__row-label', [
				m('span.facilitator-panel__row-icon', { 'aria-hidden': 'true' }, '🎨'),
				label,
			]),
			m(
				'.facilitator-panel__segmented',
				{ role: 'radiogroup', 'aria-label': label },
				THEME_OPTIONS.map((opt) => {
					const isActive = active === opt.value;
					const optLabel = t(opt.labelKey);

					return m(
						`button.facilitator-panel__segment.facilitator-panel__segment--icon${isActive ? '.facilitator-panel__segment--active' : ''}`,
						{
							type: 'button',
							role: 'radio',
							'aria-checked': isActive ? 'true' : 'false',
							'aria-label': optLabel,
							title: optLabel,
							onclick: () => {
								void pickThemeStyle(opt.value, target.statementId, target);
							},
						},
						m('span.facilitator-panel__segment-icon', { 'aria-hidden': 'true' }, opt.icon),
					);
				}),
			),
		]),
		m('.facilitator-panel__row-help', t('facilitator.theme.help')),
	]);
}

function renderToggle(opts: {
	label: string;
	on: boolean;
	disabled?: boolean;
	onflip: () => void;
	help?: string;
	/** Optional emoji prefix shown next to the label so admins can scan the
	 *  panel and pick out related toggles (🗳️ evaluation vs 🤝 joining)
	 *  without reading every line. Decorative only — the aria-label stays
	 *  the plain text so screen readers don't announce "ballot box…". */
	icon?: string;
}): m.Vnode {
	const { label, on, disabled, onflip, help, icon } = opts;

	return m('.facilitator-panel__row', [
		m('.facilitator-panel__row-main', [
			m('span.facilitator-panel__row-label', [
				icon
					? m('span.facilitator-panel__row-icon', { 'aria-hidden': 'true' }, icon)
					: null,
				label,
			]),
			m(
				`button.facilitator-panel__toggle${on ? '.facilitator-panel__toggle--on' : ''}${disabled ? '.facilitator-panel__toggle--disabled' : ''}`,
				{
					type: 'button',
					role: 'switch',
					'aria-checked': on ? 'true' : 'false',
					'aria-label': label,
					disabled: disabled ? true : undefined,
					onclick: disabled ? undefined : onflip,
				},
				[m('.facilitator-panel__toggle-track'), m('.facilitator-panel__toggle-knob')],
			),
		]),
		help ? m('.facilitator-panel__row-help', help) : null,
	]);
}

export const FacilitatorPanel: m.Component = {
	oninit() {
		ensureEscListener();
		ensureResizeListener();
		loadHandleY();
	},

	view() {
		if (!isAdmin()) return null;

		const question = getQuestion();
		const hasQuestion = question !== null;
		const mainId = m.route.param('mid');
		const canLead = hasQuestion && Boolean(mainId);
		const followMeOn = canLead ? isFollowMeOn(question!) : false;
		const thresholdOn = hasQuestion ? isThresholdOn(question!) : false;
		const thresholdVal = hasQuestion ? getThresholdValue(question!) : DEFAULT_THRESHOLD;
		const allowNewOptionsOn = hasQuestion
			? (question!.statementSettings?.enableAddEvaluationOption ?? false)
			: false;
		const allowChatOn = hasQuestion ? (question!.statementSettings?.hasChat ?? true) : true;
		const showResultsOn = hasQuestion ? (question!.statementSettings?.showResults ?? false) : false;
		const showEvaluationOn = hasQuestion
			? (question!.statementSettings?.showEvaluation ?? false)
			: false;
		// Default ON ("opt-out"): undefined here means a fresh question that
		// hasn't yet been touched by the facilitator should still surface
		// joining as the primary participant action.
		const showJoiningOn = hasQuestion ? (question!.statementSettings?.showJoining ?? true) : true;
		// QR sharing is hub-scoped: the toggle writes to the *main* statement so
		// every participant on the hub sees the same QR. It's only meaningful
		// when there's a main statement in scope — i.e. on facilitated routes
		// (`/m/:mid…`). Legacy non-facilitated routes (`/q/:qid`) don't carry a
		// mid, so we hide the row entirely there rather than render a perpetually
		// disabled toggle that confuses admins.
		const main = getMainStatement();
		const canFlipShowQR = main !== null && Boolean(mainId);
		const showQROn = canFlipShowQR ? (main!.statementSettings?.showQR ?? false) : false;

		const positioned = handleY !== null;
		const dragging = dragState !== null;
		const handleClasses = [
			'facilitator-panel__handle',
			isOpen ? 'facilitator-panel__handle--open' : null,
			positioned ? 'facilitator-panel__handle--positioned' : null,
			dragging ? 'facilitator-panel__handle--dragging' : null,
		]
			.filter(Boolean)
			.join('.');

		return m('.facilitator-panel-root', [
			m(
				`button.${handleClasses}`,
				{
					type: 'button',
					'aria-expanded': isOpen ? 'true' : 'false',
					'aria-controls': 'facilitator-panel-drawer',
					'aria-label': t('facilitator.panel.handle'),
					title: t('facilitator.panel.handle'),
					style: positioned ? { top: `${clampHandleY(handleY!)}px` } : undefined,
					onpointerdown: onHandlePointerDown,
					onpointermove: onHandlePointerMove,
					onpointerup: onHandlePointerUp,
					onpointercancel: onHandlePointerUp,
					onclick: onHandleClick,
				},
				m('span.facilitator-panel__handle-icon', { 'aria-hidden': 'true' }, '⚙'),
			),
			isOpen ? m('.facilitator-panel__backdrop', { onclick: close }) : null,
			m(
				`.facilitator-panel${isOpen ? '.facilitator-panel--open' : ''}`,
				{
					id: 'facilitator-panel-drawer',
					role: 'dialog',
					'aria-modal': isOpen ? 'true' : 'false',
					'aria-label': t('facilitator.panel.title'),
					'aria-hidden': isOpen ? 'false' : 'true',
				},
				[
					m('.facilitator-panel__header', [
						m('span.facilitator-panel__title', t('facilitator.panel.title')),
						m(
							'button.facilitator-panel__close',
							{
								type: 'button',
								'aria-label': t('facilitator.panel.close'),
								onclick: close,
							},
							'×',
						),
					]),
					!hasQuestion ? m('.facilitator-panel__notice', t('facilitator.panel.no_question')) : null,
					m('.facilitator-panel__row', [
						m('.facilitator-panel__row-main', [
							m(
								`button.btn.facilitator-panel__action${followMeOn ? '.btn--secondary.facilitator-panel__action--on' : '.btn--primary'}`,
								{
									type: 'button',
									disabled: !canLead,
									'aria-pressed': followMeOn ? 'true' : 'false',
									'aria-label': followMeOn
										? t('facilitator.action.followMe.stop')
										: t('facilitator.action.followMe'),
									onclick: () => {
										if (!canLead) return;
										void pressFollowMe(question!, mainId!);
									},
								},
								[
									m('span.facilitator-panel__action-icon', { 'aria-hidden': 'true' }, '📣'),
									m(
										'span.facilitator-panel__action-label',
										followMeOn
											? t('facilitator.action.followMe.stop')
											: t('facilitator.action.followMe'),
									),
								],
							),
						]),
						m(
							'.facilitator-panel__row-help',
							followMeOn
								? t('facilitator.action.followMe.activeHelp')
								: t('facilitator.action.followMe.help'),
						),
					]),
					canFlipShowQR
						? renderToggle({
								icon: '📲',
								label: t('facilitator.toggle.showQR'),
								on: showQROn,
								onflip: () => {
									if (!canFlipShowQR) return;
									void flipShowQR(main!);
								},
								help: t('facilitator.toggle.showQR.help'),
							})
						: null,
					renderThemeSegmented(question, main),
					renderSortSegmented(question),
					renderToggle({
						icon: '🗳️',
						label: t('facilitator.toggle.showEvaluation'),
						on: showEvaluationOn,
						disabled: !hasQuestion,
						onflip: () => {
							if (!hasQuestion) return;
							void flipShowEvaluation(question!);
						},
						help: t('facilitator.toggle.showEvaluation.help'),
					}),
					renderToggle({
						icon: '🤝',
						label: t('facilitator.toggle.showJoining'),
						on: showJoiningOn,
						disabled: !hasQuestion,
						onflip: () => {
							if (!hasQuestion) return;
							void flipShowJoining(question!);
						},
						help: t('facilitator.toggle.showJoining.help'),
					}),
					renderToggle({
						icon: '📈',
						label: t('facilitator.toggle.showResults'),
						on: showResultsOn,
						disabled: !hasQuestion,
						onflip: () => {
							if (!hasQuestion) return;
							void flipShowResults(question!);
						},
						help: t('facilitator.toggle.showResults.help'),
					}),
					renderToggle({
						icon: '➕',
						label: t('facilitator.toggle.allowAdd'),
						on: allowNewOptionsOn,
						disabled: !hasQuestion,
						onflip: () => {
							if (!hasQuestion) return;
							void flipAllowNewOptions(question!);
						},
						help: t('facilitator.toggle.allowAdd.help'),
					}),
					renderToggle({
						icon: '🎚️',
						label: t('facilitator.toggle.threshold'),
						on: thresholdOn,
						disabled: !hasQuestion,
						onflip: () => {
							if (!hasQuestion) return;
							void flipThreshold(question!);
						},
						help: t('facilitator.toggle.threshold.help'),
					}),
					thresholdOn && hasQuestion
						? m('.facilitator-panel__slider-row', [
								m('input.facilitator-panel__slider', {
									type: 'range',
									min: '0',
									max: '1',
									step: '0.05',
									value: String(thresholdVal),
									'aria-label': t('facilitator.toggle.threshold'),
									oninput: (e: InputEvent) => {
										const raw = (e.target as HTMLInputElement).value;
										const v = Number(raw);
										if (!Number.isFinite(v)) return;
										// Optimistic local update so the label tracks the drag.
										if (question!.resultsSettings) {
											question!.resultsSettings.cutoffNumber = v;
										}
										writeThresholdValue(question!.statementId, v);
										m.redraw();
									},
								}),
								m(
									'span.facilitator-panel__slider-value',
									t('facilitator.toggle.threshold.value', {
										value: thresholdVal.toFixed(2),
									}),
								),
							])
						: null,
					renderToggle({
						icon: '💬',
						label: t('facilitator.toggle.allowChat'),
						on: allowChatOn,
						disabled: !hasQuestion,
						onflip: () => {
							if (!hasQuestion) return;
							void flipAllowChat(question!);
						},
					}),
				],
			),
		]);
	},
};
