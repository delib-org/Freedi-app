import m from 'mithril';
import { t } from '@/lib/i18n';
import { QRShare } from '@/components/QRShare';
import { showHere } from './ProjectorMenu';

/**
 * Students are joining (Trello Rkrtmmx8): the first thing the teacher shows the class. The
 * card says what to do ("scan the code, or go to <address> and type"), shows the class code
 * big enough to read from the back of the room, with the QR beside it (under it on a phone),
 * and one button that puts the class screen on the projector.
 */

export interface JoiningCardAttrs {
	mid: string;
	code: string | undefined;
	url: string;
	title: string;
	/** The address students type: the site's host, no protocol. */
	address: string;
}

export const JoiningCard: m.Component<JoiningCardAttrs> = {
	view({ attrs }) {
		return m('section.joining-card', { 'aria-labelledby': 'joining-card-title' }, [
			m('h2.joining-card__title#joining-card-title', t('console.join.title')),
			m(QRShare, {
				quietActions: true,
				url: attrs.url,
				title: attrs.title,
				label: t('console.join.how', { address: attrs.address }),
				afterLabel: attrs.code
					? m(
							'strong.joining-card__value',
							{
								dir: 'ltr',
								'aria-label': `${t('teacher.console.code')}: ${attrs.code}`,
								'data-testid': 'joining-code',
							},
							attrs.code,
						)
					: null,
				extraAction: m(
					'button.btn.btn--secondary.btn--small.qr-share__action',
					{
						type: 'button',
						'data-testid': 'joining-projector',
						onclick: () => showHere(attrs.mid, () => undefined),
					},
					t('console.join.projector'),
				),
			}),
		]);
	},
};
