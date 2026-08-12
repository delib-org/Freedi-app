import m from 'mithril';
import { Icon, type IconName } from './Icon';

/* The rendered half of the icon set.
 *
 * `Icon` is a drawing on a 24 grid and serves every slot in the app. This
 * serves the slots the 3D sheet survives, and where that line falls was got
 * wrong twice before it was got right.
 *
 * The original ladder read "mush below about 40px" and the sheet was binned
 * on the strength of it. But that ladder was rendered at 1x, and nobody plays
 * this at 1x: it is a phone game, so a 26px icon is 52 to 78 device pixels
 * against a 256px asset. mock/delib-mock.html had the 3D sheet in the HUD
 * crest and the journey stops at ~26–34px the whole time, and it looks right
 * there, which is the evidence that settled it. The floor is 24 — measured on
 * the ladder at 3x, and still legible at 1x from 26 up.
 *
 * Two things follow from having a floor at all. A slot never has to know
 * whether an asset exists — ask for a hero, get the render if there is one and
 * the drawing if there is not — and shrinking a slot below the floor later
 * cannot silently ship mush.
 *
 * Ownership survives the register change. The sheet holds the book twice, once
 * violet and once as clear white glass, because MINE is purple and A
 * CLASSMATE'S is white (tokens.scss) and that rule outranks the palette. The
 * drawn set gets this free from currentColor; here it costs a second asset,
 * which is why only the book has one.
 */

/** Names with a rendered asset in public/icons (sheet 1, `docs/icon-brief.md`).
 *  Sheets 2–4 were never generated, so the score, action and chrome icons fall
 *  through to the drawing at every size. */
const RENDERED: ReadonlySet<IconName> = new Set<IconName>([
	'proposal',
	'helped',
	'thanks',
	'bridge',
	'square',
	'talk',
	'era',
	'spark',
]);

/** Under this, a render loses its detail and the drawing wins. */
const FLOOR = 24;

export interface HeroIconAttrs {
	name: IconName;
	/** Rendered box in px. Below 24 this component draws instead. */
	size?: number;
	/** Whose object this is. Only the book has both; the rest are neutral. */
	owner?: 'mine' | 'peer';
	class?: string;
	/** Announce the icon. Omit for decoration sitting next to a real label. */
	label?: string;
}

export function hasRender(name: IconName, size: number): boolean {
	return size >= FLOOR && RENDERED.has(name);
}

export const HeroIcon: m.Component<HeroIconAttrs> = {
	view({ attrs }) {
		const { name, size = 64, owner, class: cls, label } = attrs;

		if (!hasRender(name, size)) {
			return m(Icon, { name, size, class: cls, label });
		}

		const asset = name === 'proposal' && owner === 'peer' ? 'proposal-peer' : name;

		return m('img.hero-icon', {
			src: `/icons/${asset}.webp`,
			width: size,
			height: size,
			alt: label ?? '',
			class: cls,
			decoding: 'async',
			role: label ? 'img' : 'presentation',
			'aria-hidden': label ? undefined : 'true',
		});
	},
};
