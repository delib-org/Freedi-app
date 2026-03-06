import m from 'mithril';

export interface ProgressBarAttrs {
  current: number;
  total: number;
  label?: string;
}

export const ProgressBar: m.Component<ProgressBarAttrs> = {
  view(vnode) {
    const { current, total, label } = vnode.attrs;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;

    return m('.progress', [
      m('.progress__bar', {
        role: 'progressbar',
        'aria-valuenow': current,
        'aria-valuemin': 0,
        'aria-valuemax': total,
        'aria-label': label ?? `${current} of ${total}`,
      }, [
        m('.progress__fill', { style: { width: `${pct}%` } }),
      ]),
      label
        ? m('.progress__label', { 'aria-hidden': 'true' }, label)
        : m('.progress__label', { 'aria-hidden': 'true' }, `${current} / ${total}`),
    ]);
  },
};
