import { isVillageMode } from '../../lib/flows/sessionLinks';
import m from 'mithril';
import { getLang, t } from '../../lib/i18n';
import { getUserState, ensureUser } from '../../lib/user';
import { createSession, teacherClass } from '../../lib/callables';
import {
	classLabel,
	EMPTY_DASHBOARD,
	fetchTeacherDashboard,
	listTopicPackages,
	type TeacherDashboard,
} from '../../lib/teacher';
import { ClassForm, type ClassFormValue } from '../../components/ClassForm';
import { Collapsible } from '../../components/Collapsible';
import { Icon } from '../../components/Icon';
import { StagePlanEditor } from './StagePlanEditor';
import { lookDots, PRESET_SEEDS } from '../../components/LookPicker';
import {
	AGORA_DEFAULT_THEME,
	AGORA_THEME_PRESETS,
	AgoraDeviceMode,
	AgoraThemePreset,
	AgoraIdentityMode,
	AgoraSessionFlow,
	AgoraSessionMode,
	AgoraStagePlanItem,
	AgoraTopicPackage,
	AgoraTopicStatus,
	AGORA_STAGE_PLAN,
	resolveSessionFlow,
	stagePlanPreset,
	validateStagePlan,
} from '@freedi/shared-types';
import { TeacherNav } from '../../components/TeacherNav';
import { countedSteps } from '../../lib/teacherSteps';

type GameMode = 'scenario' | 'quick';

/** The scenario list's last row: no scenario, the teacher's own question */
const OWN_QUESTION = '__own__';
/** How much of the question becomes the game's name when none was typed */
const NAME_FROM_QUESTION = 40;

/**
 * Start a lesson — a three-line form.
 *
 * What are we playing (a scenario, or the teacher's own question), which
 * class, and the button. That is the whole of a first lesson; the rest —
 * the steps, the names, the devices, the colours, the rounds — is already
 * set to the usual game and waits under "advanced settings", where a teacher
 * on their tenth lesson will find it.
 *
 * The page used to open with a mode toggle, a stage plan of eleven rows and
 * six more choices before a button 2,000px down. One of those choices was
 * required.
 */
export function StartGame(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let classes: TeacherDashboard['classes'] = [];
	let schools: TeacherDashboard['schools'] = [];
	let newClassOpen = false;
	let creatingClass = false;
	let newClassError: string | null = null;
	let loaded = false;
	/** A scenario's id, OWN_QUESTION, or nothing chosen yet */
	let chosenId: string | null = null;
	/** A class id, 'none' for a one-off lesson, or nothing chosen yet */
	let classChoice: string | 'none' | null = null;
	let deviceMode: AgoraDeviceMode = AgoraDeviceMode.individual;
	let identity: AgoraIdentityMode = 'pseudonym';
	/** Real names at the door, for the teacher alone — on for a lesson */
	let collectRealNames = true;
	let look: AgoraThemePreset = AGORA_DEFAULT_THEME;
	let creating = false;
	let createFailed = false;
	let advancedOpen = isVillageMode(window.location.search);
	let moreOpen = false;

	// Auth settles in two beats — anonymous first, the teacher's Google account
	// a moment later. Reading the library on the first beat left this screen
	// with no scenarios to offer, which silently forced quick mode.
	let loadedForUid: string | null = null;
	let refilling = false;

	let quickTitle = '';
	let quickQuestion = '';
	let quickExplanation = '';

	const defaults = resolveSessionFlow({ sessionMode: AgoraSessionMode.classroom });
	let rounds = defaults.rounds;

	let plans: Record<GameMode, AgoraStagePlanItem[]> = {
		scenario: stagePlanPreset('scenarioWizcol'),
		quick: stagePlanPreset('wizcol'),
	};

	function mode(): GameMode {
		return chosenId === OWN_QUESTION ? 'quick' : 'scenario';
	}

	async function load(): Promise<void> {
		try {
			const user = await ensureUser();
			loadedForUid = user.uid;
			const [loadedTopics, dashboard] = await Promise.all([
				listTopicPackages(user.uid),
				fetchTeacherDashboard().catch((error: unknown) => {
					console.error('[Teacher] Loading classes failed:', error);

					return EMPTY_DASHBOARD;
				}),
			]);
			topics = loadedTopics.filter((topic) => topic.status === AgoraTopicStatus.ready);
			classes = dashboard.classes;
			schools = dashboard.schools;

			// Which class: the one the dashboard sent us from, else the only one
			// there is, else — with no class to pick — a one-off lesson. A teacher
			// with several classes chooses; nothing is highlighted for them.
			const routeClass = m.route.param('classId');
			if (routeClass && classes.some((agoraClass) => agoraClass.classId === routeClass)) {
				classChoice = routeClass;
			} else if (classes.length === 1) {
				classChoice = classes[0].classId;
			} else if (classes.length === 0 && schools.length === 0) {
				classChoice = 'none';
			}

			// Arrived by tapping a scenario on the shelf: that choice IS the
			// answer to the first question on this screen, so hold it. A link to
			// a scenario that is no longer ready falls back to the picker rather
			// than starting a game the teacher did not choose.
			const routeTopic = m.route.param('topic');
			const carried = routeTopic
				? (topics.find((topic) => topic.topicPackageId === routeTopic) ?? null)
				: null;
			if (carried) {
				chosenId = carried.topicPackageId;
			} else if (m.route.param('mode') === 'quick' || topics.length === 0) {
				chosenId = OWN_QUESTION;
			} else if (topics.length === 1) {
				chosenId = topics[0].topicPackageId;
			}
		} catch (error) {
			console.error('[Teacher] Loading start-game data failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	/** Open a class in the teacher's school and make it today's class */
	async function createClass(value: ClassFormValue): Promise<void> {
		if (creatingClass) return;
		creatingClass = true;
		newClassError = null;
		m.redraw();
		try {
			const result = await teacherClass({
				action: 'create',
				name: value.name,
				...(value.gradeLevel ? { gradeLevel: value.gradeLevel } : {}),
				...(value.schoolId ? { schoolId: value.schoolId } : {}),
			});
			const dashboard = await fetchTeacherDashboard();
			classes = dashboard.classes;
			schools = dashboard.schools;
			classChoice = result.classId;
			newClassOpen = false;
		} catch (error) {
			console.error('[Teacher] Creating a class failed:', error);
			newClassError = t('classForm.error');
		}
		creatingClass = false;
		m.redraw();
	}

	/** Only the knobs that differ from the defaults travel to the server. */
	function changedFlow(): AgoraSessionFlow | undefined {
		return rounds !== defaults.rounds ? { rounds } : undefined;
	}

	/** The game's name: what was typed, or the start of the question */
	function gameTitle(): string {
		const typed = quickTitle.trim();
		if (typed) return typed;
		const question = quickQuestion.trim();

		return question.length > NAME_FROM_QUESTION
			? `${question.slice(0, NAME_FROM_QUESTION).trimEnd()}…`
			: question;
	}

	function canCreate(): boolean {
		if (creating || chosenId === null || classChoice === null) return false;
		const plan = plans[mode()];
		if (validateStagePlan(plan, { hasCharacters: mode() === 'scenario' }).length > 0) return false;
		if (mode() === 'quick') return quickQuestion.trim().length > 0;

		return true;
	}

	async function handleCreate(): Promise<void> {
		if (!canCreate()) return;
		creating = true;
		createFailed = false;
		m.redraw();
		try {
			const flow = changedFlow();
			const result = await createSession({
				...(mode() === 'scenario'
					? { topicPackageId: chosenId as string }
					: {
							quick: {
								title: gameTitle(),
								mainQuestion: quickQuestion.trim(),
								...(quickExplanation.trim() ? { explanation: quickExplanation.trim() } : {}),
								language: getLang(),
							},
						}),
				deviceMode,
				identity,
				collectRealNames,
				theme: { preset: look },
				stagePlan: plans[mode()],
				...(classChoice && classChoice !== 'none' ? { classId: classChoice } : {}),
				...(flow ? { flow } : {}),
			});
			m.route.set(`/teach/session/${result.sessionId}`);
		} catch (error) {
			console.error('[Teacher] Create session failed:', error);
			createFailed = true;
			creating = false;
			m.redraw();
		}
	}

	const choice = (label: string, selected: boolean, onclick: () => void): m.Children =>
		m(
			'button.btn',
			{
				type: 'button',
				class: selected ? 'btn--primary' : 'btn--secondary',
				'aria-pressed': selected ? 'true' : 'false',
				onclick,
			},
			label,
		);

	function textField(
		label: string,
		value: string,
		placeholder: string,
		maxlength: number,
		oninput: (next: string) => void,
		options: { rows?: number; autofocus?: boolean } = {},
	): m.Children {
		return m('label.start-game__field', [
			m('span.start-game__field-label', label),
			options.rows
				? m('textarea.text-input', {
						value,
						rows: options.rows,
						maxlength,
						placeholder,
						oncreate: options.autofocus
							? ({ dom }: m.VnodeDOM) => (dom as HTMLTextAreaElement).focus()
							: undefined,
						oninput: (event: InputEvent) => oninput((event.target as HTMLTextAreaElement).value),
					})
				: m('input.text-input[type=text]', {
						value,
						maxlength,
						placeholder,
						oninput: (event: InputEvent) => oninput((event.target as HTMLInputElement).value),
					}),
		]);
	}

	/** One row of the "what are we playing" list */
	function scenarioRow(topic: AgoraTopicPackage): m.Children {
		const chosen = chosenId === topic.topicPackageId;

		return m(
			'li.scenario-row',
			{ key: topic.topicPackageId, class: chosen ? 'scenario-row--chosen' : undefined },
			m(
				'button.scenario-row__use',
				{
					type: 'button',
					role: 'radio',
					'aria-checked': chosen ? 'true' : 'false',
					onclick: () => {
						chosenId = topic.topicPackageId;
					},
				},
				[
					m('span.scenario-row__tile', m(Icon, { name: chosen ? 'check' : 'tunnel', size: 22 })),
					m('span.scenario-row__text', [
						m('span.scenario-row__title', topic.title),
						m('span.scenario-row__meta', m('span.scenario-row__status', t('editor.ready'))),
					]),
				],
			),
		);
	}

	function ownQuestionRow(): m.Children {
		const chosen = chosenId === OWN_QUESTION;

		return m(
			'li.scenario-row.scenario-row--own',
			{ key: OWN_QUESTION, class: chosen ? 'scenario-row--chosen' : undefined },
			m(
				'button.scenario-row__use',
				{
					type: 'button',
					role: 'radio',
					'aria-checked': chosen ? 'true' : 'false',
					onclick: () => {
						chosenId = OWN_QUESTION;
					},
				},
				[
					m('span.scenario-row__tile', m(Icon, { name: chosen ? 'check' : 'new', size: 22 })),
					m('span.scenario-row__text', [
						m('span.scenario-row__title', t('startGame.mode_quick')),
						m(
							'span.scenario-row__meta',
							m('span.scenario-row__sub', t('startGame.mode_quick_hint')),
						),
					]),
				],
			),
		);
	}

	/** The question, and — behind "more" — the name and the explanation */
	function ownQuestionFields(): m.Children {
		return m(
			Collapsible,
			m('.stack.start-game__own', [
				textField(
					t('startGame.quick_question'),
					quickQuestion,
					t('startGame.quick_question_ph'),
					AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
					(next) => {
						quickQuestion = next;
					},
					{ rows: 2, autofocus: true },
				),
				m(
					'button.btn.btn--ghost.btn--sm.start-game__more',
					{
						type: 'button',
						'aria-expanded': String(moreOpen),
						onclick: () => {
							moreOpen = !moreOpen;
						},
					},
					t('startGame.more'),
				),
				moreOpen
					? m(
							Collapsible,
							m('.stack', [
								textField(
									t('startGame.quick_title'),
									quickTitle,
									t('startGame.quick_title_ph'),
									AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
									(next) => {
										quickTitle = next;
									},
								),
								textField(
									t('startGame.quick_explanation'),
									quickExplanation,
									t('startGame.quick_explanation_ph'),
									AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
									(next) => {
										quickExplanation = next;
									},
									{ rows: 3 },
								),
							]),
						)
					: null,
			]),
		);
	}

	function classChip(
		label: string,
		on: boolean,
		onclick: () => void,
		modifier?: 'new' | 'none',
	): m.Children {
		return m(
			'button.start-game__class-chip',
			{
				type: 'button',
				role: 'radio',
				'aria-checked': on ? 'true' : 'false',
				class: [
					on ? 'start-game__class-chip--on' : '',
					modifier ? `start-game__class-chip--${modifier}` : '',
				]
					.join(' ')
					.trim(),
				onclick,
			},
			[on ? m(Icon, { name: 'check', size: 16 }) : null, m('span', label)],
		);
	}

	function classLine(): m.Children {
		return m('.stack', [
			m('p.teacher__section-title', t('startGame.for_class')),
			m('.start-game__class-row', { role: 'radiogroup', 'aria-label': t('startGame.for_class') }, [
				...classes.map((agoraClass) =>
					classChip(classLabel(agoraClass), classChoice === agoraClass.classId, () => {
						classChoice = agoraClass.classId;
						newClassOpen = false;
					}),
				),
				// A teacher attached to a school opens a class right here; one
				// the admin has not attached yet is told what to ask for.
				schools.length > 0
					? classChip(
							`＋ ${t('startGame.new_class')}`,
							newClassOpen,
							() => {
								newClassOpen = !newClassOpen;
							},
							'new',
						)
					: null,
				classChip(
					t('startGame.guest_game'),
					classChoice === 'none' && !newClassOpen,
					() => {
						classChoice = 'none';
						newClassOpen = false;
					},
					'none',
				),
			]),
			newClassOpen
				? m(
						Collapsible,
						m(ClassForm, {
							schools,
							submitLabel: t('classForm.create'),
							busyLabel: t('classForm.creating'),
							busy: creatingClass,
							error: newClassError,
							onSubmit: (value) => void createClass(value),
							onCancel: () => {
								newClassOpen = false;
							},
						}),
					)
				: null,
			schools.length === 0 && classes.length === 0
				? m('p.home-explanation.home-explanation--start', t('startGame.no_school_hint'))
				: classChoice === null
					? m('p.home-explanation.home-explanation--start', t('startGame.pick_class_hint'))
					: null,
		]);
	}

	/** What the advanced settings currently say, in one muted line */
	function summaryLine(): m.Children {
		const parts = [
			t('startGame.summary_steps', { n: countedSteps(plans[mode()]).length }),
			t(identity === 'named' ? 'startGame.identity_named' : 'startGame.identity_pseudonym'),
			t(
				deviceMode === AgoraDeviceMode.team
					? 'startGame.summary_team'
					: 'startGame.summary_individual',
			),
		];

		return m('p.start-game__summary', [
			`${parts.join(' · ')} — `,
			m(
				'button.start-game__change',
				{
					type: 'button',
					onclick: () => {
						advancedOpen = true;
						window.setTimeout(() => {
							const card = document.querySelector<HTMLElement>('.start-game__advanced');
							const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
							card?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
							card?.querySelector<HTMLElement>('.start-game__advanced-summary')?.focus();
						}, 0);
					},
				},
				t('startGame.change'),
			),
		]);
	}

	function advancedCard(): m.Children {
		const current = mode();

		return m('.card.start-game__advanced', [
			m(
				'button.start-game__advanced-summary',
				{
					type: 'button',
					'aria-expanded': String(advancedOpen),
					'aria-controls': 'start-game-advanced',
					onclick: () => {
						advancedOpen = !advancedOpen;
					},
				},
				[
					m(Icon, { name: 'cog', size: 20 }),
					m('span.start-game__advanced-label', t('startGame.advanced')),
					m(
						'span.start-game__advanced-chevron',
						{ class: advancedOpen ? 'start-game__advanced-chevron--open' : undefined },
						m(Icon, { name: 'arrow', size: 16 }),
					),
				],
			),
			m('p.start-game__advanced-hint', t('startGame.advanced_hint')),
			advancedOpen
				? m(
						Collapsible,
						m('#start-game-advanced.stack', { style: { gap: 'var(--space-lg)' } }, [
							// The steps
							m('.stack', [
								m('p.teacher__section-title', t('startGame.plan_title')),
								m(StagePlanEditor, {
									items: plans[current],
									hasCharacters: current === 'scenario',
									frozenCount: 0,
									showPresets: true,
									onChange: (items) => {
										plans = { ...plans, [current]: items };
									},
								}),
								m('p.home-explanation.home-explanation--start', t('startGame.plan_hint')),
							]),

							// Who people are to each other
							m('.stack', [
								m('p.teacher__section-title', t('startGame.identity')),
								m('.teacher__mode-row', [
									choice(t('startGame.identity_pseudonym'), identity === 'pseudonym', () => {
										identity = 'pseudonym';
									}),
									choice(t('startGame.identity_named'), identity === 'named', () => {
										identity = 'named';
									}),
								]),
								m(
									'p.home-explanation.home-explanation--start',
									t(
										identity === 'named'
											? 'startGame.identity_named_hint'
											: 'startGame.identity_hint',
									),
								),
								// The teacher's own list: who is behind each pseudonym. Never on a
								// card, never to a classmate — see lib/flows/joinName.
								m('label.voting-settings__row', [
									m('input[type=checkbox]', {
										checked: collectRealNames,
										onchange: (event: Event) => {
											collectRealNames = (event.target as HTMLInputElement).checked;
										},
									}),
									m('span', t('startGame.collect_names')),
								]),
								m('p.home-explanation.home-explanation--start', t('startGame.collect_names_hint')),
							]),

							// How the class holds the game
							m('.stack', [
								m('p.teacher__section-title', t('teacher.device_mode')),
								m('.teacher__mode-row', [
									choice(t('teacher.individual'), deviceMode === AgoraDeviceMode.individual, () => {
										deviceMode = AgoraDeviceMode.individual;
									}),
									choice(t('teacher.team'), deviceMode === AgoraDeviceMode.team, () => {
										deviceMode = AgoraDeviceMode.team;
									}),
								]),
							]),

							// The room's colours — the default; each student may still pick
							// their own, or build one, and the class list grows from that
							m('.stack.teacher-look', [
								m('p.teacher__section-title', t('startGame.look')),
								m(
									'.teacher__mode-row',
									AGORA_THEME_PRESETS.map((preset) =>
										m(
											'button.btn',
											{
												key: preset,
												type: 'button',
												class: look === preset ? 'btn--primary' : 'btn--secondary',
												'aria-pressed': look === preset ? 'true' : 'false',
												onclick: () => {
													look = preset;
												},
											},
											[lookDots(PRESET_SEEDS[preset]), ' ', t(`look.${preset}`)],
										),
									),
								),
								m('p.home-explanation.home-explanation--start', t('startGame.look_hint')),
							]),

							// How many rounds the discussion runs
							m('.stack', [
								m('.start-game__knob', [
									m('span.start-game__knob-label', t('startGame.knob_rounds')),
									m('.start-game__stepper', [
										m(
											'button.btn.btn--sm.btn--secondary',
											{
												type: 'button',
												disabled: rounds <= 1,
												onclick: () => {
													rounds -= 1;
												},
											},
											'−',
										),
										m('span.start-game__stepper-value', String(rounds)),
										m(
											'button.btn.btn--sm.btn--secondary',
											{
												type: 'button',
												disabled: rounds >= defaults.rounds,
												onclick: () => {
													rounds += 1;
												},
											},
											'+',
										),
									]),
								]),
								m('p.home-explanation.home-explanation--start', t('startGame.knobs_hint')),
							]),
						]),
					)
				: null,
		]);
	}

	void load();

	return {
		view() {
			const { tier, loading, user } = getUserState();
			if (user && !refilling && loadedForUid !== null && loadedForUid !== user.uid) {
				refilling = true;
				void load().finally(() => {
					refilling = false;
				});
			}
			if (loading || !loaded) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2) {
				m.route.set('/teach');

				return null;
			}

			return m('.shell', [
				m(TeacherNav, {
					title: t('startGame.title'),
					// Back to the class this game is being opened for, when the
					// dashboard sent us here holding one
					onBack: () => {
						const fromClass = m.route.param('classId');
						m.route.set(fromClass ? `/teach/class/${fromClass}` : '/teach');
					},
				}),
				m('.shell__content.start-game__form', [
					m('p.home-explanation.home-explanation--start', t('startGame.form_hint')),

					// 1. What are we playing?
					m('.stack', [
						m('p.teacher__section-title', t('startGame.what')),
						m('ul.scenario-list', { role: 'radiogroup', 'aria-label': t('startGame.what') }, [
							...topics.map(scenarioRow),
							ownQuestionRow(),
						]),
						chosenId === OWN_QUESTION ? ownQuestionFields() : null,
					]),

					// 2. Which class?
					classLine(),

					isVillageMode(window.location.search) ? advancedCard() : null,

					// 3. The button
					createFailed ? m('p.join__error', t('common.error')) : null,
					m(
						'button.btn.btn--primary.btn--full.btn--lg.start-game__go',
						{ type: 'button', disabled: !canCreate(), onclick: () => void handleCreate() },
						creating ? t('teacher.creating') : t('teacher.create'),
					),
					summaryLine(),

					!isVillageMode(window.location.search) ? advancedCard() : null,
				]),
			]);
		},
	};
}
