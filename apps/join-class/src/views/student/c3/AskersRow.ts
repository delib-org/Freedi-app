import m from 'mithril';
import { t } from '@/lib/i18n';
import type { AskerChip } from '@/lib/classroom/turnMoment';

export interface AskersRowAttrs {
	chips: readonly AskerChip[];
	/** The phone's own uid: that chip gets "(me)" after the name. */
	uid: string;
}

const MARK: Record<AskerChip['state'], string> = { done: '✓', now: '?', wait: '' };
const LABEL_KEY: Record<AskerChip['state'], string> = {
	done: 'turn.asker_done',
	now: 'turn.asker_now',
	wait: 'turn.asker_wait',
};

/**
 * Who asks (UX 16.B): one chip per tablemate with a device, in seating order.
 * Done = filled with a check, asking now = a question mark and bold, not yet =
 * outline only. Not interactive: a list a screen reader reads name by name.
 */
export const AskersRow: m.Component<AskersRowAttrs> = {
	view({ attrs }) {
		return m(
			'ul.askers',
			{ 'aria-label': t('turn.askers_label'), 'data-testid': 'askers-row' },
			attrs.chips.map((chip) =>
				m(
					'li.askers__chip',
					{
						key: chip.uid,
						class: `askers__chip--${chip.state}`,
						'data-state': chip.state,
						'data-uid': chip.uid,
						'aria-label': t(LABEL_KEY[chip.state], { name: chip.name }),
					},
					[
						MARK[chip.state]
							? m('span.askers__mark', { 'aria-hidden': 'true' }, MARK[chip.state])
							: null,
						m('span.askers__name', { 'aria-hidden': 'true' }, chip.name),
						chip.uid === attrs.uid
							? m('span.askers__me', { 'aria-hidden': 'true' }, t('turn.me'))
							: null,
					],
				),
			),
		);
	},
};
