import m from 'mithril';
import type {
	TableAssignment,
	TableAssignmentRosterEntry,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeRoster, subscribeSession, subscribeTopics } from '@/lib/tableAssignment/data';
import { combineStates } from '@/logic/loadable';
import { HostGate } from '@/components/HostGate';
import { Shell } from '@/components/Shell';
import type { ShellAttrs } from '@/components/Shell';
import { StateBox } from '@/components/StateBox';
import { signOutHost } from '@/lib/hostAuth';
import { backTargetFor } from '@/logic/hostBack';
import type { StageScreen } from '@/logic/hostBack';
import { hostHomePath, hostListPath } from '@/paths';

/** What a host sub-screen receives once the session is loaded and owned by the host. */
export interface HostContext {
	uid: string;
	session: TableAssignment;
	topics: TableAssignmentTopic[];
	participants: TableAssignmentRosterEntry[];
}

export interface HostFrameAttrs {
	sessionId: string;
	/** i18n key of the screen title. */
	titleKey: string;
	/** Load the topics / registrants too (live). */
	topics?: boolean;
	participants?: boolean;
	wide?: boolean;
	/** The host home has no "back to home" link, it goes back to the list. */
	isHome?: boolean;
	/** The stage this screen is for: when the status makes it the stage, Back goes to the list. */
	stage?: StageScreen;
	/** Frame details that depend on the session, e.g. a stage screen with its own heading. */
	shellFor?: (session: TableAssignment) => Partial<ShellAttrs>;
	render: (context: HostContext) => m.Children;
}

interface SignedInFrameAttrs extends HostFrameAttrs {
	uid: string;
}

/**
 * The frame once a host is signed in. The reads start here and not earlier:
 * before sign-in the rules refuse every one of them, and a listener that was
 * refused does not come back by itself after the host signs in.
 */
const SignedInFrame: m.ClosureComponent<SignedInFrameAttrs> = (initial) => {
	const sessionId = initial.attrs.sessionId;
	const session = new LiveValue('session', subscribeSession(sessionId));
	const topics = new LiveValue('topics', subscribeTopics(sessionId));
	const participants = new LiveValue('participants', subscribeRoster(sessionId));
	const needsTopics = !!initial.attrs.topics;
	const needsParticipants = !!initial.attrs.participants;

	function retryAll(): void {
		session.retry();
		if (needsTopics) topics.retry();
		if (needsParticipants) participants.retry();
	}

	return {
		oninit() {
			session.start();
			if (needsTopics) topics.start();
			if (needsParticipants) participants.start();
		},
		onremove() {
			session.stop();
			topics.stop();
			participants.stop();
		},
		view({ attrs }) {
			const { uid } = attrs;
			const title = t(attrs.titleKey);
			const backHref = attrs.isHome ? hostListPath() : hostHomePath(sessionId);
			const backLabel = attrs.isHome ? t('tableAssignment.back.toList') : t('tableAssignment.back');

			const states = [session.state];

			if (needsTopics) states.push(topics.state);
			if (needsParticipants) states.push(participants.state);

			const state = combineStates(states);
			const shell = { title, backHref, backLabel, wide: attrs.wide, onSignOut: signOutHost };

			if (state === 'loading') return m(Shell, shell, m(StateBox, { kind: 'loading' }));
			if (state === 'denied') {
				return m(
					Shell,
					shell,
					m(StateBox, {
						kind: 'denied',
						backHref: hostListPath(),
						backLabel: t('tableAssignment.back.toList'),
					}),
				);
			}
			if (state === 'error') {
				return m(
					Shell,
					shell,
					m(StateBox, {
						kind: 'error',
						onRetry: retryAll,
						backHref: hostListPath(),
						backLabel: t('tableAssignment.back.toList'),
					}),
				);
			}

			const current = session.data;

			if (!current) {
				return m(
					Shell,
					shell,
					m(StateBox, {
						kind: 'error',
						messageKey: 'tableAssignment.state.notFound',
						backHref: hostListPath(),
						backLabel: t('tableAssignment.back.toList'),
					}),
				);
			}
			if (current.hostUid !== uid) {
				return m(
					Shell,
					shell,
					m(StateBox, {
						kind: 'denied',
						messageKey: 'tableAssignment.state.notHost',
						backHref: hostListPath(),
						backLabel: t('tableAssignment.back.toList'),
					}),
				);
			}

			const back = backTargetFor(current, attrs.stage);
			const backShell = attrs.isHome
				? {}
				: {
						backHref: back.href,
						backLabel: back.toList ? t('tableAssignment.back.toList') : t('tableAssignment.back'),
					};

			return m(
				Shell,
				{ ...shell, title, ...backShell, ...attrs.shellFor?.(current) },
				attrs.render({
					uid,
					session: current,
					topics: topics.data ?? [],
					participants: participants.data ?? [],
				}),
			);
		},
	};
};

/**
 * Wraps a host screen: Google sign-in, live session (plus topics and
 * registrants when asked), the ownership check (session.hostUid) and the
 * loading / error / no-permission states. The body only renders when all of
 * it is ready and the signed-in user is the session's host.
 */
export const HostFrame: m.Component<HostFrameAttrs> = {
	view({ attrs }) {
		return m(HostGate, {
			title: t(attrs.titleKey),
			backHref: hostListPath(),
			wide: attrs.wide,
			// Keyed by the host: another account starts its own reads.
			render: (uid: string) => [m(SignedInFrame, { ...attrs, uid, key: uid })],
		});
	},
};
