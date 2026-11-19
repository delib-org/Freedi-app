import m from 'mithril';
import '@/styles/registration.scss';
import { t } from '@/lib/i18n';
import type { CopyOffer } from '@/lib/classroom/registrationLogic';
import { copyResult } from './registrationActions';

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
		if (attrs.offer.kind === 'ordinary') return null;

		return m('div.copy-seating', [
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
