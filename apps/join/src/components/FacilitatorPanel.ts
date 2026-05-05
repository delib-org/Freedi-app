import m from 'mithril';
import { CutoffBy, ResultsBy, SortType, Statement, ThemeStyle } from '@freedi/shared-types';
import type {
	JoinFormConfig,
	JoinFormDestination,
	JoinFormField,
	JoinFormFieldType,
	ResultsSettings,
} from '@freedi/shared-types';
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
	setStatementLanguage,
	getActiveLanguageScope,
	testSheetAccess,
	TestSheetAccessResult,
} from '@/lib/store';
import { t, getAvailableLanguages, getLang } from '@/lib/i18n';

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

// --- Activation threshold (min organizers / activists / max-joins-per-user) -
// Writes to `statementSettings.activationThreshold` on the question. The
// Solutions view reads the same path to render the "X organizers + Y activists
// needed" subtitle and the per-card quota bar, and the join handler reads
// `maxJoinsPerUser` to decide whether to prompt the swap modal.
function getActivationThreshold(question: Statement): {
	enabled: boolean;
	minOrganizers: number;
	minActivists: number;
	maxJoinsPerUser: number;
} {
	const t = question.statementSettings?.activationThreshold;

	return {
		enabled: t?.enabled ?? false,
		minOrganizers: t?.minOrganizers ?? 0,
		minActivists: t?.minActivists ?? 0,
		maxJoinsPerUser: t?.maxJoinsPerUser ?? 0,
	};
}

async function setActivationThreshold(
	question: Statement,
	patch: Partial<{
		enabled: boolean;
		minOrganizers: number;
		minActivists: number;
		maxJoinsPerUser: number;
	}>,
): Promise<void> {
	const current = getActivationThreshold(question);
	const next = { ...current, ...patch };
	// Optimistic local update so the inputs/help line reflect the change before
	// Firestore confirms — the snapshot listener will overwrite with the same
	// value once the write lands.
	if (question.statementSettings) {
		question.statementSettings.activationThreshold = next;
	} else {
		question.statementSettings = { activationThreshold: next };
	}
	m.redraw();
	await setQuestionSetting(question.statementId, {
		statementSettings: {
			...question.statementSettings,
			activationThreshold: next,
		},
	});
}

async function flipActivationThresholdEnabled(question: Statement): Promise<void> {
	const current = getActivationThreshold(question);
	await setActivationThreshold(question, { enabled: !current.enabled });
}

function renderActivationThresholdSection(question: Statement | null): m.Vnode | null {
	if (!question) return null;
	const cfg = getActivationThreshold(question);

	const toggleRow = renderToggle({
		icon: '🚦',
		label: t('facilitator.activation.label'),
		on: cfg.enabled,
		onflip: () => {
			void flipActivationThresholdEnabled(question);
		},
		help: t('facilitator.activation.help'),
	});

	if (!cfg.enabled) return toggleRow;

	const numberRow = (opts: {
		labelKey: string;
		helpKey: string;
		value: number;
		onChange: (v: number) => void;
	}): m.Vnode =>
		m('.facilitator-panel__row', [
			m('.facilitator-panel__row-main', [
				m('span.facilitator-panel__row-label', t(opts.labelKey)),
				m('input.facilitator-panel__number-input', {
					type: 'number',
					min: '0',
					step: '1',
					value: String(opts.value),
					'aria-label': t(opts.labelKey),
					oninput: (e: InputEvent) => {
						const raw = (e.target as HTMLInputElement).value;
						const v = Math.max(0, Math.floor(Number(raw)));
						if (!Number.isFinite(v)) return;
						opts.onChange(v);
					},
				}),
			]),
			m('.facilitator-panel__row-help', t(opts.helpKey)),
		]);

	return m('.facilitator-panel__activation', [
		toggleRow,
		numberRow({
			labelKey: 'facilitator.activation.minOrganizers',
			helpKey: 'facilitator.activation.minOrganizers.help',
			value: cfg.minOrganizers,
			onChange: (v) => {
				void setActivationThreshold(question, { minOrganizers: v });
			},
		}),
		numberRow({
			labelKey: 'facilitator.activation.minActivists',
			helpKey: 'facilitator.activation.minActivists.help',
			value: cfg.minActivists,
			onChange: (v) => {
				void setActivationThreshold(question, { minActivists: v });
			},
		}),
		numberRow({
			labelKey: 'facilitator.activation.maxJoinsPerUser',
			helpKey: 'facilitator.activation.maxJoinsPerUser.help',
			value: cfg.maxJoinsPerUser,
			onChange: (v) => {
				void setActivationThreshold(question, { maxJoinsPerUser: v });
			},
		}),
	]);
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

/** Hub-scoped (with a question fallback) language picker + force toggle.
 *  Writes `defaultLanguage` and `forceLanguage` to the main statement so the
 *  whole join experience speaks the chosen language — every participant on
 *  the next snapshot gets the new language as their default, and (when force
 *  is on) overrides any personal pick they made. The participant-side widget
 *  flips to a disabled state with a "Set by facilitator" chip when force is
 *  on, so the asymmetry is explained on screen. */
async function pickLanguage(value: string, force: boolean, target: Statement): Promise<void> {
	// Optimistic local update so the row reflects the choice before Firestore
	// confirms — the snapshot listener overwrites with the same value when it
	// lands. Mirrors how the Theme picker handles its own optimistic write.
	target.defaultLanguage = value;
	target.forceLanguage = force;
	m.redraw();
	await setStatementLanguage(target.statementId, value, force);
}

function renderLanguageRow(question: Statement | null, main: Statement | null): m.Vnode | null {
	// Language scope follows the Theme rule: prefer main statement (hub-wide),
	// fall back to question on legacy non-facilitated routes. Reading from
	// `getActiveLanguageScope()` keeps the source-of-truth in store.ts.
	const target = main ?? question;
	if (!target) return null;

	const scope = getActiveLanguageScope();
	// Default the picker's displayed value to the active UI language when no
	// explicit room language has been set yet — matches what the admin sees
	// and avoids an empty-looking dropdown on first open.
	const selectedLang = scope.defaultLanguage ?? getLang();
	const force = scope.forceLanguage;
	const langs = getAvailableLanguages();
	const label = t('facilitator.language.label');
	const forceLabel = t('facilitator.language.force');

	return m('.facilitator-panel__row', [
		m('.facilitator-panel__row-main', [
			m('span.facilitator-panel__row-label', [
				m('span.facilitator-panel__row-icon', { 'aria-hidden': 'true' }, '🌐'),
				label,
			]),
			m('.facilitator-panel__lang-controls', [
				m(
					'select.facilitator-panel__lang-select',
					{
						'aria-label': label,
						value: selectedLang,
						onchange: (e: Event) => {
							const value = (e.target as HTMLSelectElement).value;
							void pickLanguage(value, force, target);
						},
					},
					langs.map((l) => m('option', { value: l.code, dir: 'auto' }, l.name)),
				),
				m('label.facilitator-panel__lang-force', [
					m('input', {
						type: 'checkbox',
						checked: force,
						'aria-label': forceLabel,
						onchange: (e: Event) => {
							const next = (e.target as HTMLInputElement).checked;
							void pickLanguage(selectedLang, next, target);
						},
					}),
					m('span', forceLabel),
				]),
			]),
		]),
		m('.facilitator-panel__row-help', t('facilitator.language.help')),
	]);
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
				icon ? m('span.facilitator-panel__row-icon', { 'aria-hidden': 'true' }, icon) : null,
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

// --- Join form configurator -------------------------------------------------
// All saves write to the *current* sub-question's `statementSettings.joinForm`.
// The participant Solutions view already reads from the same path when handling
// a Join click, so flips here propagate live (snapshot → store → redraw).
//
// Default fields mirror the main app (Name / Phone / Email) so a freshly enabled
// form has something useful from the first paint — facilitators rarely want to
// configure a blank list before they can hand the form to participants.
//
// `joinFormEditorOpen` keeps the field/destination editor collapsed by default
// even when the form is enabled, so the panel doesn't grow into a wall of
// inputs every time the toggle flips on. Click the chevron row to reveal.

let joinFormEditorOpen = false;
let sheetCheckState: 'idle' | 'checking' | 'ok' | 'fail' = 'idle';
let sheetCheckResult: TestSheetAccessResult | null = null;

function buildDefaultJoinFields(): JoinFormField[] {
	return [
		{ id: 'name', label: t('facilitator.joinForm.default.name'), type: 'text', required: true },
		{
			id: 'phone',
			label: t('facilitator.joinForm.default.phone'),
			type: 'phone',
			required: true,
		},
		{
			id: 'email',
			label: t('facilitator.joinForm.default.email'),
			type: 'email',
			required: false,
		},
	];
}

function makeFieldId(label: string, existing: JoinFormField[]): string {
	const slug =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'field';
	let candidate = slug;
	let i = 1;
	while (existing.some((f) => f.id === candidate)) {
		candidate = `${slug}-${i++}`;
	}

	return candidate;
}

function getJoinFormConfig(question: Statement): JoinFormConfig {
	const existing = question.statementSettings?.joinForm;

	return {
		enabled: existing?.enabled ?? false,
		destination: existing?.destination ?? 'firestore',
		sheetUrl: existing?.sheetUrl,
		fields:
			existing?.fields && existing.fields.length > 0 ? existing.fields : buildDefaultJoinFields(),
		formLanguage: existing?.formLanguage,
	};
}

async function persistJoinForm(question: Statement, next: JoinFormConfig): Promise<void> {
	// Optimistic local update so the panel UI reflects the change before the
	// snapshot lands; setQuestionSetting writes to Firestore and the listener
	// will overwrite (with the same value) on confirmation.
	if (question.statementSettings) {
		question.statementSettings.joinForm = next;
	} else {
		question.statementSettings = { joinForm: next };
	}
	m.redraw();
	// Firestore rejects `undefined` values — strip optional fields that aren't set
	// so the document write succeeds even when sheetUrl / formLanguage are absent.
	const safeConfig = Object.fromEntries(
		Object.entries(next).filter(([, v]) => v !== undefined),
	) as JoinFormConfig;
	await setQuestionSetting(question.statementId, {
		statementSettings: { joinForm: safeConfig },
	});
}

async function flipJoinFormEnabled(question: Statement): Promise<void> {
	const next = getJoinFormConfig(question);
	next.enabled = !next.enabled;
	// Always reset the editor to collapsed when the toggle flips. Turning the
	// form on shouldn't auto-expand the editor; turning it off should hide it.
	joinFormEditorOpen = false;
	await persistJoinForm(question, next);
}

async function setJoinFormDestination(
	question: Statement,
	destination: JoinFormDestination,
): Promise<void> {
	const next = getJoinFormConfig(question);
	next.destination = destination;
	if (destination !== 'sheets') {
		next.sheetUrl = undefined;
	}
	await persistJoinForm(question, next);
}

async function setJoinFormSheetUrl(question: Statement, url: string): Promise<void> {
	const next = getJoinFormConfig(question);
	next.sheetUrl = url;
	sheetCheckState = 'idle';
	sheetCheckResult = null;
	await persistJoinForm(question, next);
}

async function runSheetCheck(sheetUrl: string): Promise<void> {
	if (!sheetUrl) return;
	sheetCheckState = 'checking';
	sheetCheckResult = null;
	m.redraw();
	try {
		const result = await testSheetAccess(sheetUrl);
		sheetCheckResult = result;
		sheetCheckState = result.ok ? 'ok' : 'fail';
	} catch {
		sheetCheckState = 'fail';
		sheetCheckResult = { ok: false, serviceAccountEmail: '', error: 'Request failed' };
	}
	m.redraw();
}

async function updateJoinFormField(
	question: Statement,
	index: number,
	patch: Partial<JoinFormField>,
): Promise<void> {
	const next = getJoinFormConfig(question);
	next.fields = next.fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
	await persistJoinForm(question, next);
}

async function addJoinFormField(question: Statement): Promise<void> {
	const next = getJoinFormConfig(question);
	const label = t('facilitator.joinForm.default.field');
	next.fields = [
		...next.fields,
		{ id: makeFieldId(label, next.fields), label, type: 'text', required: false },
	];
	await persistJoinForm(question, next);
}

async function removeJoinFormField(question: Statement, index: number): Promise<void> {
	const next = getJoinFormConfig(question);
	next.fields = next.fields.filter((_, i) => i !== index);
	await persistJoinForm(question, next);
}

function renderJoinFormSection(question: Statement | null): m.Vnode | null {
	if (!question) return null;
	const config = getJoinFormConfig(question);

	const toggleRow = renderToggle({
		icon: '📋',
		label: t('facilitator.joinForm.label'),
		on: config.enabled,
		onflip: () => {
			void flipJoinFormEnabled(question);
		},
		help: t('facilitator.joinForm.help'),
	});

	if (!config.enabled) return toggleRow;

	const editorHeader = m(
		'button.facilitator-panel__joinform-accordion',
		{
			type: 'button',
			'aria-expanded': joinFormEditorOpen ? 'true' : 'false',
			'aria-controls': `joinform-editor-${question.statementId}`,
			'aria-label': joinFormEditorOpen
				? t('facilitator.joinForm.editorToggle.collapse')
				: t('facilitator.joinForm.editorToggle.expand'),
			onclick: () => {
				joinFormEditorOpen = !joinFormEditorOpen;
				m.redraw();
			},
		},
		[
			m(
				`span.facilitator-panel__joinform-accordion-chevron${joinFormEditorOpen ? '.facilitator-panel__joinform-accordion-chevron--open' : ''}`,
				{ 'aria-hidden': 'true' },
				'▾',
			),
			m('span.facilitator-panel__joinform-accordion-label', t('facilitator.joinForm.editorToggle')),
			m(
				'span.facilitator-panel__joinform-accordion-meta',
				`${config.fields.length} · ${
					config.destination === 'sheets'
						? t('facilitator.joinForm.destination.sheets')
						: t('facilitator.joinForm.destination.firestore')
				}`,
			),
		],
	);

	if (!joinFormEditorOpen) {
		return m('.facilitator-panel__joinform-wrap', [toggleRow, editorHeader]);
	}

	return m('.facilitator-panel__joinform-wrap', [
		toggleRow,
		editorHeader,
		m('.facilitator-panel__joinform', { id: `joinform-editor-${question.statementId}` }, [
			// Destination picker — two compact pill buttons
			m('.facilitator-panel__joinform-section', [
				m('.facilitator-panel__joinform-label', t('facilitator.joinForm.destination')),
				m('.facilitator-panel__joinform-segmented', [
					m(
						`button.facilitator-panel__segment${config.destination === 'firestore' ? '.facilitator-panel__segment--active' : ''}`,
						{
							type: 'button',
							onclick: () => {
								void setJoinFormDestination(question, 'firestore');
							},
						},
						t('facilitator.joinForm.destination.firestore'),
					),
					m(
						`button.facilitator-panel__segment${config.destination === 'sheets' ? '.facilitator-panel__segment--active' : ''}`,
						{
							type: 'button',
							onclick: () => {
								void setJoinFormDestination(question, 'sheets');
							},
						},
						t('facilitator.joinForm.destination.sheets'),
					),
				]),
			]),
			config.destination === 'sheets'
				? m('.facilitator-panel__joinform-section', [
						m(
							'label.facilitator-panel__joinform-label',
							{ for: `joinform-sheet-${question.statementId}` },
							t('facilitator.joinForm.sheetUrl'),
						),
						m('.facilitator-panel__joinform-sheet-row', [
							m('input.facilitator-panel__joinform-input', {
								id: `joinform-sheet-${question.statementId}`,
								type: 'url',
								value: config.sheetUrl ?? '',
								placeholder: t('facilitator.joinForm.sheetUrl.placeholder'),
								onchange: (e: Event) => {
									void setJoinFormSheetUrl(question, (e.target as HTMLInputElement).value);
								},
							}),
							m(
								`button.facilitator-panel__joinform-check${sheetCheckState === 'ok' ? '.facilitator-panel__joinform-check--ok' : ''}${sheetCheckState === 'fail' ? '.facilitator-panel__joinform-check--fail' : ''}`,
								{
									type: 'button',
									disabled: !config.sheetUrl || sheetCheckState === 'checking',
									onclick: () => {
										if (config.sheetUrl) void runSheetCheck(config.sheetUrl);
									},
								},
								sheetCheckState === 'checking'
									? t('facilitator.joinForm.sheetCheck.checking')
									: sheetCheckState === 'ok'
										? t('facilitator.joinForm.sheetCheck.ok')
										: sheetCheckState === 'fail'
											? t('facilitator.joinForm.sheetCheck.fail')
											: t('facilitator.joinForm.sheetCheck'),
							),
						]),
						sheetCheckResult
							? m(
									`.facilitator-panel__joinform-check-status${sheetCheckResult.ok ? '.facilitator-panel__joinform-check-status--ok' : '.facilitator-panel__joinform-check-status--fail'}`,
									[
										sheetCheckResult.error
											? m('span', sheetCheckResult.error)
											: null,
										sheetCheckResult.serviceAccountEmail
											? m('.facilitator-panel__joinform-sheet-hint', [
													m('span', t('facilitator.joinForm.sheetHint')),
													m(
														'code.facilitator-panel__joinform-sheet-email',
														sheetCheckResult.serviceAccountEmail,
													),
												])
											: null,
									],
								)
							: !config.sheetUrl
								? null
								: m('.facilitator-panel__joinform-sheet-hint', [
										m('span', t('facilitator.joinForm.sheetHint')),
									]),
					])
				: null,
			m('.facilitator-panel__joinform-section', [
				m('.facilitator-panel__joinform-label', t('facilitator.joinForm.fields')),
				m(
					'.facilitator-panel__joinform-fields',
					config.fields.map((field, index) =>
						m('.facilitator-panel__joinform-field', { key: field.id }, [
							m('input.facilitator-panel__joinform-input', {
								type: 'text',
								value: field.label,
								'aria-label': t('facilitator.joinForm.field.label'),
								onchange: (e: Event) => {
									void updateJoinFormField(question, index, {
										label: (e.target as HTMLInputElement).value,
									});
								},
							}),
							m(
								'select.facilitator-panel__joinform-select',
								{
									value: field.type,
									'aria-label': t('facilitator.joinForm.field.type'),
									onchange: (e: Event) => {
										void updateJoinFormField(question, index, {
											type: (e.target as HTMLSelectElement).value as JoinFormFieldType,
										});
									},
								},
								[
									m('option', { value: 'text' }, t('facilitator.joinForm.field.type.text')),
									m('option', { value: 'phone' }, t('facilitator.joinForm.field.type.phone')),
									m('option', { value: 'email' }, t('facilitator.joinForm.field.type.email')),
								],
							),
							m('label.facilitator-panel__joinform-required', [
								m('input', {
									type: 'checkbox',
									checked: field.required,
									onchange: (e: Event) => {
										void updateJoinFormField(question, index, {
											required: (e.target as HTMLInputElement).checked,
										});
									},
								}),
								m('span', t('facilitator.joinForm.field.required')),
							]),
							m(
								'button.facilitator-panel__joinform-remove',
								{
									type: 'button',
									'aria-label': t('facilitator.joinForm.field.remove'),
									title: t('facilitator.joinForm.field.remove'),
									onclick: () => {
										void removeJoinFormField(question, index);
									},
								},
								'×',
							),
						]),
					),
				),
				m(
					'button.facilitator-panel__joinform-add',
					{
						type: 'button',
						onclick: () => {
							void addJoinFormField(question);
						},
					},
					t('facilitator.joinForm.field.add'),
				),
			]),
		]),
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
					renderLanguageRow(question, main),
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
					renderActivationThresholdSection(question),
					renderJoinFormSection(question),
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
