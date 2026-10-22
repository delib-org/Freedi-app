import m from 'mithril';
import { t } from '@/lib/i18n';

export interface HandOffCardAttrs {
	/** `open`: any not-yet tablemate may start; `one`: only this student is left. */
	mode: 'open' | 'one';
	sent: { n: number; m: number };
}

/**
 * The hand-off card at the top of the rate screen (UX 16.D): "After rating: you
 * can ask", who starts, and how many sent. Props in, vnodes out. It slides in
 * once; under reduced motion it simply shows (the duration tokens are 0).
 */
export const HandOffCard: m.Component<HandOffCardAttrs> = {
	view({ attrs }) {
		return m('.handoff', { 'data-testid': 'handoff-card', 'data-mode': attrs.mode }, [
			m('span.handoff__glyph', { 'aria-hidden': 'true' }, '?'),
			m('.handoff__text', [
				m('p.handoff__title', t(attrs.mode === 'one' ? 'turn.next_is_you' : 'turn.next_open')),
				attrs.mode === 'open' ? m('p.handoff__line', t('turn.first_tap')) : null,
				m('p.handoff__line', t('turn.sent_count', { n: attrs.sent.n, m: attrs.sent.m })),
			]),
		]);
	},
};
