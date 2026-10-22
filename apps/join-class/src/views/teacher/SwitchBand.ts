import m from 'mithril';
import type { LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { ALL_TABLES_RATE_STEPS } from '@/lib/classroom/consoleHelpers';
import { isBusy } from './consoleState';
import type { ConsoleView } from './consoleState';

/**
 * The switch band (UX section 5, 48 px): the current step's actions as
 * secondary buttons at the start, the "tables | what they wrote" segment at the
 * end. Never primary: primary is reserved for the rail's forward control.
 */

export interface SwitchBandAttrs {
	/** Paused or ended: the step actions are disabled (looking stays possible). */
	held?: boolean;
	stepKey: LessonStepKey;
	view: ConsoleView;
	hasTables: boolean;
	hasChallenge: boolean;
	plenum: boolean;
	ballotFrozen: boolean;
	ballotClosed: boolean;
	onView: (view: ConsoleView) => void;
	onSplit: (replace: boolean) => void;
	onAllToRate: () => void;
	onPlenum: () => void;
	onFreeze: () => void;
	onCloseVote: () => void;
}

const TEST_IDS: Record<string, string> = {
	assign: 'console-assign-tables',
	'all:rate': 'console-all-rate',
	plenum: 'console-plenum',
	freeze: 'console-freeze-vote',
	close: 'console-close-vote',
};

/** Set by the view before it draws the actions below. */
let heldNow = false;

function action(label: string, key: string, onclick: () => void, disabled = false): m.Vnode {
	return m(
		'button.btn.btn--secondary.switch-band__action',
		{
			type: 'button',
			'data-action': key,
			'data-testid': TEST_IDS[key],
			disabled: disabled || heldNow || isBusy(key),
			onclick,
		},
		label,
	);
}

function stepActions(attrs: SwitchBandAttrs): m.Children {
	const { stepKey } = attrs;
	const actions: m.Children[] = [];
	if (stepKey === 'tables') {
		actions.push(
			attrs.hasTables
				? action(t('console.resplit'), 'assign', () => attrs.onSplit(true))
				: action(t('console.split'), 'assign', () => attrs.onSplit(false)),
		);
	}
	if (ALL_TABLES_RATE_STEPS.includes(stepKey)) {
		actions.push(action(t('console.all_tables_rate'), 'all:rate', attrs.onAllToRate));
	}
	if (stepKey === 'proposals') {
		actions.push(
			attrs.plenum
				? m(
						'button.btn.switch-band__action.switch-band__action--on',
						{
							type: 'button',
							disabled: true,
							'data-action': 'plenum',
							'data-testid': TEST_IDS.plenum,
						},
						t('console.plenum_on'),
					)
				: action(t('console.plenum'), 'plenum', attrs.onPlenum, !attrs.hasChallenge),
		);
	}
	if (stepKey === 'vote') {
		actions.push(
			action(
				t('console.freeze'),
				'freeze',
				attrs.onFreeze,
				attrs.ballotFrozen || attrs.ballotClosed,
			),
			action(
				t('console.close_vote'),
				'close',
				attrs.onCloseVote,
				!attrs.ballotFrozen || attrs.ballotClosed,
			),
		);
	}

	return actions;
}

function segment(attrs: SwitchBandAttrs): m.Vnode {
	const item = (view: ConsoleView, labelKey: string): m.Vnode =>
		m(
			'button.switch-band__segment-btn',
			{
				type: 'button',
				'data-view': view,
				'aria-pressed': attrs.view === view ? 'true' : 'false',
				class: attrs.view === view ? 'switch-band__segment-btn--on' : '',
				onclick: () => attrs.onView(view),
			},
			t(labelKey),
		);

	return m('div.switch-band__segment', { role: 'group', 'aria-label': t('console.view_label') }, [
		item('tables', 'console.tables'),
		item('texts', 'console.texts'),
	]);
}

export const SwitchBand: m.Component<SwitchBandAttrs> = {
	view({ attrs }) {
		heldNow = attrs.held === true;

		return m('div.switch-band', [
			m('div.switch-band__actions', stepActions(attrs)),
			segment(attrs),
		]);
	},
};
