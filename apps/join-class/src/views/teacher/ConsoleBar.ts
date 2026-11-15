import m from 'mithril';
import type { LessonStatus } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { ConsoleSettings } from './ConsoleSettings';
import { ProjectorMenu } from './ProjectorMenu';
import { TeacherBackBar } from './TeacherBackBar';
import { changeLessonStatus } from './consoleActions';
import { planBack } from './consoleBack';
import { consoleState, dismissFailure, isBusy } from './consoleState';
import { openEndChoice } from './EndChoice';

/**
 * The console's top band and its failure line (split out of TeacherConsole.ts):
 * back bar, title and code, the QR / projector / settings controls, and the
 * pause / end group.
 */

/** "Pause the lesson" and "End the lesson" (UX 13.E): the status group at the bar's end. */
function statusGroup(mid: string, status: LessonStatus | null): m.Children {
	if (status !== 'live' && status !== 'open') return null;
	const pausing = isBusy('status:pause');

	return m('div.console__status', [
		m(
			'button.btn.btn--secondary.btn--small.console__pause',
			{
				type: 'button',
				'data-testid': 'console-pause',
				disabled: pausing,
				'aria-busy': pausing ? 'true' : undefined,
				onclick: () => void changeLessonStatus(mid, 'pause'),
			},
			[
				m('span.status-mark.status-mark--paused', { 'aria-hidden': 'true' }),
				m('span', pausing ? t('console.busy_pausing') : t('console.pause')),
			],
		),
		// An open lesson keeps its "End the lesson" in the banner below.
		status === 'live'
			? m(
					'button.btn.btn--tertiary.btn--small.console__end',
					{ type: 'button', 'data-testid': 'console-end', onclick: openEndChoice },
					t('console.end'),
				)
			: null,
	]);
}

export function backBar(mid: string): m.Children {
	const back = planBack(mid);

	return m(TeacherBackBar, { href: back.href, label: back.label });
}

export function header(
	mid: string,
	lessonName: string | undefined,
	code: string | undefined,
	status: LessonStatus | null,
	qr: { shown: boolean; toggle: () => void },
): m.Vnode {
	return m('header.console__bar', [
		m('h1.console__title', lessonName ?? t('teacher.console.title')),
		code
			? m('p.console__code', [
					m('span.console__code-label', `${t('teacher.console.code')}:`),
					m('strong.console__code-value', { dir: 'ltr' }, code),
				])
			: null,
		m(
			'button.btn.btn--tertiary.console__qr-btn',
			{
				type: 'button',
				'aria-expanded': qr.shown ? 'true' : 'false',
				onclick: qr.toggle,
			},
			t('console.qr'),
		),
		m(ProjectorMenu, { mid }),
		m(m.route.Link, { class: 'console__link', href: `/t/${mid}/plan` }, t('teacher.row.plan')),
		m(ConsoleSettings),
		statusGroup(mid, status),
	]);
}

export function failureBanner(): m.Children {
	const failure = consoleState.failure;
	if (!failure) return null;

	return m('div.console__failure', { role: 'alert' }, [
		m('span', failure.message ?? t('console.failed', { label: failure.label })),
		m('button.btn.btn--secondary', { type: 'button', onclick: failure.retry }, t('console.retry')),
		m(
			'button.btn.btn--tertiary',
			{ type: 'button', onclick: dismissFailure },
			t('console.dismiss'),
		),
	]);
}
