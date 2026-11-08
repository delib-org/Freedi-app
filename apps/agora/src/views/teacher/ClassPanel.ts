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
import {
	INITIAL_REMOVE_STUDENT,
	removeStudentReduce,
	type RemoveStudentEvent,
	type RemoveStudentState,
} from '../../lib/flows/removeStudent';
import type { AgoraProposal } from '../../lib/proposals';
import { AgoraStage, type AgoraParticipant, type AgoraStagePlanItem } from '@freedi/shared-types';

/** The ids the progress arithmetic reads — built once per render from the live state */
export function progressFacts(
	proposals: readonly AgoraProposal[],
	answers: readonly AgoraProposal[],
	voterUids: ReadonlySet<string>,
	ratedByUid?: ReadonlyMap<string, number>,
	/** The lottery's hand size when notes are dealt (see lib/hands.ts); absent otherwise */
	handSize?: number,
): ProgressFacts {
	return {
		proposalAuthors: new Set(proposals.map((proposal) => proposal.creatorId)),
		answerAuthors: new Set(answers.map((answer) => answer.creatorId)),
		voterUids,
		...(ratedByUid ? { ratedByUid } : {}),
		...(handSize !== undefined ? { handSize } : {}),
		// A round cannot ask a student to read more classmates than wrote
		roundSampleCap: Math.max(0, answers.length - 1),
	};
}

function labelNode(label: ProgressLabel): m.Children {
	if (label === 'check') return m(Icon, { name: 'check', size: 16 });
	if (label === 'dash') return '—';
	if (label === 'opened') return m('span', { title: t('linked.pip_opened') }, '↗');

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
	/** Open "what they wrote" on this student's page */
	onWrote?: (studentUid: string) => void;
	/** This screen is on the wall: pseudonyms only, and say so instead of "no real name" */
	namesHidden?: boolean;
	/**
	 * Take a student out of the lesson. Absent on a wall screen: "remove Blue
	 * Fox?" is not a question to ask in front of the class.
	 */
	onRemove?: (studentUid: string) => Promise<void>;
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
	let removal: RemoveStudentState = INITIAL_REMOVE_STUDENT;
	const dispatch = (event: RemoveStudentEvent): void => {
		removal = removeStudentReduce(removal, event);
	};

	async function confirmRemoval(
		onRemove: (studentUid: string) => Promise<void>,
		participant: AgoraParticipant,
	): Promise<void> {
		dispatch({ kind: 'start' });
		if (removal.busyUid !== participant.userId) return;
		try {
			await onRemove(participant.userId);
			dispatch({ kind: 'succeeded', name: participant.anonName });
		} catch (error) {
			console.error('[Teacher] Remove student failed:', error);
			dispatch({ kind: 'failed' });
		} finally {
			m.redraw();
		}
	}

	function confirmBlock(
		participant: AgoraParticipant,
		real: string | undefined,
		onRemove: (studentUid: string) => Promise<void>,
	): m.Children {
		const busy = removal.busyUid === participant.userId;
		const titleId = `remove-title-${participant.participantId}`;
		const name = real ? `${participant.anonName} · ${real}` : participant.anonName;

		return m(
			'.class-panel__confirm',
			{
				role: 'group',
				'aria-labelledby': titleId,
				// The question opens under the row, often below the panel's fold:
				// bring it into view and put the keyboard on the safe answer
				oncreate: (confirmVnode: m.VnodeDOM) => {
					const element = confirmVnode.dom as HTMLElement;
					element.scrollIntoView?.({ block: 'nearest' });
					element.querySelector<HTMLButtonElement>('.class-panel__keep')?.focus();
				},
			},
			[
				m(`h3.class-panel__confirm-title#${titleId}`, t('teacher.remove_confirm_title', { name })),
				m('p.class-panel__confirm-body', t('teacher.remove_confirm_body')),
				removal.errorKey ? m('p.class-panel__error', { role: 'alert' }, t(removal.errorKey)) : null,
				m('.teacher__mode-row', [
					m(
						'button.btn.btn--sm.btn--primary.class-panel__remove-ok',
						{
							type: 'button',
							disabled: busy,
							'aria-busy': busy ? 'true' : undefined,
							onclick: () => void confirmRemoval(onRemove, participant),
						},
						t('teacher.remove_confirm_ok'),
					),
					m(
						'button.btn.btn--sm.btn--secondary.class-panel__keep',
						{
							type: 'button',
							disabled: busy,
							onclick: () => dispatch({ kind: 'cancel' }),
						},
						t('teacher.remove_keep'),
					),
				]),
			],
		);
	}

	return {
		view(vnode) {
			const {
				plan,
				currentIndex,
				participants,
				facts,
				ratingsByUid,
				onMessage,
				onWrote,
				onRemove,
			} = vnode.attrs;
			// A row removed from the teacher's other device takes its question with it
			dispatch({ kind: 'roster', uids: new Set(participants.map((row) => row.userId)) });
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
				removal.removedName
					? m(
							'p.class-panel__status',
							{ role: 'status' },
							t('teacher.removed_done', { name: removal.removedName }),
						)
					: null,
				participants.length === 0
					? m('p.home-explanation', t('teacher.no_students_yet'))
					: m(
							'.class-panel__table',
							{ role: 'list' },
							participants.map((participant) => {
								const real = vnode.attrs.namesHidden ? undefined : realNameOf(participant.userId);
								const unread = unreadRepliesFor(participant.userId);
								const idle = idleMs(participant, now);

								const asking = onRemove && removal.confirmUid === participant.userId;

								return m(
									'.class-panel__item',
									{ key: participant.participantId, role: 'listitem' },
									m('.class-panel__row', [
										m('.class-panel__who', [
											m('span.class-panel__name', participant.anonName),
											m(
												'span.class-panel__real',
												{ class: real ? undefined : 'class-panel__real--none' },
												real ??
													t(
														vnode.attrs.namesHidden
															? 'teacher.device.names_hidden_row'
															: 'teacher.no_real_name',
													),
											),
											// On the name, not in the small print: a refused text is
											// the one fact on this row the teacher must not miss
											(participant.languageStrikes ?? 0) > 0
												? m(
														'span.class-panel__strikes.class-panel__strikes--chip',
														t('teacher.language_strikes', {
															n: String(participant.languageStrikes),
														}),
													)
												: null,
										]),
										m('span.class-panel__actions', [
											onWrote
												? m(
														'button.btn.btn--sm.btn--ghost',
														{ type: 'button', onclick: () => onWrote(participant.userId) },
														t('teacher.w_what_wrote'),
													)
												: null,
											m(
												'button.btn.btn--sm.btn--secondary.class-panel__message',
												{ type: 'button', onclick: () => onMessage(participant.userId) },
												[
													t('teacher.message_student'),
													unread > 0
														? m(
																'span.class-panel__badge',
																{ 'aria-hidden': 'true' },
																String(unread),
															)
														: null,
												],
											),
											onRemove
												? m(
														'button.btn.btn--sm.btn--ghost.class-panel__remove',
														{
															type: 'button',
															'aria-expanded': asking ? 'true' : 'false',
															'aria-label': `${t('teacher.remove_student')} ${participant.anonName}`,
															onclick: () => dispatch({ kind: 'ask', uid: participant.userId }),
														},
														t('teacher.remove_student'),
													)
												: null,
										]),
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
									]),
									asking && onRemove ? confirmBlock(participant, real, onRemove) : null,
								);
							}),
						),
			]);
		},
	};
}
