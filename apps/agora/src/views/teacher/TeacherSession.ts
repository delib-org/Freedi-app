import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	getStagePlan,
	getCurrentPlanIndex,
} from '../../lib/session';
import { advanceStage, updateStagePlan } from '../../lib/callables';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../../lib/proposals';
import { Results } from '../Results';
import { TeacherInstructions } from './TeacherInstructions';
import { StagePlanEditor } from './StagePlanEditor';
import { planItemLabel } from '../../components/StageNav';
import { rankedAnswers } from '../QuestionStage';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { CountdownTimer } from '../../components/CountdownTimer';
import { QRShare } from '../../components/QRShare';
import {
	AgoraParticipant,
	AgoraStage,
	AgoraStagePlanItem,
	AgoraSession,
	VotingStageSettings,
	AGORA_VOTING,
	CutoffBy,
	ResultsBy,
	evaluateVotingTrigger,
	resolveQuestionSelection,
	selectCarriedAnswers,
} from '@freedi/shared-types';
import { AgoraProposal } from '../../lib/proposals';
import { setVotingSettings } from '../../lib/teacher';
import { getVotingState, listenToVoting, stopVotingListeners, totalVotes } from '../../lib/voting';

/**
 * Teacher live panel — projector-friendly: the stage rail, class progress,
 * stage instructions, the per-stage panel (answers, the auto-vote rule, the
 * ballot), join code + QR, and the one button that opens the next stage.
 *
 * Which stage is next comes from the session's resolved plan — the same
 * array the advance callable walks — so the button offered is always one the
 * server will open.
 */

/** Stages where students move through self-paced sub-steps the teacher can't see on the projector */
const PROGRESS_STAGES = new Set<AgoraStage>([
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.question,
	AgoraStage.deliberation,
	AgoraStage.voting,
]);

/** One student's progress within the current stage: done flag + a compact label */
function participantProgress(
	participant: AgoraParticipant,
	item: AgoraStagePlanItem,
	proposals: readonly AgoraProposal[],
	answers: readonly AgoraProposal[],
	voterUids: ReadonlySet<string>,
): { done: boolean; label: m.Children } {
	const stage = item.stage;
	const check = m(Icon, { name: 'check', size: 16 });
	if (stage === AgoraStage.voting) {
		const done = voterUids.has(participant.userId);

		return { done, label: done ? check : '—' };
	}
	if (stage === AgoraStage.positioning) {
		const done = participant.campPosition !== undefined;

		return { done, label: done ? check : '—' };
	}
	if (stage === AgoraStage.deliberation) {
		const done = proposals.some((proposal) => proposal.creatorId === participant.userId);

		return { done, label: done ? check : '—' };
	}
	if (stage === AgoraStage.question) {
		const done = answers.some((answer) => answer.creatorId === participant.userId);

		return { done, label: done ? check : '—' };
	}
	const progress = participant.stageProgress;
	// Progress from an earlier stage says nothing about this one
	if (!progress || progress.stage !== stage) return { done: false, label: '—' };
	const done = progress.scenesDone >= progress.scenesTotal;

	return {
		done,
		label: done ? check : `${progress.scenesDone}/${progress.scenesTotal}`,
	};
}

/** Who finished the current stage's self-paced steps — the "can I advance?" card */
function classProgressCard(
	item: AgoraStagePlanItem,
	participants: readonly AgoraParticipant[],
	proposals: readonly AgoraProposal[],
	answers: readonly AgoraProposal[],
	voterUids: ReadonlySet<string>,
): m.Children {
	if (!PROGRESS_STAGES.has(item.stage) || participants.length === 0) return null;
	const entries = participants.map((participant) => ({
		participant,
		...participantProgress(participant, item, proposals, answers, voterUids),
	}));
	const doneCount = entries.filter((entry) => entry.done).length;
	const countKey =
		item.stage === AgoraStage.positioning
			? 'teacher.positioned_count'
			: item.stage === AgoraStage.voting
				? 'teacher.voted_count'
				: item.stage === AgoraStage.question
					? 'teacher.answered_count'
					: 'teacher.finished_count';

	return m('.card.class-progress', [
		m('.class-progress__head', [
			m('p.teacher__section-title', t('teacher.class_progress')),
			m(
				'span.class-progress__count',
				{ class: doneCount === entries.length ? 'class-progress__count--all' : undefined },
				t(countKey, { n: doneCount, total: entries.length }),
			),
		]),
		m(
			'.class-progress__chips',
			entries.map((entry) =>
				m(
					'span.class-progress__chip',
					{
						key: entry.participant.participantId,
						class: entry.done ? 'class-progress__chip--done' : undefined,
					},
					[
						m('span.class-progress__name', entry.participant.anonName),
						m('span.class-progress__state', entry.label),
					],
				),
			),
		),
	]);
}

/**
 * How the vote will run, set while the class is still deliberating.
 *
 * Defaults are live even when the teacher never opens this card: an untouched
 * session votes on the top three by consensus, and the most-voted proposal
 * wins outright. Every control here only narrows that. A session with an
 * explicit plan owns its voting item outright, so the on/off switch is not
 * offered there — remove the stage from the plan instead.
 */
function votingSettingsCard(
	settings: VotingStageSettings | undefined,
	saving: boolean,
	planOwnsVoting: boolean,
	onSave: (next: VotingStageSettings) => void,
): m.Children {
	const selection = settings?.selection;
	const enabled = planOwnsVoting || settings?.enabled !== false;
	const byThreshold = selection?.cutoffBy === CutoffBy.aboveThreshold;
	const topX = selection?.numberOfResults ?? AGORA_VOTING.DEFAULT_TOP_X;
	const cutoff = selection?.cutoffNumber ?? AGORA_VOTING.DEFAULT_CUTOFF_CP;
	const winThreshold = settings?.winningConsensusThreshold;

	const base = (): VotingStageSettings => ({
		...(planOwnsVoting ? {} : { enabled }),
		selection: {
			resultsBy: ResultsBy.consensus,
			cutoffBy: byThreshold ? CutoffBy.aboveThreshold : CutoffBy.topOptions,
			numberOfResults: topX,
			cutoffNumber: cutoff,
		},
		...(winThreshold !== undefined ? { winningConsensusThreshold: winThreshold } : {}),
	});
	const patch = (next: Partial<VotingStageSettings>): void => onSave({ ...base(), ...next });

	return m('.card.stack.voting-settings', [
		m('p.teacher__section-title', t('teacher.voting_settings')),

		planOwnsVoting
			? null
			: m('label.voting-settings__row', [
					m('input[type=checkbox]', {
						checked: enabled,
						disabled: saving,
						onchange: (event: Event) =>
							patch({ enabled: (event.target as HTMLInputElement).checked }),
					}),
					m('span', t('teacher.voting_enabled')),
				]),

		enabled
			? [
					m('p.voting-settings__hint', t('teacher.voting_manual_hint')),
					m('label.voting-settings__row', [
						m('span', t('teacher.voting_mode')),
						m(
							'select',
							{
								disabled: saving,
								onchange: (event: Event) =>
									patch({
										selection: {
											resultsBy: ResultsBy.consensus,
											cutoffBy:
												(event.target as HTMLSelectElement).value === 'threshold'
													? CutoffBy.aboveThreshold
													: CutoffBy.topOptions,
											numberOfResults: topX,
											cutoffNumber: cutoff,
										},
									}),
							},
							[
								m('option', { value: 'top', selected: !byThreshold }, t('teacher.voting_mode_top')),
								m(
									'option',
									{ value: 'threshold', selected: byThreshold },
									t('teacher.voting_mode_threshold'),
								),
							],
						),
					]),

					byThreshold
						? m('label.voting-settings__row', [
								m('span', t('teacher.voting_threshold')),
								m('input[type=number]', {
									value: cutoff,
									step: '0.05',
									min: '-1',
									max: '1',
									disabled: saving,
									onchange: (event: Event) =>
										patch({
											selection: {
												resultsBy: ResultsBy.consensus,
												cutoffBy: CutoffBy.aboveThreshold,
												numberOfResults: topX,
												cutoffNumber: Number((event.target as HTMLInputElement).value),
											},
										}),
								}),
							])
						: m('label.voting-settings__row', [
								m('span', t('teacher.voting_top_x')),
								m('input[type=number]', {
									value: topX,
									min: String(AGORA_VOTING.MIN_TOP_X),
									max: String(AGORA_VOTING.MAX_TOP_X),
									disabled: saving,
									onchange: (event: Event) =>
										patch({
											selection: {
												resultsBy: ResultsBy.consensus,
												cutoffBy: CutoffBy.topOptions,
												numberOfResults: Number((event.target as HTMLInputElement).value),
												cutoffNumber: cutoff,
											},
										}),
								}),
							]),

					// Blank means "the most-voted proposal wins, full stop"
					m('label.voting-settings__row', [
						m('span', t('teacher.voting_win_threshold')),
						m('input[type=number]', {
							value: winThreshold ?? '',
							step: '0.01',
							min: '-1',
							max: '1',
							placeholder: '—',
							disabled: saving,
							onchange: (event: Event) => {
								const raw = (event.target as HTMLInputElement).value;
								const rest = base();
								delete rest.winningConsensusThreshold;
								onSave(raw === '' ? rest : { ...rest, winningConsensusThreshold: Number(raw) });
							},
						}),
					]),
					m('p.voting-settings__hint', t('teacher.voting_win_threshold_hint')),
				]
			: null,
	]);
}

/** Net agreement as printed on the teacher's lists */
function formatMean(mean: number): string {
	const rounded = Math.round(mean * 10) / 10;

	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

/**
 * The live answers of the question the room is on, ranked by net agreement,
 * with the ones that would travel forward marked — the same arithmetic the
 * server closes the stage with.
 */
function questionPanel(
	session: AgoraSession,
	item: AgoraStagePlanItem,
	answers: readonly AgoraProposal[],
): m.Children {
	const named = session.identity === 'named';
	const ranked = rankedAnswers(answers, named);
	const carried = new Set(
		selectCarriedAnswers(ranked, resolveQuestionSelection(item)).map((row) => row.statementId),
	);
	const outcome = session.stageState?.[item.itemId]?.outcome;

	return m('.card.stack.teacher-answers', [
		m('.class-progress__head', [
			m('p.teacher__section-title', t('teacher.answers_title')),
			m('span.class-progress__count', String(ranked.length)),
		]),
		outcome?.summary ? m('p.question__summary', outcome.summary) : null,
		ranked.length === 0
			? m('p.home-explanation', t('question.waiting_for_answers'))
			: m(
					'ol.teacher-answers__list',
					ranked.map((row) =>
						m(
							'li.teacher-answers__row',
							{
								key: row.statementId,
								class: carried.has(row.statementId) ? 'teacher-answers__row--carried' : undefined,
							},
							[
								m('.teacher-answers__head', [
									row.anonName ? m('span.question__who', row.anonName) : null,
									m(
										'span.question__agreement',
										row.raters > 0
											? t('question.net_agreement', { value: formatMean(row.mean), n: row.raters })
											: t('results.agreement_unrated'),
									),
									carried.has(row.statementId)
										? m('span.teacher-answers__carried', t('teacher.will_carry'))
										: null,
								]),
								m('p.teacher-answers__text', row.statement),
							],
						),
					),
				),
		m('p.voting-settings__hint', t('teacher.answers_hint')),
	]);
}

/** The auto-open-voting rule as it stands right now, from the live scores */
function triggerLine(item: AgoraStagePlanItem, hasVotingNext: boolean): m.Children {
	const rule = item.votingTrigger;
	if (!rule?.enabled || !hasVotingNext)
		return m('p.voting-settings__hint', t('teacher.trigger_off'));
	const rows = Object.values(getDeliberationState().scores).map((score) => ({
		statementId: score.statementId,
		mean: score.classConsensus?.mean ?? 0,
		n: score.classConsensus?.n ?? 0,
	}));
	const verdict = evaluateVotingTrigger(rows, rule);
	if (verdict.fired) {
		return m('p.teacher-trigger.teacher-trigger--ready', t('teacher.trigger_ready'));
	}

	return m(
		'p.teacher-trigger',
		t('teacher.trigger_waiting', {
			single: rule.singleMin.toFixed(2),
			pair: rule.pairMin.toFixed(2),
			best: verdict.best === null ? '—' : formatMean(verdict.best),
			min: rule.minRaters,
		}),
	);
}

export function TeacherSession(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let advancing = false;
	/** The server refused (or never received) the last advance — say so on the panel */
	let advanceFailed = false;
	let savingSettings = false;
	let userId = '';
	let editingPlan: AgoraStagePlanItem[] | null = null;
	let savingPlan = false;
	let planSaveFailed = false;

	function saveVotingSettings(next: VotingStageSettings): void {
		if (savingSettings) return;
		savingSettings = true;
		setVotingSettings(sessionId, next)
			.catch((error: unknown) => {
				console.error('[Teacher] Saving the voting settings failed:', error);
			})
			.finally(() => {
				savingSettings = false;
				m.redraw();
			});
	}

	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		// Macrotask redraw — see GameController note.
		setTimeout(() => m.redraw(), 0);
	});

	function handleAdvance(toIndex: number): void {
		if (advancing) return;
		advancing = true;
		advanceFailed = false;
		advanceStage({ sessionId, toIndex })
			.then(() => {
				advanceFailed = false;
			})
			.catch((error: unknown) => {
				// A rejection swallowed into the console leaves the teacher
				// pressing a button that does nothing — the panel must say it.
				advanceFailed = true;
				console.error('[Teacher] Advance stage failed:', error);
			})
			.finally(() => {
				advancing = false;
				m.redraw();
			});
	}

	function savePlan(): void {
		if (!editingPlan || savingPlan) return;
		savingPlan = true;
		planSaveFailed = false;
		updateStagePlan({ sessionId, stagePlan: editingPlan })
			.then(() => {
				editingPlan = null;
			})
			.catch((error: unknown) => {
				planSaveFailed = true;
				console.error('[Teacher] Saving the stage plan failed:', error);
			})
			.finally(() => {
				savingPlan = false;
				m.redraw();
			});
	}

	/** The visible line under the advance button when the server said no */
	function advanceErrorLine(): m.Children {
		return advanceFailed ? m('p.join__error', t('teacher.advance_failed')) : null;
	}

	return {
		onremove() {
			stopListening();
			stopDeliberationListeners();
			stopVotingListeners();
		},

		view() {
			// Re-attach on every render (idempotent) — see GameController note.
			if (userId) listenToSession(sessionId, userId);

			const { session, participants, loading, error } = getSessionState();

			if (loading || (!session && !error)) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			if (error || !session) {
				return m(
					'.shell',
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('common.error')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set('/teach') },
							t('common.back'),
						),
					]),
				);
			}

			const joinUrl = `${window.location.origin}/join/${session.code}`;
			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();
			const current = plan[currentIndex];
			const next = plan[currentIndex + 1] ?? null;
			const nextIndex = currentIndex + 1;
			const planOwnsVoting = Boolean(session.stagePlan && session.stagePlan.length > 0);
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);
			const hasCharacters = topic ? topic.kind !== 'quick' : true;

			const inDeliberation = current.stage === AgoraStage.deliberation;
			const inQuestion = current.stage === AgoraStage.question;
			// The results recap projects the same board and journeys, and they all
			// read from the deliberation listeners — a teacher who opens (or
			// refreshes) at results must not project an empty square. The question
			// panel reads answers off the same listener.
			const needsDeliberationData =
				inDeliberation ||
				inQuestion ||
				current.stage === AgoraStage.results ||
				current.stage === AgoraStage.ended;
			if (needsDeliberationData && userId) listenToDeliberation(sessionId, userId);
			const { proposals, answersByQuestion } = getDeliberationState();
			const answers =
				inQuestion && current.statementId ? (answersByQuestion[current.statementId] ?? []) : [];

			const inVoting = current.stage === AgoraStage.voting;
			if (inVoting && userId) listenToVoting(sessionId, session.challengeQuestionId, userId);
			const { voterUids } = getVotingState();

			const advanceButton = (primary: boolean): m.Children =>
				next
					? m(
							primary ? 'button.btn.btn--primary.btn--lg' : 'button.btn.btn--secondary.btn--full',
							{
								disabled: (primary && participants.length === 0) || advancing,
								onclick: () => handleAdvance(nextIndex),
							},
							current.stage === AgoraStage.lobby
								? t('teacher.start_journey')
								: next.stage === AgoraStage.ended
									? t('teacher.end_game')
									: t('teacher.open_next', { stage: planItemLabel(next) }),
						)
					: null;

			// The stage rail: every item, the current one lit, the closed ones ticked
			const planRail = m('.card.stack.teacher-plan', [
				m('.class-progress__head', [
					m('p.teacher__section-title', t('teacher.plan_title')),
					next && next.stage !== AgoraStage.ended && !editingPlan
						? m(
								'button.btn.btn--sm.btn--ghost',
								{
									onclick: () => {
										editingPlan = plan
											.filter((item) => item.stage !== AgoraStage.ended)
											.map((item) => ({ ...item }));
									},
								},
								t('teacher.edit_plan'),
							)
						: null,
				]),
				editingPlan
					? m('.stack', [
							m(StagePlanEditor, {
								items: editingPlan,
								hasCharacters,
								frozenCount: currentIndex + 1,
								onChange: (items) => {
									editingPlan = items;
								},
							}),
							planSaveFailed ? m('p.join__error', t('teacher.plan_save_failed')) : null,
							m('.teacher__mode-row', [
								m(
									'button.btn.btn--primary',
									{ disabled: savingPlan, onclick: savePlan },
									savingPlan ? t('teacher.creating') : t('teacher.save_plan'),
								),
								m(
									'button.btn.btn--secondary',
									{
										disabled: savingPlan,
										onclick: () => {
											editingPlan = null;
											planSaveFailed = false;
										},
									},
									t('teacher.cancel_plan'),
								),
							]),
						])
					: m(
							'ol.teacher-plan__list',
							plan
								.filter((item) => item.stage !== AgoraStage.ended)
								.map((item, index) =>
									m(
										'li.teacher-plan__item',
										{
											key: item.itemId,
											class:
												index < currentIndex
													? 'teacher-plan__item--done'
													: index === currentIndex
														? 'teacher-plan__item--current'
														: undefined,
											'aria-current': index === currentIndex ? 'step' : undefined,
										},
										[
											m(
												'span.teacher-plan__mark',
												index < currentIndex
													? m(Icon, { name: 'check', size: 14 })
													: String(index + 1),
											),
											m('span.teacher-plan__label', planItemLabel(item)),
											item.stage === AgoraStage.voting && session.stageState?.[item.itemId]?.trigger
												? m(
														'span.teacher-plan__note',
														t(`teacher.trigger_fired_${session.stageState[item.itemId].trigger}`),
													)
												: null,
										],
									),
								),
						),
			]);

			// Results/ended: the teacher projects the same transformed map + score
			if (current.stage === AgoraStage.results || current.stage === AgoraStage.ended) {
				if (!topic) {
					return m(
						'.shell',
						m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
					);
				}

				return m('.shell.shell--wide', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						m(Results, { session, topic }),
						advanceErrorLine(),
						advanceButton(false),
					]),
				]);
			}

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					planRail,

					classProgressCard(current, participants, proposals, answers, voterUids),

					topic
						? m(TeacherInstructions, {
								stage: current.stage,
								topic,
								questionTitle: current.title,
								questionExplanation: current.explanation,
							})
						: null,

					inQuestion ? questionPanel(session, current, answers) : null,

					// Set while the class still deliberates — by the time the ballot
					// is drawn up the settings have already been read.
					inDeliberation && (next?.stage === AgoraStage.voting || !planOwnsVoting)
						? votingSettingsCard(
								session.votingSettings,
								savingSettings,
								planOwnsVoting,
								saveVotingSettings,
							)
						: null,

					inVoting
						? m('.card.stack', [
								m('p.teacher__section-title', t('voting.title')),
								m(
									'span.values__score',
									`${t('teacher.votes_cast')}: ${totalVotes()}/${participants.length}`,
								),
							])
						: null,

					// Students cycle propose→rate→help on their own; the teacher's
					// deliberation panel shows progress and the auto-vote rule's state
					inDeliberation
						? m('.card.stack', [
								m('.delib__header', [
									session.roundEndsAt ? m(CountdownTimer, { endsAt: session.roundEndsAt }) : null,
									m('span.values__score', `${t('teacher.proposals_count')}: ${proposals.length}`),
								]),
								triggerLine(current, next?.stage === AgoraStage.voting),
							])
						: null,

					m('.card.teacher__code-panel', [
						// The join code stays on the board through EVERY stage, so a
						// latecomer can always join mid-lesson
						m('p.teacher__section-title', t('teacher.session_code')),
						m('.teacher__code', session.code),
						current.stage === AgoraStage.lobby
							? [m(QRShare, { url: joinUrl }), m('p.lobby__status', t('teacher.scan_to_join'))]
							: [
									m('p.teacher__section-title', t('teacher.current_stage')),
									m('h3', planItemLabel(current)),
								],
						m('.text-center', [
							m('span.lobby__count', String(participants.length)),
							m('p.lobby__status', ` ${t('teacher.participants')}`),
						]),
						advanceErrorLine(),
						advanceButton(true) ?? m('p.lobby__status', planItemLabel(current)),
					]),
				]),
			]);
		},
	};
}
