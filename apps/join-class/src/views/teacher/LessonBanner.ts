import m from 'mithril';
import type { LessonStatus } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { isBusy } from './consoleState';

/**
 * The band under the console bar when the lesson is not simply live (UX 13.E):
 *   paused  "the lesson is paused" + the one primary control, "Resume"
 *   open    "open to students" + "End the lesson" (opens the end choice)
 *   ended   "the lesson has ended" + "Reopen"
 * A polite status region, so the words are announced once when it appears.
 */

export interface LessonBannerAttrs {
	status: LessonStatus;
	onResume: () => void;
	onEnd: () => void;
	onReopen: () => void;
}

const BANNER = {
	paused: { text: 'lesson.paused.title', mark: 'paused' },
	open: { text: 'console.open_banner', mark: 'open' },
	ended: { text: 'console.ended_banner', mark: 'ended' },
} as const;

type BannerStatus = keyof typeof BANNER;

function action(attrs: LessonBannerAttrs): m.Vnode {
	if (attrs.status === 'paused') {
		const busy = isBusy('status:resume');

		return m(
			'button.btn.btn--primary.lesson-banner__action',
			{
				type: 'button',
				'data-testid': 'console-resume',
				disabled: busy,
				'aria-busy': busy ? 'true' : undefined,
				onclick: attrs.onResume,
				// The button the teacher pressed is gone: the next one gets focus.
				oncreate: (vnode: m.VnodeDOM) => (vnode.dom as HTMLElement).focus(),
			},
			busy ? t('console.opening') : t('console.resume'),
		);
	}
	if (attrs.status === 'open') {
		return m(
			'button.btn.btn--secondary.lesson-banner__action',
			{ type: 'button', 'data-testid': 'console-end-open', onclick: attrs.onEnd },
			t('console.end'),
		);
	}
	const busy = isBusy('status:reopen');

	return m(
		'button.btn.btn--primary.lesson-banner__action',
		{
			type: 'button',
			'data-testid': 'console-reopen',
			disabled: busy,
			'aria-busy': busy ? 'true' : undefined,
			onclick: attrs.onReopen,
		},
		busy ? t('console.opening') : t('teacher.row.reopen'),
	);
}

export const LessonBanner: m.Component<LessonBannerAttrs> = {
	view({ attrs }) {
		if (attrs.status === 'live') return null;
		const spec = BANNER[attrs.status as BannerStatus];

		return m('div.lesson-banner', { class: `lesson-banner--${attrs.status}`, role: 'status' }, [
			m('span.lesson-banner__text', [
				m('span.status-mark', { class: `status-mark--${spec.mark}`, 'aria-hidden': 'true' }),
				m('span', t(spec.text)),
			]),
			action(attrs),
		]);
	},
};
