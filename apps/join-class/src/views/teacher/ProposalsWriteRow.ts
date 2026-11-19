import m from 'mithril';
import { t } from '@/lib/i18n';
import type { ProposalsWriter } from '@/lib/classroom/proposalsWriter';

/**
 * The Proposals write row of a table card (Trello 6KEXvzXK): who holds the pen
 * and how many have sent or passed, in words with a pen glyph. Same look as the
 * speaker row of the talk step.
 */

export interface ProposalsWriteRowAttrs {
	writer: ProposalsWriter;
	/** The pen holder's name (a no-device member never holds the pen). */
	name: string;
}

export const ProposalsWriteRow: m.Component<ProposalsWriteRowAttrs> = {
	view({ attrs }) {
		const { writer, name } = attrs;
		const counts = { sent: writer.sent, total: writer.total };
		if (writer.uid === null) {
			return m(
				'p.speaker-row.speaker-row--nobody',
				{ 'data-testid': 'table-writer' },
				t('console.writing_nobody', counts),
			);
		}

		return m('p.speaker-row.speaker-row--speaking', { 'data-testid': 'table-writer' }, [
			m('span.speaker-row__icon', { 'aria-hidden': 'true' }, '\u{270F}\u{FE0F}'),
			m('span.speaker-row__text', t('console.writing_now', { name, ...counts })),
		]);
	},
};
