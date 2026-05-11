import m from 'mithril';
import { t } from '@/lib/i18n';

/** Loading splash — renders the same DOM as the inline boot splash in
 *  index.html, so when Mithril takes over there is no animation restart.
 *  Only visible while data is loading; the parent view unmounts it the
 *  moment its data is ready. */
export const SplashLoader: m.Component = {
  view() {
    return m('.boot-splash.boot-splash--no-fade', [
      m('.boot-splash__content', [
        m('h1.boot-splash__brand', t('splash.title')),
        m('p.boot-splash__tagline', t('splash.tagline')),
        m(
          '.boot-loader',
          { role: 'img', 'aria-label': t('splash.status') },
          [
            m('.boot-loader__ring'),
            m('.boot-loader__center'),
            m('.boot-loader__node'),
            m('.boot-loader__node'),
            m('.boot-loader__node'),
            m('.boot-loader__node'),
            m('.boot-loader__node'),
            m('.boot-loader__node'),
            m('.boot-loader__connections'),
          ]
        ),
        m('p.boot-splash__status', t('splash.status')),
        m('.boot-progress', [
          m('.boot-progress__bar', {
            role: 'progressbar',
            'aria-label': t('splash.status'),
          }),
        ]),
      ]),
    ]);
  },
};
