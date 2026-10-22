import m from 'mithril';
import { t } from '@/lib/i18n';
import { enterFullscreen } from '@/lib/fullscreen';
import { openProjectorWindow, projectorPath } from '@/lib/classroom/projectorScreen';
import { bindOutsideClose, closePopover, popoverKeydown, unbindOutsideClose } from './barPopover';

/**
 * The console bar's "Projector" menu (UX 15.A): two actions, each with its
 * help line, so a teacher can tell which one is theirs. "Projector in a new
 * window" is for two screens, "Show on this screen" for one mirrored computer.
 */

const HELP_WINDOW_ID = 'projector-help-window';
const HELP_HERE_ID = 'projector-help-here';

/** Set after a blocked pop-up; cleared when the panel closes or the next open works. */
let blocked = false;

interface MenuAttrs {
	mid: string;
}

function detailsOf(event: Event): HTMLDetailsElement | null {
	return (event.currentTarget as HTMLElement).closest('details');
}

function openInWindow(mid: string, event: Event): void {
	const details = detailsOf(event);
	let opened = false;
	try {
		opened = openProjectorWindow(mid, {
			open: (url, name, features) => window.open(url, name, features),
			origin: window.location.origin,
		});
	} catch (err) {
		console.error('[ProjectorMenu] opening the projector window failed:', err);
	}
	blocked = !opened;
	if (opened && details) closePopover(details, true);
}

function showHere(mid: string, event: Event): void {
	const details = detailsOf(event);
	// the click is a user gesture in this document, so ask for full screen first
	void enterFullscreen();
	if (details) closePopover(details, false);
	m.route.set(projectorPath(mid, 'here'), {}, { state: { fromConsole: true } });
}

function glyph(kind: 'window' | 'here'): m.Vnode {
	return m(
		'svg.projector-menu__glyph',
		{ viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
		kind === 'window'
			? [
					m('rect', { x: 1.5, y: 4.5, width: 9, height: 9, rx: 1 }),
					m('path', { d: 'M5.5 4.5V2.5h9v9h-2' }),
				]
			: [
					m('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 1 }),
					m('path', { d: 'M5 6V5h1M11 6V5h-1M5 10v1h1M11 10v1h-1' }),
				],
	);
}

function item(
	kind: 'window' | 'here',
	label: string,
	helpId: string,
	onclick: (event: Event) => void,
): m.Vnode {
	return m(
		'button.btn.btn--secondary.projector-menu__item',
		{
			type: 'button',
			'aria-describedby': helpId,
			'data-testid': `projector-${kind}`,
			onclick,
		},
		[glyph(kind), m('span', label)],
	);
}

export const ProjectorMenu: m.Component<MenuAttrs> = {
	oncreate: bindOutsideClose,

	onremove: unbindOutsideClose,

	view(vnode) {
		const { mid } = vnode.attrs;

		return m(
			'details.projector-menu',
			{
				onkeydown: popoverKeydown,
				ontoggle: (event: Event) => {
					if (!(event.target as HTMLDetailsElement).open) blocked = false;
				},
			},
			[
				m('summary.btn.btn--tertiary.btn--small.projector-menu__toggle', [
					m('span', t('teacher.screen.title')),
					m('span.projector-menu__chevron', { 'aria-hidden': 'true' }),
				]),
				m('.projector-menu__panel', [
					item('window', t('teacher.screen.open_window'), HELP_WINDOW_ID, (e) =>
						openInWindow(mid, e),
					),
					m('p.projector-menu__help', { id: HELP_WINDOW_ID }, t('teacher.screen.open_window_help')),
					blocked
						? m('p.projector-menu__blocked', { role: 'alert' }, t('teacher.screen.blocked'))
						: null,
					item('here', t('teacher.screen.show_here'), HELP_HERE_ID, (e) => showHere(mid, e)),
					m('p.projector-menu__help', { id: HELP_HERE_ID }, t('teacher.screen.show_here_help')),
				]),
			],
		);
	},
};
