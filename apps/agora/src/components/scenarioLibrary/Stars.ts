import m from 'mithril';
import { Icon } from '../Icon';
import { isRTL, t } from '../../lib/i18n';

const STAR_COUNT = 5;

export interface StarsAttrs {
	/** 0-5; fractions fill the last star partly */
	value: number;
	size?: number;
}

/** Five stars, filled to `value`. Decorative: the number beside it carries the meaning. */
export const Stars: m.Component<StarsAttrs> = {
	view({ attrs }) {
		const { value, size = 18 } = attrs;

		return m(
			'span.scn-stars',
			{ 'aria-hidden': 'true' },
			Array.from({ length: STAR_COUNT }, (_, index) => {
				const fill = Math.max(0, Math.min(1, value - index));

				return m(
					'span.scn-stars__star',
					{ style: { '--fill': `${Math.round(fill * 100)}%` } },
					m(Icon, { name: 'star', size }),
				);
			}),
		);
	},
};

export interface StarPickerAttrs {
	value: number;
	onChange: (stars: number) => void;
	disabled?: boolean;
	/** Names the group for assistive technology */
	label: string;
}

/**
 * Pick 1-5 stars: a radiogroup, so the arrows move and the group is one tab
 * stop. Each star says its own number to a screen reader.
 */
export const StarPicker: m.Component<StarPickerAttrs> = {
	view({ attrs }) {
		const { value, onChange, disabled = false, label } = attrs;

		return m(
			'.scn-picker',
			{ role: 'radiogroup', 'aria-label': label },
			Array.from({ length: STAR_COUNT }, (_, index) => {
				const stars = index + 1;
				const on = stars <= value;

				return m(
					'button.scn-picker__star',
					{
						type: 'button',
						role: 'radio',
						disabled,
						'aria-checked': String(stars === value),
						'aria-label': t('scenlib.stars_n', { n: stars }),
						tabindex: stars === (value || 1) ? 0 : -1,
						class: on ? 'scn-picker__star--on' : undefined,
						onclick: () => onChange(stars),
						onkeydown: (event: KeyboardEvent) => {
							const along = isRTL() ? -1 : 1;
							const step =
								event.key === 'ArrowUp'
									? 1
									: event.key === 'ArrowDown'
										? -1
										: event.key === 'ArrowRight'
											? along
											: event.key === 'ArrowLeft'
												? -along
												: 0;
							if (step === 0) return;
							event.preventDefault();
							const next = Math.max(1, Math.min(STAR_COUNT, (value || 0) + step));
							// currentTarget is gone by the next frame; hold the group now
							const group = (event.currentTarget as HTMLElement).parentElement;
							onChange(next);
							requestAnimationFrame(() => {
								group?.querySelectorAll<HTMLElement>('.scn-picker__star')[next - 1]?.focus();
							});
						},
					},
					m(Icon, { name: 'star', size: 30 }),
				);
			}),
		);
	},
};
