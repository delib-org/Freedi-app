import m from 'mithril';
import '@/styles/student-frame.scss';

/**
 * The shared phone frame of every student classroom screen (UX §10 #1).
 * Props in, vnodes out: no store reads, no writes.
 *
 *   headerLine   one status line, e.g. "Table 5 · round 2"
 *   askerMark    optional leading mark in the header (e.g. "?" for the asker)
 *   instruction  the single instruction of this screen
 *   action       the primary action (a `.btn.btn--primary`), pinned at the bottom
 *   down         the inverted "screens down" talk screen (`.frame--down`)
 *
 * Children render inside `.frame__content` under the instruction.
 */
export interface StudentFrameAttrs {
	headerLine: string;
	askerMark?: string;
	instruction?: string;
	action?: m.Children;
	down?: boolean;
}

export const StudentFrame: m.Component<StudentFrameAttrs> = {
	view({ attrs, children }) {
		const { headerLine, askerMark, instruction, action, down } = attrs;

		return m('section.frame', { class: down ? 'frame--down' : '' }, [
			m('header.frame__header', [
				askerMark ? m('span.frame__mark', { 'aria-hidden': 'true' }, askerMark) : null,
				m('span.frame__line', headerLine),
			]),
			m('main.frame__content', [
				instruction ? m('h1.frame__instruction', instruction) : null,
				children,
			]),
			action ? m('footer.frame__action', action) : null,
		]);
	},
};
