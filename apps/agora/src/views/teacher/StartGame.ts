import m from 'mithril';
import { t } from '../../lib/i18n';
import { getUserState, ensureUser } from '../../lib/user';
import { createSession } from '../../lib/callables';
import { fetchTeacherDashboard, listTopicPackages, type TeacherDashboard } from '../../lib/teacher';
import {
	AgoraDeviceMode,
	AgoraSessionFlow,
	AgoraSessionMode,
	AgoraTopicPackage,
	AgoraTopicStatus,
	resolveSessionFlow,
} from '@freedi/shared-types';

/**
 * Start a game: pick a scenario, pick a class (or none — a guest game), pick
 * the device mode, and set which beats the lesson runs. The flow knobs are
 * the classroom counterpart of the civic organizer's script: only knobs the
 * teacher actually flips are sent, so an untouched game keeps the defaults
 * every lesson has always had.
 */
export function StartGame(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let classes: TeacherDashboard['classes'] = [];
	let loaded = false;
	let selectedTopicId: string | null = null;
	let selectedClassId: string | null = null;
	let deviceMode: AgoraDeviceMode = AgoraDeviceMode.individual;
	let creating = false;
	let showKnobs = false;

	// The defaults every classroom lesson resolves to when flow says nothing
	const defaults = resolveSessionFlow({ sessionMode: AgoraSessionMode.classroom });
	let flow: Required<Pick<AgoraSessionFlow, 'framing' | 'needs' | 'voting' | 'rounds'>> = {
		framing: defaults.framing,
		needs: defaults.needs,
		voting: defaults.voting,
		rounds: defaults.rounds,
	};

	async function load(): Promise<void> {
		try {
			const user = await ensureUser();
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
		} catch (error) {
			console.error('[Teacher] Loading start-game data failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	/** Only the knobs that differ from the defaults travel to the server. */
	function changedFlow(): AgoraSessionFlow | undefined {
		const changed: AgoraSessionFlow = {};
		if (flow.framing !== defaults.framing) changed.framing = flow.framing;
		if (flow.needs !== defaults.needs) changed.needs = flow.needs;
		if (flow.voting !== defaults.voting) changed.voting = flow.voting;
		if (flow.rounds !== defaults.rounds) changed.rounds = flow.rounds;

		return Object.keys(changed).length > 0 ? changed : undefined;
	}

	async function handleCreate(): Promise<void> {
		if (!selectedTopicId || creating) return;
		creating = true;
		m.redraw();
		try {
			const result = await createSession({
				topicPackageId: selectedTopicId,
				deviceMode,
				...(selectedClassId ? { classId: selectedClassId } : {}),
				...(changedFlow() ? { flow: changedFlow() } : {}),
			});
			m.route.set(`/teach/session/${result.sessionId}`);
		} catch (error) {
			console.error('[Teacher] Create session failed:', error);
			creating = false;
			m.redraw();
		}
	}

	function knobToggle(
		label: string,
		value: boolean,
		onchange: (next: boolean) => void,
	): m.Children {
		return m('.start-game__knob', [
			m('span.start-game__knob-label', label),
			m(
				'button.btn.btn--sm',
				{
					class: value ? 'btn--primary' : 'btn--secondary',
					onclick: () => onchange(!value),
				},
				value ? t('startGame.knob_on') : t('startGame.knob_off'),
			),
		]);
	}

	void load();

	return {
		view() {
			const { tier, loading } = getUserState();
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

					m('.stack', [
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
					]),

					m('.stack', [
						m('p.teacher__section-title', t('startGame.for_class')),
						m('.start-game__class-row', [
							m(
								'button.btn',
								{
									class: selectedClassId === null ? 'btn--primary' : 'btn--secondary',
									onclick: () => {
										selectedClassId = null;
									},
								},
								t('startGame.guest_game'),
							),
							// No keys here: the guest button shares this fragment, and Mithril
							// refuses fragments that mix keyed and unkeyed vnodes.
							...classes.map((agoraClass) =>
								m(
									'button.btn',
									{
										class:
											selectedClassId === agoraClass.classId ? 'btn--primary' : 'btn--secondary',
										onclick: () => {
											selectedClassId = agoraClass.classId;
										},
									},
									agoraClass.name,
								),
							),
						]),
						selectedClassId ? m('p.home-explanation', t('startGame.class_hint')) : null,
					]),

					m('.stack', [
						m('p.teacher__section-title', t('teacher.device_mode')),
						m('.teacher__mode-row', [
							m(
								'button.btn',
								{
									class:
										deviceMode === AgoraDeviceMode.individual ? 'btn--primary' : 'btn--secondary',
									onclick: () => {
										deviceMode = AgoraDeviceMode.individual;
									},
								},
								t('teacher.individual'),
							),
							m(
								'button.btn',
								{
									class: deviceMode === AgoraDeviceMode.team ? 'btn--primary' : 'btn--secondary',
									onclick: () => {
										deviceMode = AgoraDeviceMode.team;
									},
								},
								t('teacher.team'),
							),
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
									knobToggle(t('startGame.knob_framing'), flow.framing, (next) => {
										flow = { ...flow, framing: next };
									}),
									knobToggle(t('startGame.knob_needs'), flow.needs, (next) => {
										flow = { ...flow, needs: next };
									}),
									knobToggle(t('startGame.knob_voting'), flow.voting, (next) => {
										flow = { ...flow, voting: next };
									}),
									m('.start-game__knob', [
										m('span.start-game__knob-label', t('startGame.knob_rounds')),
										m('.start-game__stepper', [
											m(
												'button.btn.btn--sm.btn--secondary',
												{
													disabled: flow.rounds <= 1,
													onclick: () => {
														flow = { ...flow, rounds: flow.rounds - 1 };
													},
												},
												'−',
											),
											m('span.start-game__stepper-value', String(flow.rounds)),
											m(
												'button.btn.btn--sm.btn--secondary',
												{
													disabled: flow.rounds >= defaults.rounds,
													onclick: () => {
														flow = { ...flow, rounds: flow.rounds + 1 };
													},
												},
												'+',
											),
										]),
									]),
								])
							: null,
					]),

					m(
						'button.btn.btn--primary.btn--full.btn--lg',
						{ disabled: !selectedTopicId || creating, onclick: () => void handleCreate() },
						creating ? t('teacher.creating') : t('teacher.create'),
					),
				]),
			]);
		},
	};
}
