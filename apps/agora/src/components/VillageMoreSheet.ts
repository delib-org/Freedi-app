import m from 'mithril';
import { t } from '../lib/i18n';
import { lookDots } from './LookPicker';
import type { AgoraThemeSeeds } from '@freedi/shared-types';

/**
 * Everything the village needs but a student almost never presses.
 *
 * Four controls used to sit on the playing screen — a style pill, a
 * full-width "flat view" strip, and the 3D tour's own sound and quality
 * buttons showing through the iframe. None of them is a move in the game,
 * and together they crowded out the four that are. They live behind one
 * gear now.
 *
 * Reuses the `.look-sheet` frame, as the teacher's thread does: a proven
 * bottom sheet and scrim. Escape is heard on the document, as in
 * TeacherThreadSheet: a handler on the sheet only hears keys while focus is
 * inside it.
 */

export interface VillageMoreSheetAttrs {
	/** Absent in a civic square, which wears Odyssey's colours by contract */
	look?: { seeds: AgoraThemeSeeds; onOpen: () => void };
	sound: boolean;
	onSound: (on: boolean) => void;
	/** The cheap world: no shadows, sparse grass, fewer frames */
	lightMode: boolean;
	onLightMode: (on: boolean) => void;
	/** Leave the 3D village for the flat view */
	onSimpleView: () => void;
	onClose: () => void;
}

export const VillageMoreSheet: m.Component<
	VillageMoreSheetAttrs,
	{
		returnFocus: HTMLElement | null;
		onClose: () => void;
		onKey: (event: KeyboardEvent) => void;
	}
> = {
	oninit(vnode) {
		vnode.state.returnFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		vnode.state.onClose = vnode.attrs.onClose;
		vnode.state.onKey = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			vnode.state.onClose();
			m.redraw();
		};
		document.addEventListener('keydown', vnode.state.onKey);
	},
	onbeforeupdate(vnode) {
		vnode.state.onClose = vnode.attrs.onClose;
	},
	onremove(vnode) {
		document.removeEventListener('keydown', vnode.state.onKey);
		// Opening the style picker hands focus to another dialog.
		queueMicrotask(() => {
			if (document.activeElement === document.body) vnode.state.returnFocus?.focus();
		});
	},
	view(vnode) {
		const { look, sound, onSound, lightMode, onLightMode, onSimpleView, onClose } = vnode.attrs;

		const toggle = (label: string, on: boolean, onchange: (next: boolean) => void): m.Children =>
			m(
				'button.village-more__row',
				{
					type: 'button',
					role: 'switch',
					'aria-checked': String(on),
					onclick: () => onchange(!on),
				},
				[
					m('span.village-more__label', label),
					m('span.village-more__switch', { 'aria-hidden': 'true' }),
				],
			);

		return m(
			'.look-sheet.village-more',
			{
				onclick: (event: MouseEvent) => {
					if (event.target === event.currentTarget) onClose();
				},
				onkeydown: (event: KeyboardEvent) => {
					if (event.key !== 'Tab') return;
					const buttons = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
						'button:not(:disabled)',
					);
					const first = buttons[0];
					const last = buttons[buttons.length - 1];
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last?.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				},
			},
			m(
				'.look-sheet__panel.village-more__panel',
				{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'village-more-title' },
				[
					m('.look-sheet__head', [
						m('h2.look-sheet__title#village-more-title', t('village.more.title')),
						m(
							'button.btn.btn--ghost.btn--sm',
							{
								type: 'button',
								'aria-label': t('village.more.close'),
								oncreate: (node: m.VnodeDOM) => (node.dom as HTMLElement).focus(),
								onclick: onClose,
							},
							'✕',
						),
					]),
					look
						? m(
								'button.village-more__row',
								{
									type: 'button',
									onclick: () => {
										onClose();
										look.onOpen();
									},
								},
								[
									m('span.village-more__label', t('village.more.style')),
									m('span.village-more__dots', lookDots(look.seeds)),
								],
							)
						: null,
					toggle(t('village.more.sound'), sound, onSound),
					toggle(t('village.more.quality_low'), lightMode, onLightMode),
					m(
						'button.village-more__row.village-more__row--exit',
						{
							type: 'button',
							onclick: () => {
								onClose();
								onSimpleView();
							},
						},
						[
							m('span.village-more__label', [
								t('village.more.simple_view'),
								m('small.village-more__hint', t('village.more.simple_hint')),
							]),
						],
					),
				],
			),
		);
	},
};
