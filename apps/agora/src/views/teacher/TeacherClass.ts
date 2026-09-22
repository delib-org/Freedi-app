import m from 'mithril';
import { IndicatorGrid } from '../../components/IndicatorGrid';
import { classContextFrom, studentContextFrom } from '../../lib/indicatorContexts';
import { getLang, t } from '../../lib/i18n';
import { getUserState, ensureUser } from '../../lib/user';
import { teacherRoster, teacherClass } from '../../lib/callables';
import { classLabel, fetchTeacherClass, type TeacherClassDetail } from '../../lib/teacher';
import { Icon } from '../../components/Icon';
import { ClassForm, type ClassFormValue } from '../../components/ClassForm';
import { advancementSummary, type TeacherConsoleMember } from '@freedi/shared-types';
import { TeacherNav } from '../../components/TeacherNav';
import { navClass } from '../../lib/teacherNav';

/** Stats the summary card prints itself — the graphs card must not repeat them */
const CLASS_STATS_IN_SUMMARY = ['class.lessons', 'class.avgScore', 'class.successRate'];
/** Numbers the career drawer's own cells already show */
const STUDENT_STATS_IN_DRAWER = ['student.points', 'student.avgPerGame', 'student.bestGame'];
const GRAPHS_ID = 'roster-graphs';

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
	/** The cog: the roster is the page, the class's own settings wait behind it */
	let settingsOpen = false;
	let graphsOpen = false;
	let renaming = false;
	let savingClass = false;
	let classError: string | null = null;
	/** Archive asks twice — the second press is the one that counts */
	let archiveArmed = false;
	let coTeacherEmail = '';
	let addingTeacher = false;
	let teacherError: string | null = null;
	let removingUid: string | null = null;
	let codeCopied = false;

	function copyClassCode(code: string): void {
		void navigator.clipboard?.writeText(code).then(() => {
			codeCopied = true;
			m.redraw();
			window.setTimeout(() => {
				codeCopied = false;
				m.redraw();
			}, 1600);
		});
	}

	async function rename(value: ClassFormValue): Promise<void> {
		if (savingClass) return;
		savingClass = true;
		classError = null;
		m.redraw();
		try {
			await teacherClass({
				classId,
				action: 'rename',
				name: value.name,
				...(value.gradeLevel !== undefined ? { gradeLevel: value.gradeLevel } : {}),
			});
			detail = await fetchTeacherClass(classId);
			renaming = false;
		} catch (error) {
			console.error('[Teacher] Renaming the class failed:', error);
			classError = t('classForm.error');
		}
		savingClass = false;
		m.redraw();
	}

	async function archive(): Promise<void> {
		if (savingClass) return;
		if (!archiveArmed) {
			archiveArmed = true;

			return;
		}
		savingClass = true;
		classError = null;
		m.redraw();
		try {
			await teacherClass({ classId, action: 'archive' });
			m.route.set('/teach');

			return;
		} catch (error) {
			console.error('[Teacher] Archiving the class failed:', error);
			classError = t('classForm.error');
		}
		savingClass = false;
		archiveArmed = false;
		m.redraw();
	}

	async function addTeacher(): Promise<void> {
		const email = coTeacherEmail.trim().toLowerCase();
		if (addingTeacher || !email) return;
		addingTeacher = true;
		teacherError = null;
		m.redraw();
		try {
			await teacherClass({ classId, action: 'addTeacher', teacherEmail: email });
			detail = await fetchTeacherClass(classId);
			coTeacherEmail = '';
		} catch (error) {
			console.error('[Teacher] Adding a co-teacher failed:', error);
			teacherError = t('classForm.error_no_account');
		}
		addingTeacher = false;
		m.redraw();
	}

	async function removeTeacher(teacherUid: string): Promise<void> {
		if (removingUid) return;
		removingUid = teacherUid;
		teacherError = null;
		m.redraw();
		try {
			await teacherClass({ classId, action: 'removeTeacher', teacherUid });
			detail = await fetchTeacherClass(classId);
		} catch (error) {
			console.error('[Teacher] Removing a co-teacher failed:', error);
			teacherError = t('classForm.error');
		}
		removingUid = null;
		m.redraw();
	}

	/** Behind the cog: rename, the teachers, archive */
	function settingsPanel(current: TeacherClassDetail): m.Children {
		const lastTeacher = current.teachers.length <= 1;

		return m('.card.stack.teacher-settings', [
			m('.class-progress__head', [
				m('p.teacher__section-title', t('roster.settings')),
				m(
					'button.btn.btn--sm.btn--ghost',
					{
						type: 'button',
						onclick: () => {
							settingsOpen = false;
							renaming = false;
							archiveArmed = false;
						},
					},
					t('teacher.settings_close'),
				),
			]),

			m('.stack.teacher-settings__section', [
				m('p.teacher-settings__label', t('roster.rename')),
				renaming
					? m(ClassForm, {
							initial: { gradeLevel: current.gradeLevel, name: current.name },
							submitLabel: t('classForm.save'),
							busyLabel: t('teacher.creating'),
							busy: savingClass,
							error: classError,
							onSubmit: (value) => void rename(value),
							onCancel: () => {
								renaming = false;
							},
						})
					: m('.teacher__mode-row', [
							m('span.roster__setting-value', classLabel(current)),
							m(
								'button.btn.btn--sm.btn--secondary',
								{
									type: 'button',
									onclick: () => {
										renaming = true;
									},
								},
								t('roster.rename'),
							),
						]),
			]),

			m('.stack.teacher-settings__section', [
				m('p.teacher-settings__label', t('roster.teachers')),
				m(
					'ul.roster__teachers',
					{ role: 'list' },
					current.teachers.map((teacher) =>
						m('li.roster__teacher', { key: teacher.uid }, [
							m('span', teacher.name),
							m(
								'button.btn.btn--sm.btn--ghost',
								{
									type: 'button',
									disabled: lastTeacher || removingUid !== null,
									title: lastTeacher ? t('roster.last_teacher') : undefined,
									onclick: () => void removeTeacher(teacher.uid),
								},
								t('roster.remove_teacher'),
							),
						]),
					),
				),
				m(
					'form.roster__add-teacher',
					{
						onsubmit: (event: Event) => {
							event.preventDefault();
							void addTeacher();
						},
					},
					[
						m('input.plan-editor__text[type=email]', {
							value: coTeacherEmail,
							placeholder: t('roster.teacher_email'),
							'aria-label': t('roster.teacher_email'),
							disabled: addingTeacher,
							oninput: (event: InputEvent) => {
								coTeacherEmail = (event.target as HTMLInputElement).value;
							},
						}),
						m(
							'button.btn.btn--secondary',
							{ type: 'submit', disabled: addingTeacher || !coTeacherEmail.trim() },
							addingTeacher ? t('teacher.creating') : t('roster.add_teacher'),
						),
					],
				),
				teacherError ? m('p.join__error', teacherError) : null,
			]),

			m('.stack.teacher-settings__section', [
				m('p.teacher-settings__label', t('roster.archive')),
				m('p.home-explanation', t('roster.archive_confirm')),
				m('.teacher__mode-row', [
					m(
						'button.btn.btn--sm',
						{
							type: 'button',
							class: archiveArmed ? 'btn--primary' : 'btn--secondary',
							disabled: savingClass,
							onclick: () => void archive(),
						},
						archiveArmed ? t('roster.archive_now') : t('roster.archive'),
					),
					archiveArmed
						? m(
								'button.btn.btn--sm.btn--ghost',
								{
									type: 'button',
									onclick: () => {
										archiveArmed = false;
									},
								},
								t('common.cancel'),
							)
						: null,
				]),
				classError && !renaming ? m('p.join__error', classError) : null,
			]),
		]);
	}

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
									// The three numbers under it are printed by the cells below;
									// the grid adds the sparkline, the mix and the attendance.
									m(IndicatorGrid<'student'>, {
										scope: 'student',
										context: studentContextFrom(career, detail?.aggregate?.gamesPlayed ?? 0),
										options: { hide: STUDENT_STATS_IN_DRAWER },
										compact: true,
									}),
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
															new Date(game.playedAt).toLocaleDateString(getLang(), {
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
			/**
			 * The teacher's menu passed this way already and remembers the name
			 * and the code — the two things a teacher opening a class actually
			 * wants on screen, one to read and one to write on the board. Held
			 * back for the console's answer, they arrived with the roster; shown
			 * from the cache, the page is never blank, and only the roster waits.
			 */
			const cached = navClass(classId);
			const known = detail ?? cached;
			if (loading || (!loaded && !known)) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (tier !== 2 || !known || (loaded && !detail)) {
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

			const summary = detail?.aggregate ? advancementSummary(detail.aggregate) : null;
			const members = detail?.members ?? [];
			const sessions = detail?.sessions ?? [];
			const classCode = known.classCode;

			return m('.shell', [
				// The bar says which class this is, so the page no longer repeats it —
				// and the class's own cog rides along on the bar, where the chrome
				// of every teacher screen now lives.
				m(TeacherNav, {
					title: classLabel(known),
					subtitle: detail?.schoolName ?? '',
					onBack: () => m.route.set('/teach'),
					trailing: m(
						'button.teacher-nav__cog',
						{
							type: 'button',
							// The cog opens the class's own settings, and those are
							// the console's answer — no point offering it early
							disabled: !detail,
							'aria-expanded': String(settingsOpen),
							'aria-label': t('roster.settings'),
							title: t('roster.settings'),
							class: settingsOpen ? 'teacher-nav__cog--on' : undefined,
							onclick: () => {
								settingsOpen = !settingsOpen;
							},
						},
						m(Icon, { name: 'cog', size: 20 }),
					),
				}),
				m('.shell__content', { style: { gap: 'var(--space-xl)' } }, [
					// The door: what the code is for, the code itself, and a copy button —
					// the old caption had the digits and no verb
					m('.card.roster__code-card', [
						m(
							'p.home-explanation.home-explanation--start',
							t('roster.class_code', { code: '' }).trim(),
						),
						m('.roster__code-row', [
							m('.teacher__code', classCode),
							m(
								'button.btn.btn--secondary.btn--sm',
								{ type: 'button', onclick: () => copyClassCode(classCode) },
								t(codeCopied ? 'roster.code_copied' : 'roster.copy_code'),
							),
						]),
					]),
					settingsOpen && detail ? settingsPanel(detail) : null,

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

					// The summary card already says lessons, score and success rate;
					// the graphs behind this button are the rest of the class dashboard.
					detail
						? m(
								'button.btn.btn--ghost.roster__graphs-toggle',
								{
									type: 'button',
									'aria-expanded': String(graphsOpen),
									'aria-controls': GRAPHS_ID,
									onclick: () => {
										graphsOpen = !graphsOpen;
									},
								},
								[
									m(Icon, { name: 'chart', size: 20 }),
									m('span', t(graphsOpen ? 'roster.graphs_hide' : 'roster.graphs')),
								],
							)
						: null,
					graphsOpen && detail
						? m(
								'.card.roster__graphs',
								{ id: GRAPHS_ID },
								m(IndicatorGrid<'class'>, {
									scope: 'class',
									context: classContextFrom(detail),
									options: { hide: CLASS_STATS_IN_SUMMARY },
								}),
							)
						: null,
					m(
						'button.btn.btn--primary.btn--full.btn--lg',
						{ onclick: () => m.route.set(`/teach/start?classId=${classId}`) },
						t('roster.start_with_class'),
					),

					m('.stack', [
						m(
							'p.teacher__section-title',
							t('roster.title', {
								count: String(detail ? members.length : (cached?.memberCount ?? 0)),
							}),
						),
						// An empty roster and a roster that has not arrived yet are
						// different sentences — "nobody has joined" must not be the
						// page's answer while it is still asking
						!detail
							? m('.spinner')
							: members.length === 0
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
													new Date(session.createdAt).toLocaleDateString(getLang(), {
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
