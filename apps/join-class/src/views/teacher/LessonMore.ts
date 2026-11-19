import m from 'mithril';
import type { LessonStatus, LessonStepKey } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { ConsoleSettings } from './ConsoleSettings';
import { Disclosure } from './Disclosure';
import { openEndChoice } from './EndChoice';
import { ProjectorItems } from './ProjectorMenu';

/**
 * "More" in the top bar (design 6.1): everything the teacher does once per lesson rather
 * than at every step. Closed by default. The red item (end the lesson) is last, after a divider.
 */

export const LESSON_MORE_ID = 'lesson-more';

export interface LessonMoreAttrs {
	mid: string;
	status: LessonStatus;
	stepKey: LessonStepKey;
	/** The lesson is connected to a registration. */
	connected: boolean;
	qr: { shown: boolean; toggle: () => void };
}

/** Students are joining shows the QR code on the board already: no item for it there. */
function qrItem(attrs: LessonMoreAttrs, close: () => void): m.Children {
	if (attrs.stepKey === 'waiting') return null;

	return m(
		'button.btn.btn--secondary.more-panel__item',
		{
			type: 'button',
			'aria-pressed': attrs.qr.shown ? 'true' : 'false',
			'data-testid': 'console-qr',
			onclick: () => {
				attrs.qr.toggle();
				close();
			},
		},
		t('console.qr'),
	);
}

function linkItem(href: string, label: string, close: () => void, testId: string): m.Children {
	return m(
		m.route.Link,
		{
			class: 'btn btn--secondary more-panel__item',
			href,
			'data-testid': testId,
			onclick: close,
		},
		label,
	);
}

function content(attrs: LessonMoreAttrs, close: () => void): m.Children {
	const { mid } = attrs;
	const showsRegistration = attrs.connected || attrs.stepKey === 'waiting';

	return [
		qrItem(attrs, close),
		m('section.more-panel__group', [
			m('h3.more-panel__heading', t('teacher.screen.title')),
			m(ProjectorItems, { mid, onDone: close }),
		]),
		linkItem(
			`/t/${mid}?view=student`,
			t('console.student_screen'),
			close,
			'console-student-screen',
		),
		linkItem(`/t/${mid}/plan`, t('teacher.row.plan'), close, 'console-plan-link'),
		m(ConsoleSettings),
		showsRegistration
			? linkItem(
					`/t/${mid}/registration`,
					t(attrs.connected ? 'console.register_ahead.manage' : 'console.register_ahead'),
					close,
					'console-registration-link',
				)
			: null,
		attrs.status === 'ended'
			? null
			: m('div.more-panel__danger', [
					m(
						'button.btn.btn--danger-outline.more-panel__item',
						{
							type: 'button',
							'data-testid': 'console-end',
							onclick: () => {
								close();
								openEndChoice();
							},
						},
						t('console.end'),
					),
				]),
	];
}

export const LessonMore: m.Component<LessonMoreAttrs> = {
	view({ attrs }) {
		return m(Disclosure, {
			id: LESSON_MORE_ID,
			label: t('console.more'),
			ariaLabel: t('console.more_label'),
			testId: 'console-more',
			panelLabel: t('console.more_label'),
			align: 'end',
			content: (close: () => void) => content(attrs, close),
		});
	},
};
