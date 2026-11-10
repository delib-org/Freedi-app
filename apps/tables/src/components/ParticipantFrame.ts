import m from 'mithril';
import type {
	TableAssignment,
	TableAssignmentParticipant,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { logError } from '@freedi/shared-utils';
import { ensureParticipantUser } from '@/lib/auth';
import { LiveValue } from '@/lib/live';
import { safeStorage } from '@/lib/safeStorage';
import {
	subscribeCounter,
	subscribeMyParticipant,
	subscribeSeats,
	subscribeSession,
	subscribeTopics,
} from '@/lib/tableAssignment/data';
import type { Subscription } from '@/lib/tableAssignment/data';
import { combineStates } from '@/logic/loadable';
import type { LoadState } from '@/logic/loadable';
import { loadMemory, registrationLoss, rememberRegistration } from '@/logic/localDraft';
import type { RegistrationLoss } from '@/logic/localDraft';
import { Shell } from '@/components/Shell';
import { StateBox } from '@/components/StateBox';
import { participantHomePath } from '@/paths';

/** What a participant screen receives once the identity and the session are ready. */
export interface ParticipantContext {
	uid: string;
	session: TableAssignment;
	topics: TableAssignmentTopic[];
	/** Load state of the topic list, shown by the screens that need it. */
	topicsState: LoadState;
	retryTopics: () => void;
	/** The participant's own registration; null while not registered. */
	me: TableAssignmentParticipant | null;
	/** Why a registration this browser held no longer exists; null when none is missing. */
	lost: RegistrationLoss | null;
	/** How many registered, when `counter` was asked and is readable. */
	registeredCount: number | null;
	/**
	 * Direct mode: seats taken per table index, only when `occupancy` was asked and the seat
	 * documents are readable; null otherwise (the server still enforces capacity).
	 */
	seats: ReadonlyMap<number, number> | null;
}

export interface ParticipantFrameAttrs {
	sessionId: string;
	/** Also read the topics (never in a draft, where the rules refuse them). */
	topics?: boolean;
	/** Also read the registered count. */
	counter?: boolean;
	/** Also read the seat counters to show free seats (direct mode). */
	occupancy?: boolean;
	barLabel?: (context: ParticipantContext) => string | undefined;
	largeLogo?: (context: ParticipantContext) => boolean;
	render: (context: ParticipantContext) => m.Children;
}

type Identity = { state: 'loading' } | { state: 'error' } | { state: 'ready'; uid: string };

/**
 * Wraps a participant screen: anonymous identity, the live session and the
 * person's own registration, and the loading / error / no-permission states.
 * The screen draws its own heading; the frame only renders it when all of
 * this is ready.
 */
export const ParticipantFrame: m.ClosureComponent<ParticipantFrameAttrs> = (initial) => {
	const sessionId = initial.attrs.sessionId;
	const session = new LiveValue('session', subscribeSession(sessionId));
	const topics = new LiveValue('topics', subscribeTopics(sessionId));
	const seats = new LiveValue('seats', subscribeSeats(sessionId));
	const counter = new LiveValue('counter', subscribeCounter(sessionId));
	let me: LiveValue<TableAssignmentParticipant | null> | null = null;
	let identity: Identity = { state: 'loading' };
	let topicsStarted = false;

	/** Remember in this browser that it holds a registration, the moment the record is seen. */
	function myRecord(uid: string): Subscription<TableAssignmentParticipant | null> {
		return (onData, onError) =>
			subscribeMyParticipant(sessionId, uid)((record) => {
				if (record) rememberRegistration(sessionId, uid, record.fullName, safeStorage);
				onData(record);
			}, onError);
	}

	async function signIn(): Promise<void> {
		identity = { state: 'loading' };
		m.redraw();

		try {
			const user = await ensureParticipantUser();

			identity = { state: 'ready', uid: user.uid };
			me?.stop();
			me = new LiveValue('me', myRecord(user.uid));
			me.start();
		} catch (error) {
			logError(error, { operation: 'tables.participant.identity', metadata: { sessionId } });
			identity = { state: 'error' };
		}
		m.redraw();
	}

	function startTopicsOnceReadable(attrs: ParticipantFrameAttrs): void {
		if (topicsStarted || !attrs.topics || !session.data || session.data.status === 'draft') return;
		topicsStarted = true;
		topics.start();
	}

	function retryAll(attrs: ParticipantFrameAttrs): void {
		session.retry();
		if (topicsStarted) topics.retry();
		me?.retry();
		if (attrs.occupancy) seats.retry();
		if (attrs.counter) counter.retry();
		if (identity.state === 'error') void signIn();
	}

	function contextOf(uid: string, current: TableAssignment, attrs: ParticipantFrameAttrs) {
		const record = me?.data ?? null;

		return {
			uid,
			session: current,
			topics: topics.data ?? [],
			topicsState: topics.state,
			retryTopics: () => topics.retry(),
			me: record,
			lost: record === null ? registrationLoss(loadMemory(sessionId, uid, safeStorage)) : null,
			registeredCount: attrs.counter && counter.state === 'ready' ? (counter.data ?? 0) : null,
			seats: attrs.occupancy && seats.state === 'ready' ? (seats.data ?? new Map()) : null,
		};
	}

	return {
		oninit({ attrs }) {
			session.start();
			if (attrs.occupancy) seats.start();
			if (attrs.counter) counter.start();
			void signIn();
		},
		oncreate({ attrs }) {
			startTopicsOnceReadable(attrs);
		},
		onupdate({ attrs }) {
			startTopicsOnceReadable(attrs);
		},
		onremove() {
			session.stop();
			topics.stop();
			seats.stop();
			counter.stop();
			me?.stop();
		},
		view({ attrs }) {
			const shell = { phone: true };
			const identityState: LoadState =
				identity.state === 'ready'
					? (me?.state ?? 'loading')
					: identity.state === 'error'
						? 'error'
						: 'loading';
			// Topics do not block the frame: a person must be able to register even when
			// the topic list is not readable yet; the screens that need it show its state.
			const state = combineStates([session.state, identityState]);

			if (state === 'loading') return m(Shell, shell, m(StateBox, { kind: 'loading' }));
			if (state === 'denied') {
				return m(
					Shell,
					shell,
					m(StateBox, { kind: 'denied', backHref: participantHomePath(sessionId) }),
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

			const context = contextOf(identity.uid, session.data, attrs);

			return m(
				Shell,
				{
					...shell,
					barLabel: attrs.barLabel?.(context),
					largeLogo: attrs.largeLogo?.(context),
				},
				attrs.render(context),
			);
		},
	};
};
