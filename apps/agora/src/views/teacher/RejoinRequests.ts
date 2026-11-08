import m from 'mithril';
import { pendingRejoinRequests, type AgoraSession } from '@freedi/shared-types';
import { t } from '../../lib/i18n';

export interface RejoinRequestsAttrs {
	session: AgoraSession;
	/** The real name typed at the door when they knocked, when the lesson asks for names */
	realNameOf: (uid: string) => string | undefined;
	onAnswer: (studentUid: string, decision: 'approve' | 'decline') => Promise<void>;
}

/**
 * A removed student knocked to come back. The teacher sees who — the
 * pseudonym they played under and the real name they typed, when there is
 * one — and lets them back or says not now. Mounted on the teacher's own
 * device only: a wall never shows who was removed.
 *
 * Reads the session doc the console already listens to, so a knock appears
 * live and an answer from the teacher's other device clears it here too.
 */
export function RejoinRequests(): m.Component<RejoinRequestsAttrs> {
	let busyUid: string | null = null;
	let failedUid: string | null = null;

	async function answer(
		attrs: RejoinRequestsAttrs,
		uid: string,
		decision: 'approve' | 'decline',
	): Promise<void> {
		if (busyUid) return;
		busyUid = uid;
		failedUid = null;
		try {
			await attrs.onAnswer(uid, decision);
		} catch (error) {
			console.error('[Teacher] Answering a rejoin request failed:', error);
			failedUid = uid;
		} finally {
			busyUid = null;
			m.redraw();
		}
	}

	return {
		view({ attrs }) {
			const requests = pendingRejoinRequests(attrs.session);
			if (requests.length === 0) return null;

			return m(
				'section.rejoin-alert',
				{ role: 'alert', 'aria-live': 'polite', 'data-testid': 'rejoin-alert' },
				[
					m('h2.rejoin-alert__title', t('teacher.rejoin.title', { n: requests.length })),
					m(
						'ul.rejoin-alert__list',
						requests.map((request) => {
							const real = attrs.realNameOf(request.uid);
							const who = real ? `${request.anonName} · ${real}` : request.anonName;
							const busy = busyUid === request.uid;

							return m('li.rejoin-alert__item', { key: request.uid }, [
								m('p.rejoin-alert__who', t('teacher.rejoin.asks', { name: who })),
								failedUid === request.uid
									? m('p.rejoin-alert__error', { role: 'alert' }, t('teacher.rejoin.failed'))
									: null,
								m('.rejoin-alert__actions', [
									m(
										'button.btn.btn--primary.btn--sm.rejoin-alert__approve',
										{
											type: 'button',
											disabled: busy,
											onclick: () => void answer(attrs, request.uid, 'approve'),
										},
										t('teacher.rejoin.approve'),
									),
									m(
										'button.btn.btn--secondary.btn--sm.rejoin-alert__decline',
										{
											type: 'button',
											disabled: busy,
											onclick: () => void answer(attrs, request.uid, 'decline'),
										},
										t('teacher.rejoin.decline'),
									),
								]),
							]);
						}),
					),
				],
			);
		},
	};
}
