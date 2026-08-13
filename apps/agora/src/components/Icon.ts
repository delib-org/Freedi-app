import m from 'mithril';

/* Agora's icon set.
 *
 * Drawn rather than rendered, and that is the whole point: the size ladder in
 * mock/icon-proof.png shows 3D renders turning to mush below ~40px, and almost
 * every icon slot in this app (journey stops 32px, card marks 26px, nav 24px)
 * lives under that line. The rendered sheet keeps the few slots above it —
 * see HeroIcon.ts, which enforces the 40px floor — and everything else is a
 * stroke drawing.
 *
 * One rule makes the ownership grammar free: every shape is `currentColor`, so
 * the SAME object tinted purple means "mine" and tinted --peer means "a
 * classmate's". Ownership never needs a second asset, and it can never drift
 * out of sync with the palette. The only literal colours below are the two
 * camps and the celebration gold, which are semantic and must not inherit.
 *
 * Geometry rules, so additions stay in family:
 *   • 24x24 box, shapes inset to 2.5 so nothing touches the edge
 *   • 1.8 stroke, round caps and joins, no fills except accents
 *   • symmetrical wherever the meaning allows — the app is Hebrew-first and
 *     CSS mirrors anything directional
 */

export type IconName =
	// core game objects
	| 'proposal'
	| 'helped'
	| 'thanks'
	| 'bridge'
	| 'square'
	| 'talk'
	| 'thought'
	| 'era'
	| 'spark'
	// score, results, progress
	| 'chart'
	| 'trophy'
	| 'medal'
	| 'flag'
	| 'scales'
	| 'podium'
	| 'tunnel'
	// actions
	| 'improve'
	| 'edit'
	| 'again'
	| 'weave'
	| 'idea'
	| 'check'
	| 'new'
	// chrome
	| 'people'
	| 'sound-on'
	| 'sound-off'
	| 'trend'
	| 'trend-down'
	| 'crown'
	| 'megaphone'
	| 'watch'
	| 'target'
	| 'mail'
	// the rating scale
	| 'face-strong-against'
	| 'face-against'
	| 'face-neutral'
	| 'face-for'
	| 'face-strong-for';

type Shape = readonly [tag: string, attrs: Readonly<Record<string, string | number>>];

const CAMP_LEFT = 'var(--camp-left, #e0873c)';
const CAMP_RIGHT = 'var(--camp-right, #14a08f)';
const GOLD = 'var(--gold, #ffd23f)';

/** A round face with a mouth — the five rating steps share one head so the
 *  row reads as a scale rather than as five unrelated drawings. */
function face(mouth: string, brow?: readonly Shape[]): readonly Shape[] {
	return [
		['circle', { cx: 12, cy: 12, r: 9 }],
		['path', { d: 'M9 10.2v.6' }],
		['path', { d: 'M15 10.2v.6' }],
		['path', { d: mouth }],
		...(brow ?? []),
	];
}

const ICONS: Readonly<Record<IconName, readonly Shape[]>> = {
	/* ---- core game objects ---- */

	// A closed book stood on end. Tinted purple it is my proposal, tinted
	// --peer it is a classmate's; the bookmark is what stops it reading as a
	// plain rectangle at 24px.
	proposal: [
		['rect', { x: 5.5, y: 3.5, width: 13, height: 17, rx: 2.2 }],
		['path', { d: 'M9 3.5v17' }],
		['path', { d: 'M13 3.5v6l2.2-1.6L17.4 9.5v-6' }],
	],

	// "Proposals I helped": a classmate's proposal carrying my spark.
	// Two literal attempts at a handshake failed here — anatomical fingers
	// dissolve first, and the simplified arm-and-grip version read as horns.
	// Composing two shapes the set has already proven beats a third try at a
	// hard drawing, and it says the thing more precisely anyway.
	helped: [
		['rect', { x: 3.5, y: 5, width: 11, height: 14.5, rx: 2 }],
		['path', { d: 'M6.6 5v14.5' }],
		[
			'path',
			{
				d: 'M18.3 2.5 19.35 5.45 22.3 6.5 19.35 7.55 18.3 10.5 17.25 7.55 14.3 6.5 17.25 5.45z',
				fill: GOLD,
				stroke: GOLD,
			},
		],
	],

	// Two open hands holding a spark: the 🙏 attestation. The single bowl this
	// replaces was the worst icon in the set — one closed arc with two thumb
	// bumps on its rim, which read as a cauldron with horns. Two mirrored hands
	// that meet at the wrist cost one extra path and actually say "held".
	thanks: [
		['path', { d: 'M9.7 15.2 9.2 11.3a1.75 1.75 0 0 0-3.45.45l.45 3.35c.45 3.3 3.2 5.4 5.8 5.4' }],
		[
			'path',
			{ d: 'M14.3 15.2 14.8 11.3a1.75 1.75 0 0 1 3.45.45l-.45 3.35c-.45 3.3-3.2 5.4-5.8 5.4' },
		],
		[
			'path',
			{
				d: 'M12 2.7 13.05 5.35 15.7 6.4 13.05 7.45 12 10.1 10.95 7.45 8.3 6.4 10.95 5.35z',
				fill: GOLD,
				stroke: GOLD,
			},
		],
	],

	// A span rising out of two banks. The banks carry the camp colours — the
	// only place in the set where a hue is not inherited. Everything that made
	// the first version unreadable is gone: the arch now *lands* on the banks
	// instead of hovering over two detached coloured dashes, and the piers and
	// centre post that turned to grey mush at 20px are not missed.
	bridge: [
		['path', { d: 'M2.5 18.7h3', stroke: CAMP_LEFT }],
		['path', { d: 'M18.5 18.7h3', stroke: CAMP_RIGHT }],
		['path', { d: 'M5.2 18.7c0-4.1 3-7.4 6.8-7.4s6.8 3.3 6.8 7.4' }],
	],

	// The agora itself: pediment, columns, stylobate.
	square: [
		['path', { d: 'M2.5 9.5 12 4l9.5 5.5' }],
		['path', { d: 'M3.5 20.5h17' }],
		['path', { d: 'M6 17.8V11M10 17.8V11M14 17.8V11M18 17.8V11' }],
		['path', { d: 'M4.5 17.8h15' }],
	],

	talk: [
		[
			'path',
			{
				d: 'M20 4.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 15.5h2.5v4l4.6-4H20a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 20 4.5z',
			},
		],
	],

	// The post that gathers what the square said to me. Symmetrical, so the
	// Hebrew-first mirror leaves it alone; the flap is a separate stroke so it
	// reads as an envelope and not as a card with a cross through it.
	mail: [
		['rect', { x: 2.5, y: 5, width: 19, height: 14, rx: 2 }],
		['path', { d: 'M3.2 6.4 12 12.6l8.8-6.2' }],
	],

	// The cloud is one closed outline. Drawing the bottom as a separate line —
	// what it used to be — left a visible notch where the right arc stopped
	// short of it, and the overshoot past the arc read as a shelf.
	thought: [
		['path', { d: 'M8.2 15.2a3.5 3.5 0 0 1 .1-7 4.3 4.3 0 0 1 8.2-.6 3.8 3.8 0 0 1 .3 7.6z' }],
		['circle', { cx: 6.5, cy: 18.4, r: 1.2 }],
		['circle', { cx: 3.6, cy: 21.1, r: 0.75 }],
	],

	// The two masks: the people of the era you can question.
	era: [
		['path', { d: 'M3 5.5h8.5v6.8A4.25 4.25 0 0 1 3 12.3z' }],
		['path', { d: 'M12.5 8.5H21v6.8a4.25 4.25 0 0 1-8.5 0z' }],
		['path', { d: 'M5.6 8.6v.6M8.9 8.6v.6M6 13.6a2.4 2.4 0 0 0 2.5 0' }],
		['path', { d: 'M15.1 11.6v.6M18.4 11.6v.6M15.5 17.2a2.4 2.4 0 0 1 2.5 0' }],
	],

	// A class record. Gold, always — celebration is not an ownable thing.
	spark: [
		[
			'path',
			{
				d: 'M12 2.2c1 4.9 3.9 7.8 8.8 8.8-4.9 1-7.8 3.9-8.8 8.8-1-4.9-3.9-7.8-8.8-8.8 4.9-1 7.8-3.9 8.8-8.8z',
				stroke: GOLD,
			},
		],
	],

	/* ---- score, results, progress ---- */

	chart: [
		['path', { d: 'M3.5 20.5h17' }],
		['path', { d: 'M7 20.5v-5.5M12 20.5v-9M17 20.5v-13' }],
	],

	trophy: [
		['path', { d: 'M7 4h10v5.5a5 5 0 0 1-10 0z' }],
		['path', { d: 'M7 5.5H4.5v1.8A3.2 3.2 0 0 0 7 10.4M17 5.5h2.5v1.8a3.2 3.2 0 0 1-2.5 3.1' }],
		['path', { d: 'M12 14.5v3.5M8.5 20.5h7' }],
	],

	// Disc above, ribbon tails below. Hanging the disc from a closed trapezoid
	// of ribbon — the previous attempt — drew a padlock, because a shape closed
	// across the top reads as a shackle. Tails that fall away from the disc
	// cannot be mistaken for anything else.
	medal: [
		['circle', { cx: 12, cy: 8.8, r: 5.6 }],
		['path', { d: 'M8.4 13.2 6.8 21.2 12 18.3l5.2 2.9-1.6-8' }],
	],

	flag: [
		['path', { d: 'M6 21V3.5' }],
		['path', { d: 'M6 4.5h11.5l-2 3.4 2 3.4H6z' }],
	],

	// Level, on purpose: the scale of a deliberation that has not tipped.
	//
	// The pans used to be two triangles in one path string, and only the first
	// carried its `z` — so the left pan closed into a solid wedge and the right
	// one stayed an open zig-zag. Nothing about that was visible on the size
	// ladder; at 24px it just looked busy. A pan is now its own path, hung from
	// its own point on the beam, with a bowl across the bottom.
	scales: [
		['path', { d: 'M12 4.4v15.4M8.4 19.8h7.2M5.4 7.4h13.2' }],
		['path', { d: 'M2.5 13.2 5.4 7.4l2.9 5.8a3.3 3.3 0 0 1-5.8 0z' }],
		['path', { d: 'M15.7 13.2 18.6 7.4l2.9 5.8a3.3 3.3 0 0 1-5.8 0z' }],
	],

	podium: [
		['path', { d: 'M9 9.5h6v11H9z' }],
		['path', { d: 'M2.5 13.5H9v7H2.5zM15 12H21.5v8.5H15z' }],
	],

	// The time tunnel, head on: a spiral falling toward a point of light.
	// Concentric rings were the first version and they collided with `target` —
	// two rings and a dot is a target no matter what it is called. A spiral is
	// the same silhouette with somewhere to go.
	tunnel: [
		[
			'path',
			{
				d: 'M12 3A8.4 8.4 0 0 0 12 19.8 6.6 6.6 0 0 0 12 6.6 5.1 5.1 0 0 0 12 16.8 3.6 3.6 0 0 0 12 9.6',
			},
		],
		['circle', { cx: 12, cy: 12, r: 1.15, fill: GOLD, stroke: GOLD }],
	],

	/* ---- actions ---- */

	// A wrench. The first version was a thin parallelogram that read as a
	// blade; a wrench needs its open jaw to be legible at all.
	improve: [
		[
			'path',
			{
				d: 'M16.4 3.2a5.4 5.4 0 0 0-4.8 8l-8 8a1.8 1.8 0 0 0 0 2.6 1.8 1.8 0 0 0 2.6 0l8-8a5.4 5.4 0 0 0 6.6-6.8l-3 3-2.6-2.6z',
			},
		],
	],

	edit: [
		['path', { d: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z' }],
		['path', { d: 'M14.5 7.5l2 2' }],
	],

	again: [
		['path', { d: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1' }],
		['path', { d: 'M20.8 4v4.4h-4.4' }],
	],

	// Weaving a classmate's idea into my own text: two strands become one and
	// flow on. A plain Y survives 20px where the earlier interlacing did not.
	weave: [
		['path', { d: 'M5.2 4.5 12 11.6l6.8-7.1' }],
		['path', { d: 'M12 11.6v8.2' }],
		['path', { d: 'M8.7 16.6 12 19.9l3.3-3.3' }],
	],

	idea: [
		['path', { d: 'M9 16.5a6 6 0 1 1 6 0v1.5H9z' }],
		['path', { d: 'M9.8 21h4.4' }],
	],

	check: [['path', { d: 'M4.5 12.5 9.5 17.5 19.5 6.5' }]],

	// Something new since you last looked.
	new: [
		['path', { d: 'M12 21v-7.5' }],
		['path', { d: 'M12 13.5c0-3.2 2.4-5.4 5.6-5.4 0 3.2-2.4 5.4-5.6 5.4z' }],
		['path', { d: 'M12 16c0-2.6-2-4.4-4.6-4.4 0 2.6 2 4.4 4.6 4.4z' }],
	],

	// Ratings moved in my favour, or away from it. The pair must mirror each
	// other exactly — they are read as a before/after, not as two icons.
	trend: [
		['path', { d: 'M3.5 17.5 9.5 11l3.5 3.5 7-7' }],
		['path', { d: 'M15.6 7.5h4.4v4.4' }],
	],

	'trend-down': [
		['path', { d: 'M3.5 6.5 9.5 13l3.5-3.5 7 7' }],
		['path', { d: 'M15.6 16.5h4.4v-4.4' }],
	],

	// The proposal the class is currently carrying.
	crown: [
		['path', { d: 'M3 7.5 6.5 15h11L21 7.5l-5 3.5-4-6-4 6z' }],
		['path', { d: 'M6.5 18.5h11' }],
	],

	// A proposal that is out in front but not finished — "leading", not "won".
	// The old drawing was a loudspeaker with a broken corner and one wave, so
	// it was both malformed and indistinguishable from `sound-on`. A horn with
	// a grip under it is a megaphone and nothing else.
	megaphone: [
		['path', { d: 'M3.4 10.5 20 5.6v12.8L3.4 13.9z' }],
		['path', { d: 'M6.4 14.7v3.7a2.4 2.4 0 0 0 4.8 0v-2.7' }],
	],

	// Nothing moved — the class looked and stayed where it was.
	watch: [
		['path', { d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }],
		['circle', { cx: 12, cy: 12, r: 2.8 }],
	],

	// The brief: what this proposal has to achieve.
	target: [
		['circle', { cx: 12, cy: 12, r: 9 }],
		['circle', { cx: 12, cy: 12, r: 5 }],
		['circle', { cx: 12, cy: 12, r: 1.3, fill: 'currentColor' }],
	],

	/* ---- chrome ---- */

	people: [
		['circle', { cx: 9, cy: 8, r: 3.4 }],
		['path', { d: 'M2.8 20.5a6.2 6.2 0 0 1 12.4 0' }],
		['path', { d: 'M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 15.2a6.2 6.2 0 0 1 3.7 5.3' }],
	],

	'sound-on': [
		['path', { d: 'M4 9.5h3.2L12 5.5v13L7.2 14.5H4z' }],
		['path', { d: 'M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.6 7.6 0 0 1 0 10.8' }],
	],

	'sound-off': [
		['path', { d: 'M4 9.5h3.2L12 5.5v13L7.2 14.5H4z' }],
		['path', { d: 'M16.5 10 21 14.5M21 10l-4.5 4.5' }],
	],

	/* ---- the rating scale ---- */

	'face-strong-against': face('M8.6 16.4a4.2 4.2 0 0 1 6.8 0', [
		['path', { d: 'M6.9 8.2 9.6 9.4M17.1 8.2 14.4 9.4' }],
	]),
	'face-against': face('M9 16a3.6 3.6 0 0 1 6 0'),
	'face-neutral': face('M8.8 15.6h6.4'),
	'face-for': face('M9 15a3.6 3.6 0 0 0 6 0'),
	'face-strong-for': face('M8.4 14.4a4.4 4.4 0 0 0 7.2 0z'),
};

export interface IconAttrs {
	name: IconName;
	/** Rendered box in px. Below 20 the finer icons start to close up. */
	size?: number;
	/** Extra class — use it to set `color`, which is what tints the icon. */
	class?: string;
	/** Announce the icon. Omit for decoration sitting next to a real label. */
	label?: string;
}

/** One icon. Colour it by setting `color` on this element or an ancestor. */
export const Icon: m.Component<IconAttrs> = {
	view({ attrs }) {
		const { name, size = 24, class: cls, label } = attrs;
		const shapes = ICONS[name];

		return m(
			'svg.icon',
			{
				class: cls,
				width: size,
				height: size,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': 1.8,
				'stroke-linecap': 'round',
				'stroke-linejoin': 'round',
				role: label ? 'img' : 'presentation',
				'aria-label': label,
				'aria-hidden': label ? undefined : 'true',
			},
			// A COPY per render, never the table's own object. The shapes above
			// are module-level constants, so handing the same attrs object to
			// Mithril on every redraw is the "Don't reuse attrs object" warning
			// — hundreds of them per page, since every screen is full of icons,
			// and a throw rather than a warning in Mithril's next major.
			shapes.map(([tag, attributes]) => m(tag, { ...attributes })),
		);
	},
};

/** An icon and its label as one run.
 *
 * The app was full of `` `📈 ${t('...')}` `` — glyph and text fused into a
 * single string, which meant the icon inherited the text's size and colour and
 * could never be styled apart from it. This keeps them adjacent but separate,
 * and the `.icon--inline` baseline shift is what stops a 1em box from riding
 * high against Hebrew text.
 */
export function iconLabel(name: IconName, label: m.Children, size = 16): m.Children {
	return [m(Icon, { name, size, class: 'icon--inline' }), label];
}

/** Every name, for proof sheets and pickers. */
export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[];

/** Raw geometry, for the proof-sheet generator (scripts/icon-proof.ts). */
export const ICON_SHAPES: Readonly<Record<IconName, readonly Shape[]>> = ICONS;
