import m from 'mithril';
import { t } from '../lib/i18n';
import { LookPicker } from './LookPicker';
import { LookBuilder } from './LookBuilder';
import { type ClassLook } from '../lib/looks';
import { AgoraResolvedTheme, AgoraThemeChoice, AgoraThemeSeeds } from '@freedi/shared-types';

export interface LookSheetAttrs {
	current: AgoraResolvedTheme;
	roomLook: AgoraResolvedTheme;
	following: boolean;
	classLooks: readonly ClassLook[];
	/** My own built look, so "rebuild" opens on it */
	myLook?: { name: string; seeds: AgoraThemeSeeds; font?: string };
	onWear: (choice: AgoraThemeChoice | null) => void;
	onBuild: (name: string, seeds: AgoraThemeSeeds, font: string | undefined) => void;
	onClose: () => void;
}

type Mode = 'pick' | 'build';

/**
 * The style sheet: a modal over the game where a student picks a look or
 * builds one. Two modes in one sheet, because the builder is a step past the
 * picker and not a separate place. Escape and the scrim both close it.
 */
export function LookSheet(): m.Component<LookSheetAttrs> {
	let mode: Mode = 'pick';

	function onKey(event: KeyboardEvent, onClose: () => void): void {
		if (event.key === 'Escape') onClose();
	}

	return {
		view(vnode) {
			const { current, roomLook, following, classLooks, myLook, onWear, onBuild, onClose } =
				vnode.attrs;

			return m(
				'.look-sheet',
				{
					onclick: (event: MouseEvent) => {
						if (event.target === event.currentTarget) onClose();
					},
					onkeydown: (event: KeyboardEvent) => onKey(event, onClose),
				},
				m(
					'.look-sheet__panel',
					{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'look-sheet-title' },
					[
						m('.look-sheet__head', [
							m(
								'h2.look-sheet__title#look-sheet-title',
								t(mode === 'pick' ? 'look.title' : 'look.builder_title'),
							),
							m(
								'button.btn.btn--ghost.btn--sm',
								{ type: 'button', 'aria-label': t('common.close'), onclick: onClose },
								'✕',
							),
						]),
						mode === 'pick'
							? [
									m('p.look-sheet__hint', t('look.hint')),
									m(LookPicker, {
										current,
										roomLook,
										following,
										classLooks,
										onWear: (choice) => {
											onWear(choice);
											onClose();
										},
										onBuild: () => {
											mode = 'build';
										},
									}),
									following
										? null
										: m(
												'button.btn.btn--ghost.btn--full',
												{ type: 'button', onclick: () => onWear(null) },
												t('look.follow_room'),
											),
								]
							: m(LookBuilder, {
									initialName: myLook?.name,
									initialSeeds: myLook?.seeds,
									initialFont: myLook?.font,
									onSave: (name, seeds, font) => {
										onBuild(name, seeds, font);
										mode = 'pick';
										onClose();
									},
									onCancel: () => {
										mode = 'pick';
									},
								}),
					],
				),
			);
		},
	};
}
