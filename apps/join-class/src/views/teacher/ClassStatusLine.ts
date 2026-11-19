import m from 'mithril';
import { t } from '@/lib/i18n';
import { announcementFor, classStatusFor } from '@/lib/classroom/classStatus';
import type {
	Announcement,
	ClassStatus,
	ClassStatusInput,
	StatusSnapshot,
} from '@/lib/classroom/classStatus';
import { icon } from './ConsoleIcon';

/**
 * "What the class is doing" (design 4): one line for the step, the "ready to move on" mark, and
 * the attention items (stuck tables, students without a table), each with a "Show" button that
 * jumps to the thing. The visible line is NOT a live region (it changes with every student); one
 * hidden polite region says only the transitions, once, after a short pause.
 */

export interface ClassStatusLineAttrs {
	input: ClassStatusInput;
	/** The words of the transitions: the step's name and the primary button's label. */
	words: { stepName: string; primaryLabel: string };
	/** The "no device (x/y)" entry at Proposals, drawn inside the line. */
	entry?: m.Children;
}

const ANNOUNCE_DEBOUNCE_MS = 1000;

interface LineState {
	previous: StatusSnapshot | null;
	pending: Announcement | null;
	timer: number | null;
	spoken: string;
	lastSpoken: string;
}

function snapshotOf(input: ClassStatusInput, status: ClassStatus): StatusSnapshot {
	return {
		stepKey: input.stepKey,
		status: input.status,
		ready: status.ready,
		stuckTables: input.stuckTables,
	};
}

function speak(state: LineState): void {
	const next = state.pending;
	state.timer = null;
	state.pending = null;
	if (!next) return;
	const text = t(next.key, next.params);
	if (text === state.lastSpoken) return;
	state.lastSpoken = text;
	state.spoken = text;
	m.redraw();
}

/** Remember the moment; queue what the live region should say when something changed. */
function track(
	state: LineState,
	input: ClassStatusInput,
	status: ClassStatus,
	words: ClassStatusLineAttrs['words'],
): void {
	const now = snapshotOf(input, status);
	const heard = announcementFor(state.previous, now, words);
	state.previous = now;
	if (!heard) return;
	state.pending = heard;
	if (state.timer !== null) window.clearTimeout(state.timer);
	state.timer = window.setTimeout(() => speak(state), ANNOUNCE_DEBOUNCE_MS);
}

function jumpToStuck(table: number): void {
	const card = document.querySelector<HTMLElement>(`[data-table="${table}"]`);
	card?.scrollIntoView({ block: 'center' });
	card?.querySelector<HTMLElement>('.table-card__title')?.focus();
}

function jumpToUnplaced(): void {
	const strip = document.querySelector<HTMLElement>('.unplaced');
	strip?.scrollIntoView({ block: 'center' });
	strip?.querySelector<HTMLElement>('select, button')?.focus();
}

function showButton(onclick: () => void): m.Vnode {
	return m(
		'button.btn.btn--tertiary.btn--small.class-status__show',
		{ type: 'button', 'data-testid': 'status-show', onclick },
		t('console.status.show'),
	);
}

function attention(status: ClassStatus): m.Children {
	return [
		status.stuck
			? m('span.class-status__attention', { 'data-testid': 'status-stuck' }, [
					m('span.class-status__glyph', { 'aria-hidden': 'true' }, '⏱'),
					t(status.stuck.textKey, status.stuck.params),
					showButton(() => status.stuck && jumpToStuck(status.stuck.firstTable)),
				])
			: null,
		status.unseated > 0 ? showButton(jumpToUnplaced) : null,
	];
}

function readyMark(status: ClassStatus): m.Children {
	if (!status.ready) return null;

	return m('span.class-status__ready', { 'data-testid': 'status-ready' }, [
		icon('check'),
		m('span', t('console.ready')),
	]);
}

export const ClassStatusLine: m.Component<ClassStatusLineAttrs> = {
	oninit(vnode) {
		const state = vnode.state as unknown as LineState;
		Object.assign(state, {
			previous: null,
			pending: null,
			timer: null,
			spoken: '',
			lastSpoken: '',
		});
	},

	onremove(vnode) {
		const state = vnode.state as unknown as LineState;
		if (state.timer !== null) window.clearTimeout(state.timer);
	},

	view(vnode) {
		const { input, words, entry } = vnode.attrs;
		const state = vnode.state as unknown as LineState;
		const status = classStatusFor(input);
		track(state, input, status, words);

		return m('div.class-status', [
			status.hidden
				? null
				: m('p.class-status__line', { 'data-testid': 'class-status' }, [
						m('span.class-status__text', t(status.textKey, status.params)),
						attention(status),
						entry ?? null,
					]),
			readyMark(status),
			m('p.visually-hidden', { role: 'status', 'aria-live': 'polite' }, state.spoken),
		]);
	},
};
