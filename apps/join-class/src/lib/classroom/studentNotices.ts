import m from 'mithril';
import '@/styles/student-notice.scss';
import { t } from '@/lib/i18n';
import { stepLabel } from '@/lib/lesson';
import { detectNotice } from './noticeLogic';
import type { Notice, NoticeSnapshot } from './noticeLogic';

/**
 * The phone's one-time line after the teacher moved the class back or restarted
 * the turns or the vote (IA 18.2). A small live-region toast mounted beside the
 * app, so no step screen has to know about it. It watches whatever the phone
 * already receives (`read` builds a snapshot) and says nothing about a normal
 * forward move. Other features speak through the same host with
 * `showStudentNotice` (IA 22: "New reply to your proposal", tappable).
 */

/** How long the line stays on the screen. */
const NOTICE_VISIBLE_MS = 6000;

export interface NoticeAction {
	label: string;
	run: () => void;
}

const notice: { line: string; action: NoticeAction | null; timer?: ReturnType<typeof setTimeout> } =
	{ line: '', action: null };

function lineOf(found: Notice): string {
	if (found.kind === 'back') return t('lesson.back_line', { name: stepLabel(found.stepKey) });

	return t(found.kind === 'turns' ? 'turn.restarted' : 'vote.restarted');
}

/** Show one line for a few seconds; with an action the line carries a button. */
export function showStudentNotice(line: string, action: NoticeAction | null = null): void {
	notice.line = line;
	notice.action = action;
	clearTimeout(notice.timer);
	notice.timer = setTimeout(() => {
		notice.line = '';
		notice.action = null;
		m.redraw();
	}, NOTICE_VISIBLE_MS);
	m.redraw();
}

function clearNotice(): void {
	clearTimeout(notice.timer);
	notice.line = '';
	notice.action = null;
}

export function startStudentNotices(read: () => NoticeSnapshot | null): () => void {
	const host = document.createElement('div');
	document.body.appendChild(host);
	let previous: NoticeSnapshot | null = null;

	// The view runs on every redraw (every listener delivery redraws), which is
	// when the phone's data has changed: the comparison belongs here.
	const observe = (): void => {
		const next = read();
		if (!next) return;
		const found = detectNotice(previous, next);
		previous = next;
		if (!found) return;
		notice.line = lineOf(found);
		notice.action = null;
		clearTimeout(notice.timer);
		notice.timer = setTimeout(() => {
			notice.line = '';
			m.redraw();
		}, NOTICE_VISIBLE_MS);
	};

	m.mount(host, {
		view() {
			observe();
			const action = notice.action;

			return m(
				'div.student-notice',
				{ role: 'status', 'aria-live': 'polite', class: action ? 'student-notice--action' : '' },
				notice.line
					? [
							m('span', notice.line),
							action
								? m(
										'button.student-notice__action',
										{
											type: 'button',
											'data-testid': 'student-notice-action',
											onclick: () => {
												clearNotice();
												action.run();
											},
										},
										action.label,
									)
								: null,
						]
					: null,
			);
		},
	});

	return () => {
		clearNotice();
		m.mount(host, null);
		host.remove();
	};
}
