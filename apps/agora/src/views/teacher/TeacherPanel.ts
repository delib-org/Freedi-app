import m from 'mithril';
import { t } from '../../lib/i18n';

export interface TeacherPanelAttrs {
	id: string;
	title: string;
	/** "· 4" beside the title — how many rows the panel holds */
	count?: number;
	/** The settings sheet is a little wider: the plan editor's arrows need it */
	wide?: boolean;
	onClose: () => void;
}

const PHONE_QUERY = '(max-width: 600px)';
/** Matches --motion-base, which the way in uses */
const EXIT_MS = 300;

/**
 * A panel that slides over the board from the inline end and hosts one of
 * the console's secondary faces: the class list, what the class wrote, or
 * the settings.
 *
 * On a laptop it is not modal — no scrim, the board still scrolls, and the
 * strip's NEXT button stays under the teacher's hand while they answer a
 * student. On a phone it is a full-screen sheet, and the page behind it
 * holds still. Focus lands on the close button and goes back to whatever
 * opened it; the caller keeps that element.
 */
export function TeacherPanel(): m.Component<TeacherPanelAttrs> {
	let closeNow: (() => void) | null = null;

	function onKey(event: KeyboardEvent): void {
		if (event.key === 'Escape') closeNow?.();
	}

	return {
		oncreate({ dom, attrs }) {
			closeNow = attrs.onClose;
			document.addEventListener('keydown', onKey);
			if (window.matchMedia(PHONE_QUERY).matches) document.body.classList.add('is-panel-open');
			(dom.querySelector('.teacher-panel__close') as HTMLElement | null)?.focus();
		},
		onupdate({ attrs }) {
			closeNow = attrs.onClose;
		},
		onbeforeremove({ dom }) {
			// Slide out the way it slid in. The CSS keyframes only play on the way
			// in, so the exit is animated here; nothing to wait for when motion
			// is off or the browser has no Animations API.
			const panel = dom as HTMLElement;
			if (typeof panel.animate !== 'function') return;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			const phone = window.matchMedia(PHONE_QUERY).matches;
			const rtl = document.documentElement.dir === 'rtl';
			const away = phone ? 'translateY(24px)' : `translateX(${rtl ? '-100%' : '100%'})`;
			const exit = panel.animate(
				[
					{ transform: 'translate(0)', opacity: 1 },
					{ transform: away, opacity: phone ? 0 : 1 },
				],
				{ duration: EXIT_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
			);

			return exit.finished.then(
				() => undefined,
				() => undefined,
			);
		},
		onremove() {
			document.removeEventListener('keydown', onKey);
			document.body.classList.remove('is-panel-open');
			closeNow = null;
		},

		view({ attrs, children }) {
			const { id, title, count, wide, onClose } = attrs;
			const phone = window.matchMedia(PHONE_QUERY).matches;
			const titleId = `${id}-title`;

			return m(
				'.teacher-panel',
				{
					id,
					role: 'dialog',
					'aria-modal': phone ? 'true' : 'false',
					'aria-labelledby': titleId,
					class: wide ? 'teacher-panel--settings' : undefined,
				},
				[
					m('header.teacher-panel__head', [
						m('h3.teacher-panel__title', { id: titleId }, [
							title,
							count !== undefined ? m('span.teacher-panel__count', ` · ${count}`) : null,
						]),
						m(
							'button.teacher-panel__close',
							{ type: 'button', 'aria-label': t('common.close'), onclick: onClose },
							'✕',
						),
					]),
					m('.teacher-panel__body', children),
				],
			);
		},
	};
}
