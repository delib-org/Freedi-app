import m from 'mithril';
import { t } from '../../lib/i18n';
import { getUserState, ensureUser } from '../../lib/user';
import { teacherRoster } from '../../lib/callables';
import { fetchTeacherClass, type TeacherClassDetail } from '../../lib/teacher';
import { advancementSummary, type TeacherConsoleMember } from '@freedi/shared-types';

/**
 * One class: its advancement across games, its roster with each student's
 * career, and the roster actions (rename, remove, reset a lost device
 * binding). Careers are read from the server-materialized aggregate docs —
 * this screen derives nothing.
 */
export function TeacherClass(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const classId = initialVnode.attrs.id;
	let detail: TeacherClassDetail | null = null;
	let loaded = false;
	let openMemberId: string | null = null;
	/** A fresh PIN from a reset, shown once next to the member row */
	let issuedPin: { memberId: string; pin: string } | null = null;
	let busyMemberId: string | null = null;

	async function load(): Promise<void> {
		try {
			await ensureUser();
			detail = await fetchTeacherClass(classId);
		} catch (error) {
			console.error('[Teacher] Loading class failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	async function resetBinding(memberId: string): Promise<void> {
		if (busyMemberId) return;
		busyMemberId = memberId;
		m.redraw();
		try {
			const result = await teacherRoster({ classId, action: 'resetBinding', memberId });
			if (result.pin) issuedPin = { memberId, pin: result.pin };
		} catch (error) {
			console.error('[Teacher] Reset binding failed:', error);
		}
		busyMemberId = null;
		m.redraw();
	}

	async function removeMember(memberId: string): Promise<void> {
		if (busyMemberId) return;
		busyMemberId = memberId;
		m.redraw();
		try {
			await teacherRoster({ classId, action: 'removeMember', memberId });
			if (detail) {
				detail.members = detail.members.filter((member) => member.memberId !== memberId);
			}
		} catch (error) {
			console.error('[Teacher] Remove member failed:', error);
		}
		busyMemberId = null;
		m.redraw();
	}

	function memberRow(member: TeacherConsoleMember): m.Children {
		const career = detail?.careers.get(member.memberId);
		const open = openMemberId === member.memberId;

		return m('.roster__row-wrap', { key: member.memberId }, [
			m(
				'.roster__row',
				{
					onclick: () => {
						openMemberId = open ? null : member.memberId;
					},
					role: 'button',
					tabindex: 0,
					class: open ? 'roster__row--open' : undefined,
				},
				[
					m('strong.roster__alias', member.alias),
					m('.roster__row-stats', [
						m('span.roster__stat', t('roster.games', { count: String(career?.gamesPlayed ?? 0) })),
						m(
							'span.roster__stat.roster__stat--points',
							t('roster.points', { points: String(career?.totals.total ?? 0) }),
						),
					]),
				],
			),
			open
				? m('.roster__drawer', [
						career
							? m('.roster__career', [
									m('.roster__career-grid', [
										m('.roster__career-cell', [
											m('span.roster__career-value', String(career.avgPointsPerGame)),
											m('span.roster__career-label', t('roster.avg_per_game')),
										]),
										m('.roster__career-cell', [
											m('span.roster__career-value', String(career.bestGameTotal)),
											m('span.roster__career-label', t('roster.best_game')),
										]),
										m('.roster__career-cell', [
											m('span.roster__career-value', String(career.totals.helping ?? 0)),
											m('span.roster__career-label', t('roster.helping')),
										]),
										m('.roster__career-cell', [
											m('span.roster__career-value', String(career.totals.proposals)),
											m('span.roster__career-label', t('roster.proposals')),
										]),
									]),
									m(
										'.roster__history',
										career.perGame
											.slice()
											.reverse()
											.slice(0, 8)
											.map((game) =>
												m(
													'.roster__history-row',
													{
														key: game.sessionId,
														onclick: () => m.route.set(`/teach/report/${game.sessionId}`),
														role: 'button',
														tabindex: 0,
													},
													[
														m(
															'span',
															new Date(game.playedAt).toLocaleDateString(undefined, {
																day: 'numeric',
																month: 'short',
															}),
														),
														m('span.roster__stat--points', String(game.points.total)),
													],
												),
											),
									),
								])
							: m('p.home-explanation', t('roster.no_games')),
						issuedPin && issuedPin.memberId === member.memberId
							? m('.roster__pin-note', [
									m('span.roster__pin-value', issuedPin.pin),
									m('span.home-explanation', t('roster.pin_note')),
								])
							: null,
						m('.roster__actions', [
							m(
								'button.btn.btn--sm.btn--secondary',
								{
									disabled: busyMemberId === member.memberId,
									onclick: () => void resetBinding(member.memberId),
								},
								t('roster.reset_pin'),
							),
							m(
								'button.btn.btn--sm.btn--ghost',
								{
									disabled: busyMemberId === member.memberId,
									onclick: () => {
										if (window.confirm(t('roster.remove_confirm', { alias: member.alias }))) {
											void removeMember(member.memberId);
										}
									},
								},
								t('roster.remove'),
							),
						]),
					])
				: null,
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
			if (tier !== 2 || !detail) {
				return m('.shell', [
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('roster.not_found')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set('/teach') },
							t('common.back'),
						),
					]),
				]);
			}

			const summary = detail.aggregate ? advancementSummary(detail.aggregate) : null;
			const { members, sessions } = detail;

			return m('.shell', [
				m('.home-header', [
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('common.back')),
				]),
				m('.shell__content', { style: { gap: 'var(--space-xl)' } }, [
					m('.stack', [
						m('h2', detail.name),
						detail.schoolName ? m('p.home-explanation', detail.schoolName) : null,
						m('p.roster__class-code', t('roster.class_code', { code: detail.classCode })),
					]),

					summary
						? m('.card.roster__summary', [
								m('.roster__summary-cell', [
									m('span.roster__career-value', String(summary.gamesPlayed)),
									m('span.roster__career-label', t('dashboard.games_label')),
								]),
								m('.roster__summary-cell', [
									m(
										'span.roster__career-value',
										summary.avgClassScore !== null ? String(summary.avgClassScore) : '—',
									),
									m('span.roster__career-label', t('roster.avg_class_score')),
								]),
								m('.roster__summary-cell', [
									m(
										'span.roster__career-value',
										summary.successRate !== null
											? `${Math.round(summary.successRate * 100)}%`
											: '—',
									),
									m('span.roster__career-label', t('roster.success_rate')),
								]),
							])
						: null,

					m(
						'button.btn.btn--primary.btn--full',
						{ onclick: () => m.route.set(`/teach/start?classId=${classId}`) },
						t('dashboard.start_game'),
					),

					m('.stack', [
						m('p.teacher__section-title', t('roster.title', { count: String(members.length) })),
						members.length === 0
							? m('p.home-explanation', t('roster.empty'))
							: m('.stack', members.map(memberRow)),
					]),

					sessions.length > 0
						? m('.stack', [
								m('p.teacher__section-title', t('dashboard.my_games')),
								m(
									'.stack',
									sessions.map((session) =>
										m(
											'.dashboard__game-row',
											{
												key: session.sessionId,
												onclick: () =>
													m.route.set(
														session.classScore
															? `/teach/report/${session.sessionId}`
															: `/teach/session/${session.sessionId}`,
													),
												role: 'button',
												tabindex: 0,
											},
											[
												m(
													'span',
													new Date(session.createdAt).toLocaleDateString(undefined, {
														day: 'numeric',
														month: 'short',
													}),
												),
												session.classScore
													? m('span.dashboard__game-score', String(session.classScore.total))
													: m(
															'span.dashboard__status-pill.dashboard__status-pill--live',
															t('dashboard.game_live'),
														),
											],
										),
									),
								),
							])
						: null,
				]),
			]);
		},
	};
}
