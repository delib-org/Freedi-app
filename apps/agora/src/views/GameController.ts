import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser } from '../lib/user';
import { listenToSession, stopListening, getSessionState } from '../lib/session';
import { getTopicPackage, loadTopicPackage } from '../lib/topic';
import { stopValueAnswerListeners } from '../lib/values';
import { Lobby } from './Lobby';
import { SceneStage } from './SceneStage';
import { ValueIdentification } from './ValueIdentification';
import { Positioning } from './Positioning';
import { Deliberation } from './Deliberation';
import { Results } from './Results';
import { AgoraSceneKind, AgoraStage } from '@freedi/shared-types';

/**
 * Student game controller — routes the current view from the session doc's
 * stage (single source of truth). Scene stages are student-paced within
 * the teacher-controlled session stage.
 */
export function GameController(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let userId = '';

	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		// A macrotask redraw survives Mithril's route-resolution window,
		// where a synchronous m.redraw() would be silently swallowed.
		setTimeout(() => m.redraw(), 0);
	});

	return {
		onremove() {
			stopListening();
			stopValueAnswerListeners();
		},

		view() {
			// Re-attach on every render (idempotent per sessionId). Mount/unmount
			// interleavings during route transitions can kill the module-level
			// listeners after an async attach; the next redraw self-heals.
			if (userId) listenToSession(sessionId, userId);

			const { session, participants, myParticipant, loading, error } = getSessionState();

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
						m('button.btn.btn--secondary', { onclick: () => m.route.set('/') }, t('common.back')),
					]),
				);
			}

			if (session.stage === AgoraStage.lobby) {
				return m(Lobby, { participants, myParticipant });
			}

			// Every stage past the lobby needs the topic package
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) {
				loadTopicPackage(session.topicPackageId);

				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			const scenesOf = (...kinds: AgoraSceneKind[]) =>
				kinds
					.map((kind) => topic.scenes.find((scene) => scene.kind === kind))
					.filter((scene) => scene !== undefined);

			switch (session.stage) {
				case AgoraStage.framing:
					return m(SceneStage, {
						scenes: scenesOf(
							AgoraSceneKind.intro,
							AgoraSceneKind.timeTunnel,
							AgoraSceneKind.periodExplainer,
						),
						storageKey: `agora_${sessionId}_framing`,
					});

				case AgoraStage.perspectives:
					return m(SceneStage, {
						scenes: scenesOf(AgoraSceneKind.perspectiveA, AgoraSceneKind.perspectiveB),
						storageKey: `agora_${sessionId}_perspectives`,
					});

				case AgoraStage.valueIdentification:
					return m(ValueIdentification, { sessionId, userId, topic });

				case AgoraStage.positioning:
					return myParticipant
						? m(Positioning, { topic, myParticipant })
						: m(
								'.shell',
								m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
							);

				case AgoraStage.deliberation:
					return myParticipant
						? m(Deliberation, { session, myParticipant, userId })
						: m(
								'.shell',
								m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
							);

				case AgoraStage.results:
				case AgoraStage.ended:
					return m(Results, { session, topic });

				default:
					// deliberation / results / ended land in Phases 4-5
					return m('.shell', [
						m(
							'.shell__content.text-center',
							{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
							[m('h2', t('lobby.get_ready')), m('p.lobby__status', session.stage)],
						),
					]);
			}
		},
	};
}
