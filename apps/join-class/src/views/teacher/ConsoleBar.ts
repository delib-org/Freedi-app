import m from 'mithril';
import type { LessonStatus, LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { LessonMore } from './LessonMore';
import { TeacherBackBar } from './TeacherBackBar';
import { changeLessonStatus } from './consoleActions';
import { planBack } from './consoleBack';
import { consoleState, dismissFailure, isBusy } from './consoleState';

/**
 * The console's top band and its failure line (split out of TeacherConsole.ts): back bar,
 * title, the class code the teacher reads aloud, "Pause the lesson" (always visible) and
 * "More", which holds everything else about the lesson (design 6.1).
 */

/** "Pause the lesson": the one lesson control that stays out of the menu (Tal, 2026-11-19). */
function pauseButton(mid: string, status: LessonStatus | null): m.Children {
	if (status !== 'live' && status !== 'open') return null;
	const pausing = isBusy('status:pause');
	// A resume in flight holds the button too, but it keeps its own words ("Pausing…" would be false).
	const held = pausing || isBusy('status:resume');

	return m(
		'button.btn.btn--secondary.btn--small.console__pause',
		{
			type: 'button',
			'data-testid': 'console-pause',
			disabled: held,
			'aria-busy': pausing ? 'true' : undefined,
			onclick: () => void changeLessonStatus(mid, 'pause'),
		},
		[
			m('span.status-mark.status-mark--paused', { 'aria-hidden': 'true' }),
			m('span', pausing ? t('console.busy_pausing') : t('console.pause')),
		],
	);
}

export function backBar(mid: string): m.Children {
	const back = planBack(mid);

	return m(TeacherBackBar, { href: back.href, label: back.label });
}

export interface HeaderMore {
	stepKey: LessonStepKey;
	connected: boolean;
	qr: { shown: boolean; toggle: () => void };
}

export function header(
	mid: string,
	lessonName: string | undefined,
	code: string | undefined,
	status: LessonStatus | null,
	more?: HeaderMore,
): m.Vnode {
	return m('header.console__bar', [
		m('h1.console__title', lessonName ?? t('teacher.console.title')),
		code
			? m('p.console__code', [
					m('span.console__code-label', `${t('teacher.console.code')}:`),
					m('strong.console__code-value', { dir: 'ltr' }, code),
				])
			: null,
		pauseButton(mid, status),
		more && status
			? m(LessonMore, {
					mid,
					status,
					stepKey: more.stepKey,
					connected: more.connected,
					qr: more.qr,
				})
			: null,
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
