import m from 'mithril';
import { Icon, type IconName } from './Icon';

/* The rendered half of the icon set.
 *
 * `Icon` is a drawing on a 24 grid and serves every slot in the app. This
 * serves the few that are big enough for the 3D sheet — the stage-transition
 * card, a proposal shown one-at-a-time. The size ladder (mock/icon-proof.png)
 * put the line at about 40px: below it a render is mush and the drawing is
 * strictly better, so BELOW is not a judgement call here, it is the rule this
 * component enforces.
 *
 * Two things follow from that rule. A hero slot never has to know whether an
 * asset exists — ask for a hero, get the render if there is one and the
 * drawing if there is not — and shrinking a slot can never accidentally ship a
 * mushy render.
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
const FLOOR = 40;

export interface HeroIconAttrs {
	name: IconName;
	/** Rendered box in px. Below 40 this component draws instead. */
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
