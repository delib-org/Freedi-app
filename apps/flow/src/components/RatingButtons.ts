import m from 'mithril';

export interface RatingButtonsAttrs {
  value: number | null;
  onRate: (value: number) => void;
}

interface RatingOption {
  value: number;
  label: string;
  icon: string;
  modifier: string;
}

/** MC-compatible scale: -1, -0.5, 0, 0.5, 1 */
const OPTIONS: RatingOption[] = [
  { value: -1, label: 'Strongly Disagree', icon: '👎👎', modifier: 'sd' },
  { value: -0.5, label: 'Disagree', icon: '👎', modifier: 'd' },
  { value: 0, label: 'Neutral', icon: '😐', modifier: 'n' },
  { value: 0.5, label: 'Agree', icon: '👍', modifier: 'a' },
  { value: 1, label: 'Strongly Agree', icon: '👍👍', modifier: 'sa' },
];

export const RatingButtons: m.Component<RatingButtonsAttrs> = {
  view(vnode) {
    const { value, onRate } = vnode.attrs;

    return m('.rating', { role: 'radiogroup', 'aria-label': 'Rate this item' },
      OPTIONS.map((opt, index) => {
        const isActive = value === opt.value;
        const classes = [
          'rating__btn',
          `rating__btn--${opt.modifier}`,
          isActive ? 'rating__btn--active' : '',
        ].filter(Boolean).join(' ');

        return m('button', {
          class: classes,
          role: 'radio',
          'aria-checked': isActive ? 'true' : 'false',
          'aria-label': opt.label,
          title: opt.label,
          tabindex: isActive || (value === null && index === 2) ? '0' : '-1',
          onclick: () => onRate(opt.value),
          onkeydown: (e: KeyboardEvent) => {
            let nextIndex = index;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              nextIndex = Math.min(index + 1, OPTIONS.length - 1);
              e.preventDefault();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              nextIndex = Math.max(index - 1, 0);
              e.preventDefault();
            }
            if (nextIndex !== index) {
              onRate(OPTIONS[nextIndex].value);
              // Focus the next button
              const parent = (e.target as HTMLElement).parentElement;
              if (parent) {
                const buttons = parent.querySelectorAll('button');
                (buttons[nextIndex] as HTMLElement)?.focus();
              }
            }
          },
        }, opt.icon);
      }),
    );
  },
};
