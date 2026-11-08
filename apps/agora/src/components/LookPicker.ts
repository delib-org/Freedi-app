import m from 'mithril';
import { t } from '../lib/i18n';
import { type ClassLook, isWearing, DEFAULT_SEEDS } from '../lib/looks';
import {
	AGORA_THEME_PRESETS,
	AgoraResolvedTheme,
	AgoraThemeChoice,
	AgoraThemePreset,
	AgoraThemeSeeds,
} from '@freedi/shared-types';

/** What each preset looks like, as four discs — the same seeds a built look carries */
export const PRESET_SEEDS: Record<AgoraThemePreset, AgoraThemeSeeds> = {
	candy: DEFAULT_SEEDS,
	purple: { page: '#ffffff', mine: '#8b6bf0', peer: '#6f6795', go: '#56dfc0' },
};

const PRESET_LABEL: Record<AgoraThemePreset, string> = {
	candy: 'look.candy',
	purple: 'look.purple',
};

/** The four seeds of a look as a row of discs — the whole look, at a glance */
export function lookDots(seeds: AgoraThemeSeeds): m.Children {
	return m(
		'span.look-dots',
		{ 'aria-hidden': 'true' },
		(['page', 'mine', 'peer', 'go'] as const).map((seed) =>
			m('span.look-dots__dot', {
				key: seed,
				class: `look-dots__dot--${seed}`,
				style: { backgroundColor: seeds[seed] },
			}),
		),
	);
}

/** The seeds a resolved look paints with, for previews and the style button */
export function seedsOf(resolved: AgoraResolvedTheme): AgoraThemeSeeds {
	if (resolved.kind === 'custom') return resolved.custom.seeds;
	if (resolved.kind === 'civic')
		return { page: '#06182c', mine: '#e8b958', peer: '#5edfff', go: '#35d68d' };

	return PRESET_SEEDS[resolved.kind];
}

export interface LookPickerAttrs {
	/** The look on this screen right now */
	current: AgoraResolvedTheme;
	/** Looks the class has built — from the participant docs everyone listens to */
	classLooks: readonly ClassLook[];
	/** Put a look on; `null` means "follow the room" */
	onWear: (choice: AgoraThemeChoice | null) => void;
	/** Open the builder. Absent (the teacher's console) hides the door. */
	onBuild?: () => void;
	/** The room's own look, when the chooser may fall back to it */
	roomLook?: AgoraResolvedTheme;
	/** Whether this person is currently following the room rather than choosing */
	following?: boolean;
}

/**
 * Every look on offer, as cards: the two presets, then what the class built,
 * then the door to build one. A card is its four discs and its name — the
 * discs ARE the preview, and a name under them is all a fourteen-year-old
 * needs to tell "Lemonade" from "Grape Soda".
 *
 * Props in, vnodes out: which doc a pick lands on is the view's business.
 */
export const LookPicker: m.Component<LookPickerAttrs> = {
	view(vnode) {
		const { current, classLooks, onWear, onBuild, roomLook, following } = vnode.attrs;

		const card = (
			key: string,
			seeds: AgoraThemeSeeds,
			name: string,
			selected: boolean,
			onclick: () => void,
			by?: string,
		): m.Children =>
			m(
				'button.look-card',
				{
					key,
					type: 'button',
					class: selected ? 'look-card--on' : undefined,
					'aria-pressed': selected ? 'true' : 'false',
					onclick,
				},
				[lookDots(seeds), m('span.look-card__name', name), by ? m('span.look-card__by', by) : null],
			);

		return m('.look-picker', [
			following && roomLook ? m('p.look-picker__following', t('look.following_room')) : null,
			m('.look-picker__grid', [
				...AGORA_THEME_PRESETS.map((preset) =>
					card(preset, PRESET_SEEDS[preset], t(PRESET_LABEL[preset]), current.kind === preset, () =>
						onWear({ preset }),
					),
				),
				...classLooks.map((entry) =>
					card(
						`${entry.look.authorId}--${entry.look.createdAt}`,
						entry.look.seeds,
						entry.look.name,
						isWearing(current, entry.look),
						() => onWear({ preset: 'custom', custom: entry.look }),
						entry.mine ? t('look.by_me') : t('look.by', { name: entry.makerName }),
					),
				),
				// Spread, not `: null` — a keyed list may not carry a null slot
				...(onBuild
					? [
							m(
								'button.look-card.look-card--build',
								{ key: 'build', type: 'button', onclick: onBuild },
								[
									m('span.look-card__plus', { 'aria-hidden': 'true' }, '+'),
									m(
										'span.look-card__name',
										t(classLooks.some((entry) => entry.mine) ? 'look.rebuild' : 'look.build'),
									),
								],
							),
						]
					: []),
			]),
		]);
	},
};
