import m from 'mithril';
import { Deliberation } from '../lib/deliberation';
import { t } from '../lib/i18n';

export interface IntroAttrs {
  deliberation: Deliberation;
  participantCount: number;
  onBegin: () => void;
}

export const Intro: m.Component<IntroAttrs> = {
  view(vnode) {
    const { deliberation, participantCount, onBegin } = vnode.attrs;

    return m('.shell', [
      m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-lg)' } }, [
        m('h1', {
          style: {
            fontSize: 'var(--font-size-2xl)',
            fontWeight: 'var(--font-weight-bold)',
            textAlign: 'center',
            lineHeight: 'var(--line-height-tight)',
          },
        }, deliberation.title),

        m('p', {
          style: {
            color: 'var(--text-secondary)',
            textAlign: 'center',
            fontSize: 'var(--font-size-lg)',
          },
        }, deliberation.description),

        m('div', {
          style: {
            display: 'flex',
            justifyContent: 'center',
            gap: 'var(--space-lg)',
            padding: 'var(--space-md) 0',
          },
        }, [
          infoBadge('⏱', `${deliberation.settings.timeEstimateMinutes} ${t('intro.minutes')}`),
          infoBadge('👥', `${participantCount} ${t('intro.joined')}`),
          infoBadge('🔒', t('intro.anonymous')),
        ]),

        m('.process-strip', [
          processStep(1, t('intro.needs'), true),
          processStep(2, t('intro.solutions'), false),
          processStep(3, t('intro.results'), false),
        ]),

        m('p', {
          style: {
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 'var(--font-size-sm)',
          },
        }, t('intro.no_login')),
      ]),

      m('.shell__footer', [
        m('button.btn.btn--primary', { onclick: onBegin }, t('intro.begin')),
      ]),
    ]);
  },
};

function infoBadge(icon: string, text: string): m.Vnode {
  return m('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-xs)',
    },
  }, [
    m('span', { style: { fontSize: 'var(--font-size-xl)' } }, icon),
    m('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } }, text),
  ]);
}

function processStep(number: number, label: string, active: boolean): m.Vnode {
  return m('.process-strip__step', [
    m(`.process-strip__dot${active ? '.process-strip__dot--active' : ''}`, String(number)),
    m('.process-strip__label', label),
  ]);
}
