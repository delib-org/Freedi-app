import m from 'mithril';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { logError } from '@freedi/shared-utils';
import { t } from '@/lib/i18n';
import { ensureParticipantUser } from '@/lib/auth';
import { LiveValue } from '@/lib/live';
import {
	subscribeMyParticipant,
	subscribeParticipants,
	subscribeSession,
	subscribeTopics,
} from '@/lib/tableAssignment/data';
import { combineStates } from '@/logic/loadable';
import type { LoadState } from '@/logic/loadable';
import { Shell } from '@/components/Shell';
import { StateBox } from '@/components/StateBox';
import { participantHomePath } from '@/paths';

/** What a participant sub-screen receives once the identity and the session are ready. */
export interface ParticipantContext {
	uid: string;
	session: TableAssignment;
	topics: TableAssignmentTopic[];
	/** Load state of the topic list, shown by the screens that need it. */
	topicsState: LoadState;
	retryTopics: () => void;
	/** The participant's own registration; null while not registered. */
	me: TableAssignmentParticipant | null;
	/**
	 * Everyone's registration, only when `occupancy` was asked and the rules allow
	 * reading it; null otherwise (seat counts are then unknown, the server still enforces capacity).
	 */
	everyone: TableAssignmentParticipant[] | null;
}

export interface ParticipantFrameAttrs {
	sessionId: string;
	titleKey: string;
	/** Home has no "back"; every child goes back to the participant home. */
	isHome?: boolean;
	/** Also read all registrations to count free seats (direct mode). */
	occupancy?: boolean;
	/** Override where "back" goes (a topic goes back to the topic list). */
	backHref?: string;
	backLabel?: string;
	render: (context: ParticipantContext) => m.Children;
}

type Identity = { state: 'loading' } | { state: 'error' } | { state: 'ready'; uid: string };

/**
 * Wraps a participant screen: anonymous identity, live session + topics + the
 * participant's own registration, and the loading / error / no-permission
 * states. Mobile-first; the body only renders when everything is ready.
 */
export const ParticipantFrame: m.ClosureComponent<ParticipantFrameAttrs> = (initial) => {
	const sessionId = initial.attrs.sessionId;
	const session = new LiveValue('session', subscribeSession(sessionId));
	const topics = new LiveValue('topics', subscribeTopics(sessionId));
	const everyone = new LiveValue('everyone', subscribeParticipants(sessionId));
	let me: LiveValue<TableAssignmentParticipant | null> | null = null;
	let identity: Identity = { state: 'loading' };

	async function signIn(): Promise<void> {
		identity = { state: 'loading' };
		m.redraw();

		try {
			const user = await ensureParticipantUser();

			identity = { state: 'ready', uid: user.uid };
			me?.stop();
			me = new LiveValue('me', subscribeMyParticipant(sessionId, user.uid));
			me.start();
		} catch (error) {
			logError(error, { operation: 'tables.participant.identity', metadata: { sessionId } });
			identity = { state: 'error' };
		}
		m.redraw();
	}

	function retryAll(initialAttrs: ParticipantFrameAttrs): void {
		session.retry();
		topics.retry();
		me?.retry();
		if (initialAttrs.occupancy) everyone.retry();
		if (identity.state === 'error') void signIn();
	}

	return {
		oninit({ attrs }) {
			session.start();
			topics.start();
			if (attrs.occupancy) everyone.start();
			void signIn();
		},
		onremove() {
			session.stop();
			topics.stop();
			everyone.stop();
			me?.stop();
		},
		view({ attrs }) {
			const title = t(attrs.titleKey);
			const home = participantHomePath(sessionId);
			const shell = {
				title: attrs.isHome && session.data ? session.data.title : title,
				backHref: attrs.isHome ? undefined : (attrs.backHref ?? home),
				backLabel: attrs.backLabel ?? t('tableAssignment.back.toHome'),
			};
			// Topics do not block the frame: a participant must be able to register
			// even when the topic list is not readable yet; topic screens show its own state.
			const states: LoadState[] = [
				session.state,
				identity.state === 'ready'
					? (me?.state ?? 'loading')
					: identity.state === 'error'
						? 'error'
						: 'loading',
			];
			const state = combineStates(states);

			if (state === 'loading') return m(Shell, shell, m(StateBox, { kind: 'loading' }));
			if (state === 'denied') {
				return m(
					Shell,
					shell,
					m(StateBox, { kind: 'denied', backHref: attrs.isHome ? undefined : home }),
				);
			}
			if (state === 'error') {
				return m(Shell, shell, m(StateBox, { kind: 'error', onRetry: () => retryAll(attrs) }));
			}
			if (!session.data) {
				return m(
					Shell,
					shell,
					m(StateBox, { kind: 'error', messageKey: 'tableAssignment.state.notFound' }),
				);
			}
			if (identity.state !== 'ready') return m(Shell, shell, m(StateBox, { kind: 'loading' }));

			return m(
				Shell,
				{ ...shell, title: attrs.isHome ? session.data.title : title },
				attrs.render({
					uid: identity.uid,
					session: session.data,
					topics: topics.data ?? [],
					topicsState: topics.state,
					retryTopics: () => topics.retry(),
					me: me?.data ?? null,
					everyone: attrs.occupancy && everyone.state === 'ready' ? (everyone.data ?? []) : null,
				}),
			);
		},
	};
};
