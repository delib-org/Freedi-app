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
 * forward move.
 */

/** How long the line stays on the screen. */
const NOTICE_VISIBLE_MS = 6000;

function lineOf(notice: Notice): string {
	if (notice.kind === 'back') return t('lesson.back_line', { name: stepLabel(notice.stepKey) });

	return t(notice.kind === 'turns' ? 'turn.restarted' : 'vote.restarted');
}

export function startStudentNotices(read: () => NoticeSnapshot | null): () => void {
	const host = document.createElement('div');
	document.body.appendChild(host);
	let previous: NoticeSnapshot | null = null;
	let line = '';
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	// The view runs on every redraw (every listener delivery redraws), which is
	// when the phone's data has changed: the comparison belongs here.
	const observe = (): void => {
		const next = read();
		if (!next) return;
		const notice = detectNotice(previous, next);
		previous = next;
		if (!notice) return;
		line = lineOf(notice);
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			line = '';
			m.redraw();
		}, NOTICE_VISIBLE_MS);
	};

	m.mount(host, {
		view() {
			observe();

			return m('div.student-notice', { role: 'status', 'aria-live': 'polite' }, line || null);
		},
	});

	return () => {
		clearTimeout(hideTimer);
		m.mount(host, null);
		host.remove();
	};
}
