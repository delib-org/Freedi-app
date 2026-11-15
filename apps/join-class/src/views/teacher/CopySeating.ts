import m from 'mithril';
import '@/styles/registration.scss';
import { t } from '@/lib/i18n';
import type { CopyOffer } from '@/lib/classroom/registrationLogic';
import { tablesRegistrationUrl } from '@/lib/classroom/registrationLogic';
import { askConfirm } from './ConfirmDialog';
import { consoleState, isBusy } from './consoleState';
import { copyResult, copySeating } from './registrationActions';

/**
 * The Tables step of a connected lesson (IA tables-class-bridge 5.3). Instead of
 * dealing the class (`classAssignTables` is refused here) the teacher brings the
 * registration's tables: "הבאת השולחנות מההרשמה", and later "עדכון מההרשמה",
 * which asks first because it undoes moves made by hand. Not published yet: the
 * step says what is missing and links to the registration in Tables.
 */

export interface CopySeatingAttrs {
	mid: string;
	registrationId: string;
	offer: CopyOffer;
	/** Students of the roster who sit at no table ("N בלי שולחן"). */
	withoutTable: number;
}

function resultLine(mid: string): m.Children {
	const result = copyResult.mainId === mid ? copyResult.value : null;
	if (!result) return null;

	return m(
		'p.copy-seating__result',
		{ role: 'status', 'data-testid': 'copy-seating-result' },
		t('console.copy_seating.result', {
			tables: result.tables,
			arrived: result.arrived,
			reserved: result.reserved,
		}),
	);
}

export const CopySeating: m.Component<CopySeatingAttrs> = {
	view({ attrs }) {
		const { offer } = attrs;
		if (offer.kind === 'ordinary') return null;
		const busy = isBusy('registration:copy');

		return m('div.copy-seating', [
			offer.kind === 'not-ready'
				? [
						m(
							'p.copy-seating__reason',
							{ role: 'status', 'data-testid': 'copy-seating-reason' },
							t(offer.reasonKey),
						),
						m(
							'a.btn.btn--tertiary',
							{
								href: tablesRegistrationUrl(attrs.registrationId),
								target: '_blank',
								rel: 'noopener',
							},
							t('console.register_ahead.manage'),
						),
					]
				: m(
						'button.btn.btn--primary.switch-band__action',
						{
							type: 'button',
							'data-testid': 'copy-seating',
							disabled: consoleState.held || busy,
							'aria-busy': busy ? 'true' : undefined,
							onclick: () => {
								if (offer.kind === 'copy') {
									void copySeating(attrs.mid, false);

									return;
								}
								askConfirm({
									title: t('console.copy_seating.again_title'),
									body: t('console.copy_seating.again_body'),
									yesLabel: t('console.copy_seating.again_yes'),
									destructive: true,
									run: () => void copySeating(attrs.mid, true),
								});
							},
						},
						t(offer.kind === 'again' ? 'console.copy_seating.again' : 'console.copy_seating'),
					),
			resultLine(attrs.mid),
			attrs.withoutTable > 0
				? m(
						'p.copy-seating__result',
						{ 'data-testid': 'without-table' },
						t('console.without_table', { count: attrs.withoutTable }),
					)
				: null,
		]);
	},
};
