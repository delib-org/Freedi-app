import m from 'mithril';
import { t } from '@/lib/i18n';
import { formatSpeakerTime } from '@/lib/classroom/consoleHelpers';
import type { ProposalsSpeaker } from '@/lib/classroom/proposalsSpeaker';

/**
 * The Proposals talk row of a table card (Trello 7WaCiZ3K): who speaks right now,
 * in words with a microphone glyph and the time left, or "Nobody is speaking".
 * The member chip of the speaker is marked too (MemberChip `speaking`).
 */

export interface ProposalsSpeakerRowAttrs {
	speaker: ProposalsSpeaker;
	/** The speaker's name (a no-device member included). */
	name: string;
}

export const ProposalsSpeakerRow: m.Component<ProposalsSpeakerRowAttrs> = {
	view({ attrs }) {
		const { speaker, name } = attrs;
		if (speaker.kind === 'nobody') {
			return m(
				'p.speaker-row.speaker-row--nobody',
				{ 'data-testid': 'table-speaker' },
				t('console.speaking_nobody'),
			);
		}

		return m('p.speaker-row.speaker-row--speaking', { 'data-testid': 'table-speaker' }, [
			m('span.speaker-row__icon', { 'aria-hidden': 'true' }, '\u{1F399}'),
			m('span.speaker-row__text', t('console.speaking_now', { name })),
			m('span.speaker-row__time', formatSpeakerTime(speaker.msLeft)),
		]);
	},
};
