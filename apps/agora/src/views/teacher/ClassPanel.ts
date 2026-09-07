import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import {
	classProgress,
	idleMs,
	participantProgress,
	progressCountKey,
	PROGRESS_STAGES,
	type ProgressFacts,
	type ProgressLabel,
} from '../../lib/flows/classProgress';
import { realNameOf, unreadRepliesFor } from '../../lib/teacherConsole';
import type { AgoraProposal } from '../../lib/proposals';
import { AgoraStage, type AgoraParticipant, type AgoraStagePlanItem } from '@freedi/shared-types';

/** The ids the progress arithmetic reads — built once per render from the live state */
export function progressFacts(
	proposals: readonly AgoraProposal[],
	answers: readonly AgoraProposal[],
	voterUids: ReadonlySet<string>,
	ratedByUid?: ReadonlyMap<string, number>,
): ProgressFacts {
	return {
		proposalAuthors: new Set(proposals.map((proposal) => proposal.creatorId)),
		answerAuthors: new Set(answers.map((answer) => answer.creatorId)),
		voterUids,
		...(ratedByUid ? { ratedByUid } : {}),
		// A round cannot ask a student to read more classmates than wrote
		roundSampleCap: Math.max(0, answers.length - 1),
	};
}

function labelNode(label: ProgressLabel): m.Children {
	if (label === 'check') return m(Icon, { name: 'check', size: 16 });
	if (label === 'dash') return '—';

	return `${label.done}/${label.total}`;
}

export interface ClassPanelAttrs {
	plan: readonly AgoraStagePlanItem[];
	currentIndex: number;
	participants: readonly AgoraParticipant[];
	facts: ProgressFacts;
	/** uid → how many classmates' texts this student rated */
	ratingsByUid: ReadonlyMap<string, number>;
	onMessage: (studentUid: string) => void;
}

/** Minutes of silence before a row says so */
const IDLE_AFTER_MS = 5 * 60 * 1000;

/**
 * The Class tab: one row per student — the pseudonym on their cards, the
 * real name they typed at the door (teacher-only), a pip per opened stage,
 * how much they have rated, their points, and the door to their thread.
 *
 * Every column is live: the participant and deliberation listeners the Live
 * tab already holds feed this one; the real names and the reply badges come
 * from the two teacher-only listeners in lib/teacherConsole.
 */
export function ClassPanel(): m.Component<ClassPanelAttrs> {
	return {
		view(vnode) {
			const { plan, currentIndex, participants, facts, ratingsByUid, onMessage } = vnode.attrs;
			const opened = plan
				.slice(0, currentIndex + 1)
				.filter((item) => PROGRESS_STAGES.has(item.stage));
			const now = Date.now();
			const current = plan[currentIndex];
			const done = current ? classProgress(current, participants, facts).doneCount : 0;

			return m('.card.stack.class-panel', [
				m('.class-progress__head', [
					m('p.teacher__section-title', t('teacher.class_title')),
					current && PROGRESS_STAGES.has(current.stage)
						? m(
								'span.class-progress__count',
								{ class: done === participants.length ? 'class-progress__count--all' : undefined },
								t(progressCountKey(current), { n: done, total: participants.length }),
							)
						: null,
				]),
				participants.length === 0
					? m('p.home-explanation', t('teacher.no_students_yet'))
					: m(
							'.class-panel__table',
							{ role: 'list' },
							participants.map((participant) => {
								const real = realNameOf(participant.userId);
								const unread = unreadRepliesFor(participant.userId);
								const idle = idleMs(participant, now);

								return m(
									'.class-panel__row',
									{ key: participant.participantId, role: 'listitem' },
									[
										m('.class-panel__who', [
											m('span.class-panel__name', participant.anonName),
											m(
												'span.class-panel__real',
												{ class: real ? undefined : 'class-panel__real--none' },
												real ?? t('teacher.no_real_name'),
											),
										]),
										m(
											'button.btn.btn--sm.btn--secondary.class-panel__message',
											{ type: 'button', onclick: () => onMessage(participant.userId) },
											[
												t('teacher.message_student'),
												unread > 0
													? m('span.class-panel__badge', { 'aria-hidden': 'true' }, String(unread))
													: null,
											],
										),
										m(
											'span.class-panel__pips',
											{ 'aria-label': t('teacher.col_progress') },
											opened.map((item) => {
												const progress = participantProgress(participant, item, facts);

												return m(
													'span.class-panel__pip',
													{
														key: item.itemId,
														class: progress.done ? 'class-panel__pip--done' : undefined,
														title: t(`teacherStage.${item.stage}`),
													},
													labelNode(progress.label),
												);
											}),
										),
										m('span.class-panel__stats', [
											`${t('teacher.col_ratings')} ${ratingsByUid.get(participant.userId) ?? 0}`,
											' · ',
											m(
												'span.roster__stat--points',
												t('roster.points', { points: String(participant.points.total) }),
											),
											idle > IDLE_AFTER_MS && current?.stage !== AgoraStage.lobby
												? [
														' · ',
														m(
															'span.class-panel__idle',
															t('teacher.idle_for', { minutes: Math.round(idle / 60_000) }),
														),
													]
												: null,
										]),
									],
								);
							}),
						),
			]);
		},
	};
}
