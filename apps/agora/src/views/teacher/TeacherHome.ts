import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { getUserState, signInWithGoogle, ensureUser } from '../../lib/user';
import {
	fetchTeacherDashboard,
	listTopicPackages,
	patchTopicPackage,
	saveTopicPackage,
	type TeacherDashboard,
} from '../../lib/teacher';
import {
	AgoraClassAggregate,
	AgoraSession,
	AgoraSessionStatus,
	AgoraTopicPackage,
	AgoraTopicStatus,
	advancementSummary,
} from '@freedi/shared-types';
import { buildDefaultFrenchRevolutionTopic, backfillDefaultArtwork } from '../../lib/defaultTopic';
import { LanguagePicker } from '../../components/LanguagePicker';

/**
 * The teacher's dashboard: my classes (with advancement), my games (live ones
 * to run, finished ones to report on), and the scenario library. Starting a
 * game moved to its own screen (/teach/start) — this page is for seeing where
 * every class stands.
 */
export function TeacherHome(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let classes: TeacherDashboard['classes'] = [];
	let sessions: AgoraSession[] = [];
	let aggregates = new Map<string, AgoraClassAggregate>();
	let loaded = false;

	async function provisionDefaultTopic(creatorId: string): Promise<AgoraTopicPackage | null> {
		try {
			const defaultTopic = buildDefaultFrenchRevolutionTopic(creatorId);
			await saveTopicPackage(defaultTopic);

			return defaultTopic;
		} catch (error) {
			console.error('[Teacher] Provisioning default topic failed:', error);

			return null;
		}
	}

	/**
	 * Heal packages provisioned before the bundled artwork existed. Runs
	 * fire-and-forget so it never blocks the dashboard from rendering.
	 */
	async function healArtwork(pkg: AgoraTopicPackage): Promise<AgoraTopicPackage> {
		const patch = backfillDefaultArtwork(pkg);
		if (!patch) return pkg;
		const patched = { ...pkg, ...patch, lastUpdate: Date.now() };
		try {
			await patchTopicPackage(pkg.topicPackageId, patch);
		} catch (error) {
			console.error('[Teacher] Backfilling default artwork failed:', error);

			return pkg;
		}

		return patched;
	}

	async function load(): Promise<void> {
		try {
			const user = await ensureUser();

			let loadedTopics = await listTopicPackages(user.uid);
			loadedTopics = await Promise.all(loadedTopics.map((pkg) => healArtwork(pkg)));
			if (loadedTopics.length === 0 && !user.isAnonymous) {
				const defaultTopic = await provisionDefaultTopic(user.uid);
				if (defaultTopic) loadedTopics.push(defaultTopic);
			}
			topics = loadedTopics;

			// One round trip for classes, aggregates and recent games — fails
			// soft: a console hiccup must not blank the scenario library. Not
			// asked at all before the Google sign-in: the console refuses an
			// anonymous caller, and the refusal read as an error on a page that
			// was simply still waiting for the teacher to sign in.
			try {
				if (user.isAnonymous) throw new Error('anonymous');
				const dashboard = await fetchTeacherDashboard();
				classes = dashboard.classes;
				sessions = dashboard.sessions;
				aggregates = dashboard.aggregates;
			} catch (error) {
				if (!(error instanceof Error && error.message === 'anonymous')) {
					console.error('[Teacher] Loading dashboard data failed:', error);
				}
			}
		} catch (error) {
			console.error('[Teacher] Loading dashboard failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	function sessionRow(session: AgoraSession): m.Children {
		// A scored session is finished even while its status is still open —
		// the sweep flips status hours later, and "Live" over a final score
		// reads as a lie.
		const live =
			session.classScore === undefined &&
			(session.status === AgoraSessionStatus.open || session.status === AgoraSessionStatus.live);
		const className = session.classId
			? (classes.find((agoraClass) => agoraClass.classId === session.classId)?.name ??
				t('dashboard.class_gone'))
			: t('startGame.guest_game');
		const target = live
			? `/teach/session/${session.sessionId}`
			: `/teach/report/${session.sessionId}`;

		return m(
			'.dashboard__game-row',
			{
				key: session.sessionId,
				onclick: () => m.route.set(target),
				role: 'button',
				tabindex: 0,
			},
			[
				m('.dashboard__game-main', [
					m('strong', className),
					m(
						'span.dashboard__game-date',
						new Date(session.createdAt).toLocaleDateString(undefined, {
							day: 'numeric',
							month: 'short',
						}),
					),
				]),
				m('.dashboard__game-side', [
					session.classScore
						? m('span.dashboard__game-score', String(session.classScore.total))
						: null,
					m(
						'span.dashboard__status-pill',
						{ class: live ? 'dashboard__status-pill--live' : undefined },
						t(live ? 'dashboard.game_live' : 'dashboard.game_done'),
					),
				]),
			],
		);
	}

	function classCard(agoraClass: TeacherDashboard['classes'][number]): m.Children {
		const aggregate = aggregates.get(agoraClass.classId);
		const summary = aggregate ? advancementSummary(aggregate) : null;

		return m(
			'.dashboard__class-card',
			{
				key: agoraClass.classId,
				onclick: () => m.route.set(`/teach/class/${agoraClass.classId}`),
				role: 'button',
				tabindex: 0,
			},
			[
				m('strong.dashboard__class-name', agoraClass.name),
				m(
					'span.dashboard__class-meta',
					t('dashboard.members', { count: String(agoraClass.memberCount) }),
				),
				summary
					? m('.dashboard__class-stats', [
							m(
								'span.dashboard__class-stat',
								t('dashboard.games_played', { count: String(summary.gamesPlayed) }),
							),
							summary.avgClassScore !== null
								? m(
										'span.dashboard__class-stat',
										t('dashboard.avg_score', { score: String(summary.avgClassScore) }),
									)
								: null,
						])
					: m('span.dashboard__class-meta', t('dashboard.no_games_yet')),
			],
		);
	}

	void load();

	return {
		view() {
			const { tier, loading, signInError } = getUserState();

			if (loading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			if (tier !== 2) {
				return m('.shell', [
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[
							m('h2', t('teacher.title')),
							m('p.home-explanation', t('teacher.sign_in_required')),
							signInError
								? m(
										'p.join__error',
										t(
											signInError === 'popup-blocked'
												? 'teacher.sign_in_popup_blocked'
												: 'teacher.sign_in_failed',
										),
									)
								: null,
							m(
								'button.btn.btn--primary',
								{
									onclick: () => {
										signInWithGoogle()
											.then(() => {
												loaded = false;
												void load();
											})
											.catch((error: unknown) => {
												console.error('[Teacher] Sign-in failed:', error);
											});
									},
								},
								t('home.sign_in'),
							),
							m('button.btn.btn--ghost', { onclick: () => m.route.set('/') }, t('common.back')),
						],
					),
				]);
			}

			return m('.shell', [
				m('.home-header', [
					m(LanguagePicker),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/') }, t('common.back')),
				]),

				m('.shell__content', { style: { gap: 'var(--space-xl)' } }, [
					m('h2', t('teacher.title')),

					m(
						'button.btn.btn--primary.btn--full.btn--lg',
						{ onclick: () => m.route.set('/teach/start') },
						t('dashboard.start_game'),
					),

					!loaded
						? m('.spinner')
						: [
								classes.length > 0
									? m('.stack', [
											m('p.teacher__section-title', t('dashboard.my_classes')),
											m('.dashboard__class-grid', classes.map(classCard)),
										])
									: null,

								sessions.length > 0
									? m('.stack', [
											m('p.teacher__section-title', t('dashboard.my_games')),
											m('.stack', sessions.map(sessionRow)),
										])
									: null,

								m('.stack', [
									m('p.teacher__section-title', t('dashboard.scenarios')),
									topics.length === 0
										? m('p.home-explanation', t('teacher.no_topics'))
										: m(
												'.stack',
												topics.map((topic) =>
													m(
														'.teacher__topic-option',
														{
															key: topic.topicPackageId,
															onclick: () => m.route.set(`/teach/topic/${topic.topicPackageId}`),
															role: 'button',
															tabindex: 0,
														},
														[
															m('strong', topic.title),
															m('.editor__row', [
																m(
																	'span.values__score',
																	topic.status === AgoraTopicStatus.ready
																		? t('editor.ready')
																		: t('editor.draft'),
																),
																m(Icon, { name: 'edit', size: 16 }),
															]),
														],
													),
												),
											),
									m(
										'button.btn.btn--secondary.btn--full',
										{ onclick: () => m.route.set('/teach/new') },
										t('teacher.create_topic'),
									),
								]),
							],
				]),
			]);
		},
	};
}
