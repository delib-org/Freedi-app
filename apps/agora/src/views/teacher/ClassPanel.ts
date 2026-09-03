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
): ProgressFacts {
	return {
		proposalAuthors: new Set(proposals.map((proposal) => proposal.creatorId)),
		answerAuthors: new Set(answers.map((answer) => answer.creatorId)),
		voterUids,
	};
}

function labelNode(label: ProgressLabel): m.Children {
	if (label === 'check') return m(Icon, { name: 'check', size: 16 });
	if (label === 'dash') return '—';

	return `${label.done}/${label.total}`;
}

/** Who finished the current stage's self-paced steps — the "can I advance?" card on the Live tab */
export function classProgressCard(
	item: AgoraStagePlanItem,
	participants: readonly AgoraParticipant[],
	facts: ProgressFacts,
): m.Children {
	if (!PROGRESS_STAGES.has(item.stage) || participants.length === 0) return null;
	const { entries, doneCount } = classProgress(item, participants, facts);

	return m('.card.class-progress', [
		m('.class-progress__head', [
			m('p.teacher__section-title', t('teacher.class_progress')),
			m(
				'span.class-progress__count',
				{ class: doneCount === entries.length ? 'class-progress__count--all' : undefined },
				t(progressCountKey(item.stage), { n: doneCount, total: entries.length }),
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
						m('span.class-progress__state', labelNode(entry.label)),
					],
				),
			),
		),
	]);
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
								t(progressCountKey(current.stage), { n: done, total: participants.length }),
							)
						: null,
				]),
				participants.length === 0
					? m('p.home-explanation', t('teacher.no_students_yet'))
					: m('.class-panel__table', { role: 'table' }, [
							m('.class-panel__row.class-panel__row--head', { role: 'row' }, [
								m('span', t('teacher.col_game_name')),
								m('span', t('teacher.col_real_name')),
								m('span.class-panel__pips-head', t('teacher.col_progress')),
								m('span', t('teacher.col_ratings')),
								m('span', t('teacher.col_points')),
								m('span'),
							]),
							participants.map((participant) => {
								const real = realNameOf(participant.userId);
								const unread = unreadRepliesFor(participant.userId);
								const idle = idleMs(participant, now);

								return m('.class-panel__row', { key: participant.participantId, role: 'row' }, [
									m('span.class-panel__name', participant.anonName),
									m(
										'span.class-panel__real',
										{ class: real ? undefined : 'class-panel__real--none' },
										real ?? t('teacher.no_real_name'),
									),
									m(
										'span.class-panel__pips',
										opened.map((item) => {
											const progress = participantProgress(participant, item, facts);

											return m(
												'span.class-panel__pip',
												{
													key: item.itemId,
													class: progress.done ? 'class-panel__pip--done' : undefined,
													title: t(`stage.${item.stage}`),
												},
												labelNode(progress.label),
											);
										}),
									),
									m('span', String(ratingsByUid.get(participant.userId) ?? 0)),
									m('span.roster__stat--points', String(participant.points.total)),
									m('span.class-panel__actions', [
										idle > IDLE_AFTER_MS && current?.stage !== AgoraStage.lobby
											? m(
													'span.class-panel__idle',
													t('teacher.idle_for', { minutes: Math.round(idle / 60_000) }),
												)
											: null,
										m(
											'button.btn.btn--sm.btn--secondary',
											{ type: 'button', onclick: () => onMessage(participant.userId) },
											[
												t('teacher.message_student'),
												unread > 0
													? m('span.class-panel__badge', { 'aria-hidden': 'true' }, String(unread))
													: null,
											],
										),
									]),
								]);
							}),
						]),
			]);
		},
	};
}
