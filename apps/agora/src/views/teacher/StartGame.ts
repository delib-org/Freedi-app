import m from 'mithril';
import { getLang, t } from '../../lib/i18n';
import { getUserState, ensureUser } from '../../lib/user';
import { createSession } from '../../lib/callables';
import { fetchTeacherDashboard, listTopicPackages, type TeacherDashboard } from '../../lib/teacher';
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

type GameMode = 'scenario' | 'quick';

/**
 * Start a game.
 *
 * Two ways in. A SCENARIO: pick a ready topic package and the classic lesson
 * runs through its stages. A QUICK GAME: type the question the room is
 * deciding, and there is no scenario at all — no characters, no sides, just
 * the stages the admin lines up. Either way the stage plan below is the
 * game's spine: what runs, in what order, with what rule per stage.
 */
export function StartGame(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let classes: TeacherDashboard['classes'] = [];
	let loaded = false;
	let mode: GameMode = 'scenario';
	let selectedTopicId: string | null = null;
	let selectedClassId: string | null = null;
	let deviceMode: AgoraDeviceMode = AgoraDeviceMode.individual;
	let identity: AgoraIdentityMode = 'pseudonym';
	let look: AgoraThemePreset = AGORA_DEFAULT_THEME;
	let creating = false;
	let createFailed = false;
	let showKnobs = false;

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
		scenario: stagePlanPreset('classic'),
		quick: stagePlanPreset('quickDecision'),
	};

	async function load(): Promise<void> {
		try {
			const user = await ensureUser();
			loadedForUid = user.uid;
			const [loadedTopics, dashboard] = await Promise.all([
				listTopicPackages(user.uid),
				fetchTeacherDashboard().catch((error: unknown) => {
					console.error('[Teacher] Loading classes failed:', error);

					return { classes: [], aggregates: new Map(), sessions: [] } as TeacherDashboard;
				}),
			]);
			topics = loadedTopics.filter((topic) => topic.status === AgoraTopicStatus.ready);
			classes = dashboard.classes;
			const routeClass = m.route.param('classId');
			if (routeClass && classes.some((agoraClass) => agoraClass.classId === routeClass)) {
				selectedClassId = routeClass;
			}
			if (topics.length === 1) selectedTopicId = topics[0].topicPackageId;
			// Arrived by tapping a scenario on the shelf: that choice IS the
			// answer to the first question on this screen, so hold it. A link to
			// a scenario that is no longer ready falls back to the picker rather
			// than starting a game the teacher did not choose.
			const routeTopic = m.route.param('topic');
			const carried = routeTopic
				? (topics.find((topic) => topic.topicPackageId === routeTopic) ?? null)
				: null;
			if (carried) {
				selectedTopicId = carried.topicPackageId;
				mode = 'scenario';
			} else if (topics.length === 0 || m.route.param('mode') === 'quick') {
				// A teacher with no scenario yet is most likely here for a quick
				// game, and the dashboard's quick-game door says so explicitly
				mode = 'quick';
			}
		} catch (error) {
			console.error('[Teacher] Loading start-game data failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	/** Only the knobs that differ from the defaults travel to the server. */
	function changedFlow(): AgoraSessionFlow | undefined {
		return rounds !== defaults.rounds ? { rounds } : undefined;
	}

	function canCreate(): boolean {
		if (creating) return false;
		const plan = plans[mode];
		if (validateStagePlan(plan, { hasCharacters: mode === 'scenario' }).length > 0) return false;
		if (mode === 'scenario') return selectedTopicId !== null;

		return quickTitle.trim().length > 0 && quickQuestion.trim().length > 0;
	}

	async function handleCreate(): Promise<void> {
		if (!canCreate()) return;
		creating = true;
		createFailed = false;
		m.redraw();
		try {
			const flow = changedFlow();
			const result = await createSession({
				...(mode === 'scenario'
					? { topicPackageId: selectedTopicId as string }
					: {
							quick: {
								title: quickTitle.trim(),
								mainQuestion: quickQuestion.trim(),
								...(quickExplanation.trim() ? { explanation: quickExplanation.trim() } : {}),
								language: getLang(),
							},
						}),
				deviceMode,
				identity,
				theme: { preset: look },
				stagePlan: plans[mode],
				...(selectedClassId ? { classId: selectedClassId } : {}),
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

	const choice = (
		label: string,
		selected: boolean,
		onclick: () => void,
		extraClass?: string,
	): m.Children =>
		m(
			'button.btn',
			{
				type: 'button',
				class: [selected ? 'btn--primary' : 'btn--secondary', extraClass ?? ''].join(' ').trim(),
				onclick,
			},
			label,
		);

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
				m('.home-header', [
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('common.back')),
				]),
				m('.shell__content', { style: { gap: 'var(--space-xl)' } }, [
					m('h2', t('startGame.title')),

					// Scenario or quick game
					m('.stack', [
						m('.teacher__mode-row', [
							choice(t('startGame.mode_scenario'), mode === 'scenario', () => {
								mode = 'scenario';
							}),
							choice(t('startGame.mode_quick'), mode === 'quick', () => {
								mode = 'quick';
							}),
						]),
						m(
							'p.home-explanation',
							t(mode === 'scenario' ? 'startGame.mode_scenario_hint' : 'startGame.mode_quick_hint'),
						),
					]),

					mode === 'scenario'
						? m('.stack', [
								m('p.teacher__section-title', t('teacher.choose_topic')),
								topics.length === 0
									? m('.stack', [
											m('p.home-explanation', t('teacher.no_topics')),
											m(
												'button.btn.btn--primary.btn--full',
												{ onclick: () => m.route.set('/teach/new') },
												t('teacher.create_topic'),
											),
										])
									: m(
											'.stack',
											topics.map((topic) =>
												m(
													'.teacher__topic-option',
													{
														key: topic.topicPackageId,
														class:
															selectedTopicId === topic.topicPackageId
																? 'teacher__topic-option--selected'
																: undefined,
														onclick: () => {
															selectedTopicId = topic.topicPackageId;
														},
														role: 'button',
														tabindex: 0,
													},
													m('strong', topic.title),
												),
											),
										),
							])
						: m('.stack.start-game__quick', [
								m('label.plan-editor__field', [
									m('span.teacher__section-title', t('startGame.quick_title')),
									m('input.plan-editor__text[type=text]', {
										value: quickTitle,
										maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
										placeholder: t('startGame.quick_title_ph'),
										oninput: (event: InputEvent) => {
											quickTitle = (event.target as HTMLInputElement).value;
										},
									}),
								]),
								m('label.plan-editor__field', [
									m('span.teacher__section-title', t('startGame.quick_question')),
									m('input.plan-editor__text[type=text]', {
										value: quickQuestion,
										maxlength: AGORA_STAGE_PLAN.MAX_TITLE_LENGTH,
										placeholder: t('startGame.quick_question_ph'),
										oninput: (event: InputEvent) => {
											quickQuestion = (event.target as HTMLInputElement).value;
										},
									}),
								]),
								m('label.plan-editor__field', [
									m('span.teacher__section-title', t('startGame.quick_explanation')),
									m('textarea.plan-editor__textarea', {
										value: quickExplanation,
										rows: 3,
										maxlength: AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH,
										placeholder: t('startGame.quick_explanation_ph'),
										oninput: (event: InputEvent) => {
											quickExplanation = (event.target as HTMLTextAreaElement).value;
										},
									}),
								]),
							]),

					// The stages
					m('.stack', [
						m('p.teacher__section-title', t('startGame.plan_title')),
						m('p.home-explanation', t('startGame.plan_hint')),
						m(StagePlanEditor, {
							items: plans[mode],
							hasCharacters: mode === 'scenario',
							frozenCount: 0,
							showPresets: true,
							onChange: (items) => {
								plans = { ...plans, [mode]: items };
							},
						}),
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
							'p.home-explanation',
							t(identity === 'named' ? 'startGame.identity_named_hint' : 'startGame.identity_hint'),
						),
					]),

					// How the game looks — the room's default; each student may still
					// pick their own, or build one, and the class list grows from that
					m('.stack', [
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
						m('p.home-explanation', t('startGame.look_hint')),
					]),

					m('.stack', [
						m('p.teacher__section-title', t('startGame.for_class')),
						m('.start-game__class-row', [
							choice(t('startGame.guest_game'), selectedClassId === null, () => {
								selectedClassId = null;
							}),
							// No keys here: the guest button shares this fragment, and Mithril
							// refuses fragments that mix keyed and unkeyed vnodes.
							...classes.map((agoraClass) =>
								choice(agoraClass.name, selectedClassId === agoraClass.classId, () => {
									selectedClassId = agoraClass.classId;
								}),
							),
						]),
						selectedClassId ? m('p.home-explanation', t('startGame.class_hint')) : null,
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

					m('.stack', [
						m(
							'button.btn.btn--ghost',
							{ onclick: () => (showKnobs = !showKnobs) },
							showKnobs ? t('startGame.hide_knobs') : t('startGame.show_knobs'),
						),
						showKnobs
							? m('.card.stack.start-game__knobs', [
									m('p.home-explanation', t('startGame.knobs_hint')),
									m('.start-game__knob', [
										m('span.start-game__knob-label', t('startGame.knob_rounds')),
										m('.start-game__stepper', [
											m(
												'button.btn.btn--sm.btn--secondary',
												{
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
													disabled: rounds >= defaults.rounds,
													onclick: () => {
														rounds += 1;
													},
												},
												'+',
											),
										]),
									]),
								])
							: null,
					]),

					createFailed ? m('p.join__error', t('common.error')) : null,
					m(
						'button.btn.btn--primary.btn--full.btn--lg',
						{ disabled: !canCreate(), onclick: () => void handleCreate() },
						creating ? t('teacher.creating') : t('teacher.create'),
					),
				]),
			]);
		},
	};
}
