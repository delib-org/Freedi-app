import m from 'mithril';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import { listenToSession, stopListening, getSessionState } from '../../lib/session';
import { advanceStage } from '../../lib/callables';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../../lib/proposals';
import { Results } from '../Results';
import { TeacherInstructions } from './TeacherInstructions';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { CountdownTimer } from '../../components/CountdownTimer';
import { QRShare } from '../../components/QRShare';
import { AgoraParticipant, AgoraStage } from '@freedi/shared-types';
import { AgoraProposal } from '../../lib/proposals';

/**
 * Teacher live panel — projector-friendly: class progress, stage
 * instructions, join code + QR, and the "open the time tunnel" control.
 */
// valueIdentification removed from the flow (cognitive load) — enum kept
// for legacy sessions; see fn_agoraAdvanceStage STAGE_ORDER
const STAGE_ORDER: AgoraStage[] = [
	AgoraStage.lobby,
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.deliberation,
	AgoraStage.results,
	AgoraStage.ended,
];

/** Stages where students move through self-paced sub-steps the teacher can't see on the projector */
const PROGRESS_STAGES = new Set<AgoraStage>([
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.deliberation,
]);

/** One student's progress within the current stage: done flag + a compact label */
function participantProgress(
	participant: AgoraParticipant,
	stage: AgoraStage,
	proposals: readonly AgoraProposal[],
): { done: boolean; label: string } {
	if (stage === AgoraStage.positioning) {
		const done = participant.campPosition !== undefined;

		return { done, label: done ? '✓' : '—' };
	}
	if (stage === AgoraStage.deliberation) {
		const done = proposals.some((proposal) => proposal.creatorId === participant.userId);

		return { done, label: done ? '✓' : '—' };
	}
	const progress = participant.stageProgress;
	// Progress from an earlier stage says nothing about this one
	if (!progress || progress.stage !== stage) return { done: false, label: '—' };
	const done = progress.scenesDone >= progress.scenesTotal;

	return { done, label: done ? '✓' : `${progress.scenesDone}/${progress.scenesTotal}` };
}

/** Who finished the current stage's self-paced steps — the "can I advance?" card */
function classProgressCard(
	stage: AgoraStage,
	participants: readonly AgoraParticipant[],
	proposals: readonly AgoraProposal[],
): m.Children {
	if (!PROGRESS_STAGES.has(stage) || participants.length === 0) return null;
	const entries = participants.map((participant) => ({
		participant,
		...participantProgress(participant, stage, proposals),
	}));
	const doneCount = entries.filter((entry) => entry.done).length;
	const countKey =
		stage === AgoraStage.positioning ? 'teacher.positioned_count' : 'teacher.finished_count';

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

export function TeacherSession(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let advancing = false;
	let userId = '';

	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		// Macrotask redraw — see GameController note.
		setTimeout(() => m.redraw(), 0);
	});

	function handleAdvance(nextStage: AgoraStage): void {
		if (advancing) return;
		advancing = true;
		advanceStage({ sessionId, stage: nextStage })
			.catch((error: unknown) => {
				console.error('[Teacher] Advance stage failed:', error);
			})
			.finally(() => {
				advancing = false;
				m.redraw();
			});
	}

	return {
		onremove() {
			stopListening();
			stopDeliberationListeners();
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
			// Legacy sessions on the removed valueIdentification stage advance
			// as if they were at needs (its old predecessor)
			const stageIndex =
				session.stage === AgoraStage.valueIdentification
					? STAGE_ORDER.indexOf(AgoraStage.needs)
					: STAGE_ORDER.indexOf(session.stage);
			const nextStage =
				stageIndex >= 0 && stageIndex < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageIndex + 1] : null;

			const inDeliberation = session.stage === AgoraStage.deliberation;
			if (inDeliberation && userId) listenToDeliberation(sessionId, userId);
			const { proposals } = getDeliberationState();

			// Results/ended: the teacher projects the same transformed map + score
			if (session.stage === AgoraStage.results || session.stage === AgoraStage.ended) {
				const topic = getTopicPackage(session.topicPackageId);
				if (!topic) {
					loadTopicPackage(session.topicPackageId);

					return m(
						'.shell',
						m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
					);
				}

				return m('.shell.shell--wide', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						m(Results, { session, topic }),
						nextStage
							? m(
									'button.btn.btn--secondary.btn--full',
									{
										disabled: advancing,
										onclick: () => handleAdvance(nextStage),
									},
									t('teacher.advance', { stage: t(`stage.${nextStage}`) }),
								)
							: null,
					]),
				]);
			}

			// The instruction text students read for the current stage —
			// projected so the teacher can read along and lead a discussion
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					classProgressCard(session.stage, participants, proposals),

					topic ? m(TeacherInstructions, { stage: session.stage, topic }) : null,

					// Students cycle propose→rate→help on their own; the teacher's
					// deliberation panel just shows progress (no round buttons)
					inDeliberation
						? m('.card.stack', [
								m('.delib__header', [
									session.roundEndsAt ? m(CountdownTimer, { endsAt: session.roundEndsAt }) : null,
									m('span.values__score', `${t('teacher.proposals_count')}: ${proposals.length}`),
								]),
							])
						: null,

					m('.card.teacher__code-panel', [
						// The join code stays on the board through EVERY stage, so a
						// latecomer can always join mid-lesson
						m('p.teacher__section-title', t('teacher.session_code')),
						m('.teacher__code', session.code),
						session.stage === AgoraStage.lobby
							? [m(QRShare, { url: joinUrl }), m('p.lobby__status', t('teacher.scan_to_join'))]
							: [
									m('p.teacher__section-title', t('teacher.current_stage')),
									m('h3', t(`stage.${session.stage}`)),
								],
						m('.text-center', [
							m('span.lobby__count', String(participants.length)),
							m('p.lobby__status', ` ${t('teacher.participants')}`),
						]),
						nextStage
							? m(
									'button.btn.btn--primary.btn--lg',
									{
										disabled: participants.length === 0 || advancing,
										onclick: () => handleAdvance(nextStage),
									},
									session.stage === AgoraStage.lobby
										? t('teacher.start_journey')
										: t('teacher.advance', { stage: t(`stage.${nextStage}`) }),
								)
							: m('p.lobby__status', t(`stage.${session.stage}`)),
					]),
				]),
			]);
		},
	};
}
