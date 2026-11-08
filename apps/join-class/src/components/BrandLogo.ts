import m from 'mithril';
import { isRTL } from '@/lib/i18n';

/** The WizCol mark, rendered at the five places it appears.
 *
 *  Previously each site inlined `isRTL() ? '/wizcol-logo-rtl.png' : ...` and
 *  pointed at a 512×512 PNG — ~85 kB to fill a 32–72 px box. The assets are now
 *  224 px (enough for a 72 px box on a 3× screen) and served as WebP, which
 *  takes the same mark from ~85 kB to ~7 kB. The PNG stays as the `<picture>`
 *  fallback for browsers without WebP.
 *
 *  Centralising it here is what makes that swap a one-line change next time. */

interface BrandLogoAttrs {
	/** Rendered size in CSS pixels. Also emitted as width/height so the box is
	 *  reserved before the image decodes — no layout shift on a slow link. */
	size: number;
	/** BEM class for the `<img>`, e.g. `login__logo`. */
	className: string;
	/** Above-the-fold marks should stay eager; the footer one should not. */
	loading?: 'eager' | 'lazy';
}

export const BrandLogo: m.Component<BrandLogoAttrs> = {
	view(vnode) {
		const { size, className } = vnode.attrs;
		const loading = vnode.attrs.loading ?? 'eager';
		const side = isRTL() ? 'rtl' : 'ltr';

		return m('picture', [
			m('source', {
				srcset: `/wizcol-logo-${side}.webp`,
				type: 'image/webp',
			}),
			m(`img.${className}`, {
				src: `/wizcol-logo-${side}.png`,
				alt: 'WizCol',
				width: size,
				height: size,
				loading,
				decoding: 'async',
			}),
		]);
	},
};
