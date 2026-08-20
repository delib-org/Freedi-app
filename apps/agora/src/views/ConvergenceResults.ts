import m from 'mithril';
import { AgoraParticipant, AgoraSession } from '@freedi/shared-types';
import { t } from '../lib/i18n';
import { getSessionState } from '../lib/session';
import { EraMap } from '../components/EraMap';

export interface ConvergenceResultsAttrs {
	session: AgoraSession;
	/** The student’s own ledger — absent for spectators */
	myParticipant?: AgoraParticipant | null;
}

/**
 * What an event without camps has to show for itself.
 *
 * A classroom asks "did anything cross between the two sides?". A room with no
 * sides can only ask whether it is closer together than when it started, so
 * that is the number on the wall: the mean distance between everyone's
 * positions before the deliberation, the same measure after it, and the share
 * of the gap that closed.
 *
 * It climbs while people are still answering, which is deliberate — a final
 * number would mean waiting for the last person in the room, and the last
 * person is usually the one who left. A room that moved APART is told so
 * plainly. The screen exists to report what happened, and an event that only
 * ever congratulates itself is not measuring anything.
 */
export function ConvergenceResults(): m.Component<ConvergenceResultsAttrs> {
	return {
		view(vnode) {
			const { session } = vnode.attrs;
			const convergence = session.convergence;
			const participants = getSessionState().participants.filter((person) => !person.isAI);

			const score = convergence?.score ?? null;
			const counted = convergence?.participants ?? 0;

			// Nobody has answered the closing question yet: there is a gap to
			// measure but nothing to measure it against.
			const pending = score === null || counted < 2;

			const headline = pending
				? t('convergence.waiting')
				: score > 0
					? t('convergence.closer', { n: String(score) })
					: score < 0
						? t('convergence.apart', { n: String(Math.abs(score)) })
						: t('convergence.same');

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					m(EraMap, { participants }),
					m('.card.convergence', [
						m('h1.convergence__title', t('convergence.title')),
						m(
							'p.convergence__headline',
							{
								class: pending
									? 'convergence__headline--pending'
									: score > 0
										? 'convergence__headline--closer'
										: score < 0
											? 'convergence__headline--apart'
											: undefined,
							},
							headline,
						),
						// The raw pair of means, because "we closed 30% of the gap"
						// says nothing about how far apart the room actually was.
						pending
							? null
							: m('.convergence__means', [
									m('.convergence__mean', [
										m('span.convergence__mean-label', t('convergence.before')),
										m('span.convergence__mean-value', String(convergence?.before ?? 0)),
									]),
									m('.convergence__mean', [
										m('span.convergence__mean-label', t('convergence.after')),
										m('span.convergence__mean-value', String(convergence?.after ?? 0)),
									]),
								]),
						m('p.convergence__counted', t('convergence.counted', { n: String(counted) })),
					]),
				]),
			]);
		},
	};
}
