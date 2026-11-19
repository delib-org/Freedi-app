import m from 'mithril';
import { t } from '@/lib/i18n';
import { QRShare } from '@/components/QRShare';

/**
 * Students are joining (design 5): the board opens with the class code, big enough to read
 * aloud from the back of the room, and the QR beside it (under it on a phone). The roster
 * follows. The teacher never has to find the code in a menu.
 */

export interface JoiningCardAttrs {
	code: string | undefined;
	url: string;
	title: string;
}

export const JoiningCard: m.Component<JoiningCardAttrs> = {
	view({ attrs }) {
		return m('section.joining-card', { 'aria-label': t('teacher.console.code') }, [
			attrs.code
				? m('p.joining-card__code', [
						m('span.joining-card__label', `${t('teacher.console.code')}:`),
						m(
							'strong.joining-card__value',
							{ dir: 'ltr', 'data-testid': 'joining-code' },
							attrs.code,
						),
					])
				: null,
			m('div.joining-card__qr', m(QRShare, { url: attrs.url, title: attrs.title })),
		]);
	},
};
