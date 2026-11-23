import m from 'mithril';

/**
 * The classmate orbs under "N in the class" (redesign port spec, section 6):
 * one decorative orb per student who joined, colours cycling, then one dashed
 * "?" slot for whoever comes next. Decoration only: it knows the count the
 * screen already shows and nothing else (no names, no sides).
 *
 * The element is `hidden` and `aria-hidden`. Only the night look's stylesheet
 * (styles/night/_c2-join.scss) shows it, so the solid look, high contrast and
 * the teacher's "student screen" sample never draw it.
 */

/** The orb colours, in the order they repeat. */
export const ORB_COLORS = ['magenta', 'cyan', 'orange', 'green', 'violet'] as const;
export type OrbColor = (typeof ORB_COLORS)[number];

/** A full class still fits two rows on a phone. */
export const MAX_CLASSMATE_ORBS = 20;

/** One colour per student who joined, cycling, never more than the cap. */
export function classmateOrbColors(count: number): OrbColor[] {
	const shown = Number.isFinite(count)
		? Math.min(Math.max(Math.floor(count), 0), MAX_CLASSMATE_ORBS)
		: 0;

	return Array.from({ length: shown }, (_, index) => ORB_COLORS[index % ORB_COLORS.length]);
}

export interface ClassmateOrbsAttrs {
	/** Students who joined (the count the screen shows). */
	count: number;
}

export const ClassmateOrbs: m.Component<ClassmateOrbsAttrs> = {
	view({ attrs }) {
		return m('.classmates', { hidden: true, 'aria-hidden': 'true' }, [
			classmateOrbColors(attrs.count).map((color) =>
				m('span.classmates__orb', { class: `classmates__orb--${color}` }),
			),
			m('span.classmates__slot'),
		]);
	},
};
