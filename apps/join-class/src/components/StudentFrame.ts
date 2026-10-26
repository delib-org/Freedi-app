import m from 'mithril';
import { studentStageTitle } from '@/lib/studentStage';
import '@/styles/student-frame.scss';
import { ReplyNotice } from '@/views/student/replies/ReplyNotice';

/**
 * The shared phone frame of every student classroom screen (UX §10 #1).
 * Props in, vnodes out, apart from the reply notice line (IA 23.1), which
 * reads the replies state itself.
 *
 *   headerLine   one status line, e.g. "Table 5 · round 2"
 *   stageName    optional override of the stage heading; by default the current
 *                lesson step's name (lib/studentStage), shown on every stage
 *   askerMark    optional leading mark in the header (e.g. "?" for the asker)
 *   instruction  the single instruction of this screen
 *   questionHeading  the instruction is a chosen question: big, in the top third
 *   ask          the lesson's question as a big heading above the instruction (Proposals)
 *   action       the primary action (a `.btn.btn--primary`), pinned at the bottom
 *   down         the inverted "screens down" talk screen (`.frame--down`)
 *
 * Children render inside `.frame__content` under the instruction.
 */
export interface StudentFrameAttrs {
	headerLine: string;
	stageName?: string;
	askerMark?: string;
	instruction?: string;
	questionHeading?: boolean;
	ask?: string;
	action?: m.Children;
	down?: boolean;
}

export const StudentFrame: m.Component<StudentFrameAttrs> = {
	view({ attrs, children }) {
		const { headerLine, askerMark, instruction, questionHeading, ask, action, down } = attrs;
		const stageName = attrs.stageName ?? studentStageTitle();
		// the status line is dropped when it only repeats the stage name
		const showLine = Boolean(headerLine) && headerLine !== stageName;

		return m('section.frame', { class: down ? 'frame--down' : '' }, [
			m('header.frame__header', { class: stageName && showLine ? 'frame__header--stacked' : '' }, [
				askerMark ? m('span.frame__mark', { 'aria-hidden': 'true' }, askerMark) : null,
				stageName ? m('h2.frame__stage', stageName) : null,
				showLine ? m('span.frame__line', headerLine) : null,
			]),
			// The author's lasting "someone replied" line (IA 23.1); never on the face-down talk screen.
			down ? null : m(ReplyNotice),
			m('main.frame__content', [
				ask ? m('p.frame__ask', { dir: 'auto', 'data-testid': 'proposals-ask' }, ask) : null,
				instruction
					? m(
							'h1.frame__instruction',
							{
								tabindex: -1,
								dir: questionHeading ? 'auto' : undefined,
								class: questionHeading ? 'frame__instruction--question' : '',
							},
							instruction,
						)
					: null,
				children,
			]),
			action ? m('footer.frame__action', action) : null,
		]);
	},
};
