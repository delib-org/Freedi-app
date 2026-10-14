import m from 'mithril';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	getStagePlan,
	getCurrentPlanIndex,
} from '../../lib/session';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { listenToDeliberation, stopDeliberationListeners } from '../../lib/proposals';
import { listenToVoting, stopVotingListeners } from '../../lib/voting';
import { watchStageBody } from './watchBodies';
import { QRShare } from '../../components/QRShare';
import { sessionJoinUrl, sessionVillageMode } from '../../lib/flows/sessionLinks';
import { projectorShowsQr } from '../../lib/flows/joinInvite';
import { isLibraryVideoLive, videoLabelParts } from '../../lib/flows/libraryVideo';
import { youtubeEmbedUrl } from '../../lib/youtube';
import { StageTransition, hasStageTransition } from '../../components/StageTransition';
import { planItemLabel } from '../../components/StageNav';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';

/**
 * The projector: what the class sees, on the wall.
 *
 * A generic student's view of the stage the room is on — the scenes, the
 * needs board, the question's ranked answers, the live square, the ballot,
 * the results — with NO seat behind it: no userId reaches any child, no
 * participant is "mine", no name is ever real (proposals are numbers,
 * answers are numbers, the ballot is the class's). It follows the room as it
 * advances and never lets anyone step back.
 *
 * Deliberately never imports the notification, inbox, seen-state or
 * teacher-console modules — a projector that toasts, or that could list real
 * names, is a projector that leaks. `projectorImports.test.ts` pins that.
 */
export function ProjectorScreen(
	initialVnode: m.Vnode<{ id: string }>,
): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let userId = '';
	let lastIndex: number | null = null;
	let transitionItem: AgoraStagePlanItem | null = null;
	let transitionLeaving = false;
	let transitionTimer: number | undefined;
	let transitionLeaveTimer: number | undefined;

	function beginStageTransition(item: AgoraStagePlanItem): void {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		transitionItem = item;
		transitionLeaving = false;
		window.clearTimeout(transitionTimer);
		window.clearTimeout(transitionLeaveTimer);
		transitionTimer = window.setTimeout(
			() => {
				transitionLeaving = true;
				m.redraw();
				transitionLeaveTimer = window.setTimeout(() => {
					transitionItem = null;
					m.redraw();
				}, 400);
			},
			reduced ? 900 : 1900,
		);
	}

	// Anonymous is enough: every read this screen makes is open to any
	// signed-in user, so a classroom PC that is nobody's account still works
	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		setTimeout(() => m.redraw(), 0);
	});

	return {
		onremove() {
			window.clearTimeout(transitionTimer);
			window.clearTimeout(transitionLeaveTimer);
			stopListening();
			stopDeliberationListeners();
			stopVotingListeners();
		},

		view() {
			if (userId) listenToSession(sessionId, userId);
			const { session, participants, loading, error } = getSessionState();

			if (loading || (!session && !error)) {
				return m(
					'.projector',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (error || !session) {
				return m(
					'.projector',
					m('.shell__content.text-center', m('p.join__error', t('common.error'))),
				);
			}

			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();
			const item = plan[currentIndex];

			if (currentIndex !== lastIndex) {
				if (lastIndex !== null && item && hasStageTransition(item.stage))
					beginStageTransition(item);
				lastIndex = currentIndex;
			}

			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);

			const needsData =
				item.stage === AgoraStage.question ||
				item.stage === AgoraStage.deliberation ||
				item.stage === AgoraStage.voting ||
				item.stage === AgoraStage.results ||
				item.stage === AgoraStage.ended;
			if (needsData && userId) listenToDeliberation(sessionId, userId);
			if (item.stage === AgoraStage.voting && userId) {
				listenToVoting(sessionId, session.challengeQuestionId, userId);
			}

			// The same link the console's QR encodes. A bare `/join/<code>` path
			// never reached the join screen: the router reads the hash, so the
			// wall's QR used to open the home page
			const joinUrl = sessionJoinUrl(
				window.location.origin,
				session.code,
				sessionVillageMode(session.world, window.location.search),
			);
			const lobby = item.stage === AgoraStage.lobby;
			const showQr = projectorShowsQr(
				session.status,
				item.stage,
				session.code,
				session.projectorQr,
			);

			// The teacher started a video for the class: the wall shows only it —
			// full-bleed, muted, its name small, nothing to press — and returns to
			// the stage the moment it is stopped.
			const live = isLibraryVideoLive(session.libraryVideo, Date.now())
				? session.libraryVideo
				: undefined;
			if (live && topic) {
				const parts = videoLabelParts(topic.scenes, live);
				const stored = topic.scenes
					.find((scene) => scene.sceneId === live.sceneId)
					?.youtubeVideos?.find((video) => video.videoId === live.videoId);

				return m('.projector.projector--video', { 'data-screen': 'projector' }, [
					m('iframe.projector__video', {
						src: youtubeEmbedUrl(
							{ videoId: live.videoId, startSeconds: live.startSeconds ?? stored?.startSeconds },
							{ autoplay: true },
						),
						title: parts?.title || t('video.default_title', { n: parts?.n ?? 1 }),
						allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
						referrerpolicy: 'strict-origin-when-cross-origin',
					}),
					m(
						'p.projector__video-title',
						parts?.title || t('video.default_title', { n: parts?.n ?? 1 }),
					),
				]);
			}

			return m('.projector', { 'data-stage': item.stage, 'data-screen': 'projector' }, [
				// The way back, for a teacher who opened the wall in their own tab.
				// Small and in a corner: on the real wall it is a footnote.
				m(
					'a.projector__back',
					{ href: `#!/teach/session/${sessionId}` },
					`← ${t('projector.back_to_console')}`,
				),
				transitionItem !== null
					? m(StageTransition, {
							stage: transitionItem.stage,
							title:
								transitionItem.stage === AgoraStage.question ? transitionItem.title : undefined,
							leaving: transitionLeaving,
						})
					: null,
				m('.projector__stage', [
					m('h2.projector__title', planItemLabel(item)),
					topic
						? watchStageBody({ session, item, topic, participants, userId })
						: m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				]),
				// Big in the lobby; after it a small QR beside the digits, only
				// while the teacher has switched it on from the console's menu
				m(
					'aside.projector__code',
					{ class: showQr && !lobby ? 'projector__code--compact' : undefined },
					[
						m('.projector__code-text', [
							m('span.projector__code-label', t('projector.scan_to_join')),
							m('.projector__code-value', session.code),
							m(
								'span.projector__code-count',
								t('projector.participants', { n: participants.length }),
							),
						]),
						showQr ? m(QRShare, { url: joinUrl, size: lobby ? 220 : 112 }) : null,
					],
				),
			]);
		},
	};
}
