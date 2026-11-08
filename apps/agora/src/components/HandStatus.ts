import m from 'mithril';
import { t } from '../lib/i18n';
import type { HandStatus as Status } from '../lib/flows/handFlow';

export interface HandStatusAttrs {
	status: Status;
	/** The hand is still short of its size and more notes may arrive */
	waiting: boolean;
	/** Nothing is left on this board for this student to draw */
	exhausted: boolean;
	onDrawMore: () => void;
}

/**
 * The line under a dealt board: how far through the hand the student is,
 * what happens next, and the one button that is theirs — "draw more".
 *
 * Props in, vnodes out; the hand itself lives in lib/hands.ts. Quiet by
 * design: the lottery is the room's rule, not an event, so nothing here
 * celebrates. The finished line says a late classmate's note will come on
 * its own, which is the promise the server keeps.
 */
export const HandStatus: m.Component<HandStatusAttrs> = {
	view({ attrs }) {
		const { status, waiting, exhausted, onDrawMore } = attrs;
		if (status.total === 0 && !waiting) return null;

		return m('.hand', [
			status.total > 0
				? m('p.hand__line', t('hand.line', { n: status.ratedCount, total: status.total }))
				: null,
			// The sentence counts what is already in the hand ("so far you have {{n}}");
			// an empty hand gets its own line — "so far you have 0" read as a verdict
			waiting
				? m(
						'p.hand__note',
						status.total > 0 ? t('hand.waiting', { n: status.total }) : t('hand.waiting_none'),
					)
				: null,
			status.finished ? m('p.hand__note', t(exhausted ? 'hand.pool_done' : 'hand.done')) : null,
			status.finished && !exhausted
				? m(
						'button.btn.btn--secondary.btn--sm.hand__more',
						{ type: 'button', onclick: onDrawMore },
						t('hand.draw_more'),
					)
				: null,
		]);
	},
};
