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
import { QuestionSheet, type QuestionDraft } from './QuestionSheet';
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
	resolveSessionFlow,
	stagePlanPreset,
	topicStagePlan,
	validateStagePlan,
} from '@freedi/shared-types';
import { TeacherNav } from '../../components/TeacherNav';
import { countedSteps } from '../../lib/teacherSteps';

type GameMode = 'scenario' | 'quick';
type AdvancedGroup = 'steps' | 'students' | 'look';

/** The scenario list's last row: no scenario, the teacher's own question */
const OWN_QUESTION = '__own__';
/** How much of the question becomes the game's name when none was typed */
const NAME_FROM_QUESTION = 40;
/** The route: the sheet is open while this query param is set */
const ROUTE = '/teach/start';
const QUESTION_PARAM = 'question';

const EMPTY_DRAFT: QuestionDraft = { question: '', title: '', explanation: '' };

/**
 * Start a lesson — a three-line form.
 *
 * What are we playing (a scenario, or the teacher's own question), which
 * class, and the button. That is the whole of a first lesson; the rest —
 * the steps, the students, the look — is already set to the usual game and
 * waits, folded, under "advanced settings", where a teacher on their tenth
 * lesson will find it.
 *
 * The teacher's own question is written on its own sheet (`?question=1`):
 * a full screen on a phone, a dialog on a laptop. It used to be a form
 * wedged between the scenario list and the class chips, with the stage plan
 * open under it; the one required field on this path was the least
 * anchored thing on the page.
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
	let world: 'village' | 'classic' = 'village';
	let villageNavigation: 'teacher' | 'free' = 'teacher';
	let advancedOpen = false;
	const groupOpen: Record<AdvancedGroup, boolean> = { steps: false, students: false, look: false };

	// Auth settles in two beats — anonymous first, the teacher's Google account
	// a moment later. Reading the library on the first beat left this screen
	// with no scenarios to offer, which silently forced quick mode.
	let loadedForUid: string | null = null;
	let refilling = false;

	/** The teacher's own question. Memory only — nothing is saved until the lesson opens. */
	let quick: QuestionDraft = EMPTY_DRAFT;
	/** The sheet was pushed onto history by this screen, so closing it is a step back */
	let pushedQuestion = false;
	/** Arriving with ?mode=quick opens the sheet once, not on every redraw */
	let autoOpened = false;
	/** After the sheet closes, focus goes back to the row that opened it */
	let focusRowAfterClose = false;

	const defaults = resolveSessionFlow({ sessionMode: AgoraSessionMode.classroom });
	let rounds = defaults.rounds;

	let plans: Record<string, AgoraStagePlanItem[]> = {
		scenario: stagePlanPreset('scenarioWizcol'),
		quick: stagePlanPreset('wizcol'),
	};

	function mode(): GameMode {
		return chosenId === OWN_QUESTION ? 'quick' : 'scenario';
	}

	function planKey(): string {
		return mode() === 'quick' ? 'quick' : (chosenId ?? 'scenario');
	}

	function questionOpen(): boolean {
		return m.route.param(QUESTION_PARAM) === '1';
	}

	/** The route's query, without the sheet's own flag */
	function routeParams(): Record<string, string> {
		const params: Record<string, string> = { ...m.route.param() };
		delete params[QUESTION_PARAM];

		return params;
	}

	/**
	 * Open the sheet by setting the flag on the same route. Pushed when the
	 * teacher tapped the row (so the phone's back closes it); replaced when
	 * the dashboard sent us straight here (so back leaves to the dashboard,
	 * never to a sheet-less copy of this screen).
	 */
	function openQuestion(options: { replace: boolean }): void {
		chosenId = OWN_QUESTION;
		pushedQuestion = !options.replace;
		m.route.set(ROUTE, { ...routeParams(), [QUESTION_PARAM]: '1' }, { replace: options.replace });
	}

	/** Close and keep the draft. The row that opened the sheet takes the focus back. */
	function closeQuestion(): void {
		focusRowAfterClose = true;
		if (pushedQuestion) {
			pushedQuestion = false;
			window.history.back();

			return;
		}
		m.route.set(ROUTE, routeParams(), { replace: true });
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
			for (const topic of topics) {
				plans[topic.topicPackageId] ??= topicStagePlan();
			}
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
				// The dashboard's "my own question" row means "write the question":
				// land on the sheet, not on a picker that already has the answer
				if (!autoOpened && !questionOpen() && !quick.question.trim()) {
					autoOpened = true;
					openQuestion({ replace: true });
				}
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

	/** The game's name: the start of the question, unless one was typed */
	function derivedTitle(): string {
		const question = quick.question.trim();

		return question.length > NAME_FROM_QUESTION
			? `${question.slice(0, NAME_FROM_QUESTION).trimEnd()}…`
			: question;
	}

	function gameTitle(): string {
		return quick.title.trim() || derivedTitle();
	}

	function canCreate(): boolean {
		if (creating || chosenId === null || classChoice === null) return false;
		const plan = plans[planKey()];
		if (validateStagePlan(plan, { hasCharacters: mode() === 'scenario' }).length > 0) return false;
		if (mode() === 'quick') return quick.question.trim().length > 0;

		return true;
	}

	async function handleCreate(): Promise<void> {
		if (!canCreate()) return;
		creating = true;
		createFailed = false;
		m.redraw();
		try {
			const flow = changedFlow();
			const explanation = quick.explanation.trim();
			const result = await createSession({
				...(mode() === 'scenario'
					? { topicPackageId: chosenId as string }
					: {
							quick: {
								title: gameTitle(),
								mainQuestion: quick.question.trim(),
								...(explanation ? { explanation } : {}),
								language: getLang(),
							},
						}),
				deviceMode,
				identity,
				collectRealNames,
				theme: { preset: look },
				world,
				...(world === 'village' ? { villageNavigation } : {}),
				stagePlan: plans[planKey()],
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

	/**
	 * The teacher's own question, in three states: not chosen; chosen and
	 * still blank ("write the question"); chosen and written, showing the
	 * question as the row's title. Tapping the row opens the sheet either
	 * way; the pencil is the same door for a mouse or a screen reader.
	 */
	function ownQuestionRow(): m.Children {
		const chosen = chosenId === OWN_QUESTION;
		const question = quick.question.trim();
		const written = question.length > 0;
		const name = quick.title.trim();

		return m(
			'li.scenario-row.scenario-row--own',
			{
				key: OWN_QUESTION,
				class: [
					chosen ? 'scenario-row--chosen' : '',
					chosen && !written ? 'scenario-row--question-empty' : '',
					written ? 'scenario-row--question-set' : '',
				]
					.join(' ')
					.trim(),
			},
			[
				m(
					'button.scenario-row__use',
					{
						type: 'button',
						role: 'radio',
						'aria-checked': chosen ? 'true' : 'false',
						onclick: () => openQuestion({ replace: false }),
					},
					[
						m('span.scenario-row__tile', m(Icon, { name: chosen ? 'check' : 'new', size: 22 })),
						m('span.scenario-row__text', [
							// AT hears "my own question: <the question>"; the eye sees the question
							written
								? [
										m('span.sr-only', `${t('startGame.mode_quick')}: `),
										m('span.scenario-row__title.scenario-row__title--question', question),
									]
								: m('span.scenario-row__title', t('startGame.mode_quick')),
							m(
								'span.scenario-row__meta',
								written
									? name
										? m('span.scenario-row__sub', t('startGame.question_name_line', { name }))
										: null
									: chosen
										? m(
												'span.scenario-row__sub.scenario-row__sub--write',
												t('startGame.question_write'),
											)
										: m('span.scenario-row__sub', t('startGame.mode_quick_hint')),
							),
						]),
					],
				),
				chosen
					? m(
							'button.scenario-row__edit',
							{
								type: 'button',
								'aria-label': t('startGame.question_edit'),
								title: t('startGame.question_edit'),
								onclick: () => openQuestion({ replace: false }),
							},
							m(Icon, { name: 'edit', size: 20 }),
						)
					: null,
			],
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

	// --- the advanced fold: three groups, each with a one-line summary ---

	function stepsSummary(): string {
		return t('startGame.summary_steps', { n: countedSteps(plans[planKey()]).length });
	}

	function studentsSummary(): string {
		return [
			t(identity === 'named' ? 'startGame.identity_named' : 'startGame.identity_pseudonym'),
			t(
				deviceMode === AgoraDeviceMode.team
					? 'startGame.summary_team'
					: 'startGame.summary_individual',
			),
		].join(' · ');
	}

	function lookSummary(): string {
		return [
			t(
				world === 'village' ? 'startGame.summary_world_village' : 'startGame.summary_world_classic',
			),
			t(`look.${look}`),
		].join(' · ');
	}

	/** A quiet disclosure row inside the advanced card */
	function group(
		key: AdvancedGroup,
		title: string,
		summary: string,
		body: () => m.Children,
	): m.Children {
		const open = groupOpen[key];
		const bodyId = `start-game-group-${key}`;

		return m('.start-game__group', [
			m(
				'button.start-game__group-head',
				{
					type: 'button',
					'aria-expanded': String(open),
					'aria-controls': bodyId,
					onclick: () => {
						groupOpen[key] = !open;
					},
				},
				[
					m('span.start-game__group-text', [
						m('span.start-game__group-title', title),
						m('span.start-game__group-meta', summary),
					]),
					m(
						'span.start-game__group-chevron',
						{ class: open ? 'start-game__group-chevron--open' : undefined, 'aria-hidden': 'true' },
						m(Icon, { name: 'arrow', size: 16 }),
					),
				],
			),
			open ? m(Collapsible, m('.start-game__group-body.stack', { id: bodyId }, body())) : null,
		]);
	}

	/** How the lesson runs: the steps, and how many rounds the discussion takes */
	function stepsGroup(): m.Children {
		return group('steps', t('startGame.plan_title'), stepsSummary(), () => [
			m(StagePlanEditor, {
				items: plans[planKey()],
				hasCharacters: mode() === 'scenario',
				frozenCount: 0,
				showPresets: true,
				onChange: (items) => {
					plans = { ...plans, [planKey()]: items };
				},
			}),
			m('p.home-explanation.home-explanation--start', t('startGame.plan_hint')),
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
		]);
	}

	/** Who the students are to each other, and how they hold the game */
	function studentsGroup(): m.Children {
		return group('students', t('startGame.group_students'), studentsSummary(), () => [
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
					t(identity === 'named' ? 'startGame.identity_named_hint' : 'startGame.identity_hint'),
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
		]);
	}

	/** What the students see: the world, who moves them through it, the colours */
	function lookGroup(): m.Children {
		return group('look', t('startGame.group_look'), lookSummary(), () => [
			m('.stack', [
				m('p.teacher__section-title', t('startGame.world_title')),
				m('.teacher__mode-row', { role: 'group', 'aria-label': t('startGame.world_title') }, [
					choice(t('startGame.world_village'), world === 'village', () => {
						world = 'village';
					}),
					choice(t('startGame.world_classic'), world === 'classic', () => {
						world = 'classic';
					}),
				]),
				m('p.home-explanation.home-explanation--start', t('startGame.world_hint')),
			]),
			world === 'village'
				? m('.stack.village-nav', [
						m('p.teacher__section-title', t('village.nav_title')),
						m('.teacher__mode-row', { role: 'group', 'aria-label': t('village.nav_title') }, [
							choice(t('village.nav_teacher'), villageNavigation === 'teacher', () => {
								villageNavigation = 'teacher';
							}),
							choice(t('village.nav_free'), villageNavigation === 'free', () => {
								villageNavigation = 'free';
							}),
						]),
						m(
							'p.home-explanation.home-explanation--start',
							t(
								villageNavigation === 'free' ? 'village.nav_free_hint' : 'village.nav_teacher_hint',
							),
						),
					])
				: null,
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
		]);
	}

	function advancedCard(): m.Children {
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
					m('span.start-game__advanced-text', [
						m('span.start-game__advanced-label', t('startGame.advanced')),
						// What the defaults add up to, so nobody opens the fold to find out
						m(
							'span.start-game__advanced-meta',
							[stepsSummary(), studentsSummary(), lookSummary()].join(' · '),
						),
					]),
					m(
						'span.start-game__advanced-chevron',
						{ class: advancedOpen ? 'start-game__advanced-chevron--open' : undefined },
						m(Icon, { name: 'arrow', size: 16 }),
					),
				],
			),
			advancedOpen
				? m(
						Collapsible,
						m('#start-game-advanced.start-game__groups', [
							m('p.start-game__advanced-hint', t('startGame.advanced_hint')),
							stepsGroup(),
							studentsGroup(),
							lookGroup(),
						]),
					)
				: null,
		]);
	}

	void load();

	return {
		onupdate() {
			if (!focusRowAfterClose || questionOpen()) return;
			focusRowAfterClose = false;
			const row =
				document.querySelector<HTMLElement>('.scenario-row--own .scenario-row__edit') ??
				document.querySelector<HTMLElement>('.scenario-row--own .scenario-row__use');
			row?.focus();
		},

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
			// The phone's back button closes the sheet without passing through closeQuestion
			if (!questionOpen()) pushedQuestion = false;

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
					]),

					// 2. Which class?
					classLine(),

					// Everything already set, folded — and always above the button
					advancedCard(),

					// 3. The button
					createFailed ? m('p.join__error', t('common.error')) : null,
					m(
						'button.btn.btn--primary.btn--full.btn--lg.start-game__go',
						{ type: 'button', disabled: !canCreate(), onclick: () => void handleCreate() },
						creating ? t('teacher.creating') : t('teacher.create'),
					),
				]),

				questionOpen()
					? m(QuestionSheet, {
							draft: quick,
							derivedTitle: derivedTitle(),
							onChange: (next) => {
								quick = next;
							},
							onContinue: closeQuestion,
							onClose: closeQuestion,
						})
					: null,
			]);
		},
	};
}
