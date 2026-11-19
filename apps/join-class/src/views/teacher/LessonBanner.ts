import m from 'mithril';
import type { LessonStatus } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { isBusy } from './consoleState';

/**
 * The band under the console bar when the lesson is not simply live (UX 13.E):
 *   paused  "the lesson is paused" ("Resume" is the console's primary button)
 *   open    "open to students" ("End the lesson" is in More)
 *   ended   "the lesson has ended" + "Reopen"
 * A polite status region, so the words are announced once when it appears.
 */

export interface LessonBannerAttrs {
	status: LessonStatus;
	onReopen: () => void;
}

const BANNER = {
	paused: { text: 'lesson.paused.title', mark: 'paused' },
	open: { text: 'console.open_banner', mark: 'open' },
	ended: { text: 'console.ended_banner', mark: 'ended' },
} as const;

type BannerStatus = keyof typeof BANNER;

function action(attrs: LessonBannerAttrs): m.Vnode | null {
	// Paused: the way out is the console's primary button ("Resume the lesson"), not a second one here.
	if (attrs.status === 'paused') return null;
	// Open to students: ending it is "End the lesson" in More; going back is the primary button.
	if (attrs.status === 'open') return null;
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
		busy ? t('console.busy_opening') : t('teacher.row.reopen'),
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
