import m from 'mithril';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import { listenToSession, stopListening, getSessionState } from '../../lib/session';
import { advanceStage } from '../../lib/callables';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
	setRound,
} from '../../lib/proposals';
import { lanternsFromState } from '../Deliberation';
import { Results } from '../Results';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { CountdownTimer } from '../../components/CountdownTimer';
import { AgoraRoundPhase } from '@freedi/shared-types';
import { EraMap } from '../../components/EraMap';
import { QRShare } from '../../components/QRShare';
import { AgoraStage } from '@freedi/shared-types';

/**
 * Teacher live panel — projector-friendly: join code + QR + the era map
 * filling with travelers, and the "open the time tunnel" control.
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

	let settingRound = false;

	function handleSetRound(phase: AgoraRoundPhase): void {
		if (settingRound) return;
		settingRound = true;
		setRound(sessionId, phase)
			.catch((error: unknown) => {
				console.error('[Teacher] Set round failed:', error);
			})
			.finally(() => {
				settingRound = false;
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
			const { proposals, scores } = getDeliberationState();

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

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					m(EraMap, {
						participants,
						lanterns: inDeliberation ? lanternsFromState(proposals, scores, userId) : [],
					}),

					inDeliberation
						? m('.card.stack', [
								m('p.teacher__section-title', t('teacher.round_controls')),
								m('.delib__header', [
									m('span.delib__round', t('delib.round', { n: session.roundNumber })),
									session.roundEndsAt ? m(CountdownTimer, { endsAt: session.roundEndsAt }) : null,
									m('span.values__score', `${t('teacher.proposals_count')}: ${proposals.length}`),
								]),
								m('.teacher__mode-row', [
									m(
										'button.btn',
										{
											class:
												session.roundPhase === AgoraRoundPhase.propose
													? 'btn--primary'
													: 'btn--secondary',
											disabled: settingRound,
											onclick: () => handleSetRound(AgoraRoundPhase.propose),
										},
										t('teacher.round_propose'),
									),
									m(
										'button.btn',
										{
											class:
												session.roundPhase === AgoraRoundPhase.rate
													? 'btn--primary'
													: 'btn--secondary',
											disabled: settingRound,
											onclick: () => handleSetRound(AgoraRoundPhase.rate),
										},
										t('teacher.round_rate'),
									),
									m(
										'button.btn',
										{
											class:
												session.roundPhase === AgoraRoundPhase.improve
													? 'btn--primary'
													: 'btn--secondary',
											disabled: settingRound,
											onclick: () => handleSetRound(AgoraRoundPhase.improve),
										},
										t('teacher.round_improve'),
									),
								]),
							])
						: null,

					m('.card.teacher__code-panel', [
						session.stage === AgoraStage.lobby
							? [
									m('p.teacher__section-title', t('teacher.session_code')),
									m('.teacher__code', session.code),
									m(QRShare, { url: joinUrl }),
									m('p.lobby__status', t('teacher.scan_to_join')),
								]
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
