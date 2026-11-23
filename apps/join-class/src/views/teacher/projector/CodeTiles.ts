import m from 'mithril';

/**
 * The class code as digit tiles, for the night look on the wall (redesign port
 * spec, section 7.4; docs/design/class-redesign/Projector-1-Join.dc.html).
 * Decoration only: it repeats the code that sits next to it as plain text, and
 * that text is what a screen reader reads.
 *
 * The element is `hidden` and `aria-hidden`. Only the night projector's
 * stylesheet (styles/night-projector/_join.scss) shows it, so the solid look and
 * high contrast keep drawing the plain code and nothing else.
 */

/** A code this long or longer reads in two groups ("482 913"); a shorter one is one group. */
export const CODE_SPLIT_FROM = 5;

/** The code's characters in reading groups: two halves, the first the longer one. */
export function codeGroups(code: string): string[][] {
	const characters = Array.from(code).filter((character) => character.trim() !== '');
	if (characters.length === 0) return [];
	if (characters.length < CODE_SPLIT_FROM) return [characters];
	const half = Math.ceil(characters.length / 2);

	return [characters.slice(0, half), characters.slice(half)];
}

export interface CodeTilesAttrs {
	code: string;
}

export const CodeTiles: m.Component<CodeTilesAttrs> = {
	view({ attrs }) {
		return m(
			'.code-tiles',
			{ hidden: true, 'aria-hidden': 'true', dir: 'ltr' },
			codeGroups(attrs.code).map((group) =>
				m(
					'span.code-tiles__group',
					group.map((character) => m('span.code-tiles__digit', character)),
				),
			),
		);
	},
};
