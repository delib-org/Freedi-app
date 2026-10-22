import m from 'mithril';
import type { LessonStatus } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classSetLessonStatus } from '@/lib/classroom/api';

/**
 * "End the lesson?" (IA 13.6, UX 13.E): one native <dialog>, so focus is
 * trapped, Escape cancels and focus goes back to the control that opened it.
 * "End" is the default and has focus; the other way out is "Keep open for
 * students" (not offered when the lesson is already open). After either, the
 * teacher goes to the lesson list, where the row shows the new status.
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

async function choose(mainId: string, choice: Choice): Promise<void> {
	if (pending) return;
	pending = choice;
	failed = null;
	m.redraw();
	try {
		await classSetLessonStatus({ mainId, action: choice });
		isOpen = false;
		m.route.set('/t');
	} catch (err) {
		console.error('[EndChoice] changing the lesson status failed:', err);
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
		optionButton(mainId, 'end', 'console.end_now', 'btn--primary', { autofocus: true }),
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
			{ type: 'button', disabled: pending !== null, onclick: closeEndChoice },
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
