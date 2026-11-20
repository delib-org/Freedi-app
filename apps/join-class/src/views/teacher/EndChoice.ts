import m from 'mithril';
import type { LessonStatus } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classSetLessonStatus } from '@/lib/classroom/api';
import { captureException } from '@/lib/sentry';
import { resultsAside } from './consoleConfirms';

/**
 * "End the lesson?" (IA 13.6, UX 13.E): one native <dialog>, so focus is
 * trapped, Escape cancels and focus goes back to the control that opened it.
 * "Cancel" has the focus, as in every other confirm (ending is not the default); the other way out is "Keep open for
 * students" (not offered when the lesson is already open). After either, the
 * teacher STAYS on the console: it says the lesson has ended, shows the decision, and its
 * primary button ("Back to the plan") takes the focus.
 */

type Choice = 'end' | 'keepOpen';

let isOpen = false;
let pending: Choice | null = null;
let failed: Choice | null = null;

export function openEndChoice(): void {
	isOpen = true;
	pending = null;
	failed = null;
	m.redraw();
}

function closeEndChoice(): void {
	if (pending) return;
	isOpen = false;
	m.redraw();
}

/** The dialog closes and the console redraws; the primary button is where the teacher goes next. */
function focusPrimary(): void {
	window.setTimeout(() => document.querySelector<HTMLElement>('.next-action__button')?.focus(), 0);
}

async function choose(mainId: string, choice: Choice): Promise<void> {
	if (pending) return;
	pending = choice;
	failed = null;
	m.redraw();
	try {
		await classSetLessonStatus({ mainId, action: choice });
		isOpen = false;
		focusPrimary();
	} catch (err) {
		captureException(err, { operation: 'EndChoice.choose', mainId, choice });
		failed = choice;
	} finally {
		pending = null;
		m.redraw();
	}
}

export interface EndChoiceAttrs {
	mainId: string;
	status: LessonStatus;
}

function optionButton(
	mainId: string,
	choice: Choice,
	labelKey: string,
	classes: string,
	extra: Record<string, unknown> = {},
): m.Vnode {
	return m(
		`button.btn.${classes}.end-choice__option`,
		{
			type: 'button',
			'data-choice': choice,
			disabled: pending !== null,
			'aria-busy': pending === choice ? 'true' : undefined,
			onclick: () => void choose(mainId, choice),
			...extra,
		},
		t(labelKey),
	);
}

function contents(attrs: EndChoiceAttrs): m.Children {
	const { mainId, status } = attrs;
	const offerKeepOpen = status !== 'open';
	const failedKey = failed === 'keepOpen' ? 'console.keep_open' : 'console.end_now';

	return [
		m('h2.end-choice__title#end-choice-title', t('console.end_confirm')),
		failed
			? m('p.end-choice__error', { role: 'alert' }, t('console.failed', { label: t(failedKey) }))
			: null,
		// Closed results mean no student rates the decision: say so, with the way to open them.
		m('div.end-choice__aside', resultsAside()),
		optionButton(mainId, 'end', 'console.end_now', 'btn--primary'),
		offerKeepOpen
			? [
					optionButton(mainId, 'keepOpen', 'console.keep_open', 'btn--secondary', {
						'aria-describedby': 'end-choice-help',
					}),
					m('p.end-choice__help#end-choice-help', t('console.keep_open_help')),
				]
			: null,
		m(
			'button.btn.btn--tertiary.end-choice__cancel',
			{ type: 'button', autofocus: true, disabled: pending !== null, onclick: closeEndChoice },
			t('common.cancel'),
		),
	];
}

function sync(dom: HTMLDialogElement): void {
	if (isOpen && !dom.open) dom.showModal();
	else if (!isOpen && dom.open) dom.close();
}

export const EndChoice: m.Component<EndChoiceAttrs> = {
	oncreate(vnode) {
		sync(vnode.dom as HTMLDialogElement);
	},
	onupdate(vnode) {
		sync(vnode.dom as HTMLDialogElement);
	},
	view({ attrs }) {
		return m(
			'dialog.end-choice',
			{
				'aria-labelledby': 'end-choice-title',
				// Escape: cancel through our own state, so a running write is never cut off.
				oncancel: (event: Event) => {
					event.preventDefault();
					closeEndChoice();
				},
				onclose: () => {
					if (isOpen && !pending) {
						isOpen = false;
						m.redraw();
					}
				},
			},
			isOpen ? contents(attrs) : null,
		);
	},
};
