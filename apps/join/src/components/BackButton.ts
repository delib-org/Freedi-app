import m from 'mithril';
import { isAdmin } from '@/lib/admin';
import { t, isRTL } from '@/lib/i18n';

export interface BackButtonAttrs {
  /** Mithril route to navigate to when pressed (e.g. `/m/abc` for the hub). */
  to: string;
}

/**
 * iOS-style back button pinned to the top inline-start corner (LTR →
 * top-left, RTL → top-right). Renders for admins only — non-admins in
 * facilitated mode are driven by `powerFollowMe` and shouldn't be steering
 * themselves away from the facilitator.
 *
 * The chevron glyph is direction-aware (`‹` in LTR, `›` in RTL) so it
 * always points "back" along the reading axis without per-language
 * overrides on the SVG side.
 */
export const BackButton: m.Component<BackButtonAttrs> = {
  view(vnode) {
    if (!isAdmin()) return null;

    const { to } = vnode.attrs;
    const glyph = isRTL() ? '›' : '‹';

    return m(
      'button.back-button',
      {
        type: 'button',
        title: t('nav.back'),
        'aria-label': t('nav.back'),
        onclick: (e: Event) => {
          e.preventDefault();
          m.route.set(to);
        },
      },
      m('span.back-button__chevron', { 'aria-hidden': 'true' }, glyph),
    );
  },
};
