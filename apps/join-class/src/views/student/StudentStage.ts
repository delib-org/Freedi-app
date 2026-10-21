import m from 'mithril';
import type { LessonStepKey, Statement } from '@freedi/shared-types';
import { lessonStepOf } from '@/lib/lesson';
import { watchClass } from '@/lib/classroom/classState';
import { OpeningStep } from './steps/OpeningStep';
import { ProposalsStep } from './steps/ProposalsStep';
import { SideStep } from './steps/SideStep';
import { SummaryStep } from './steps/SummaryStep';
import { TableTalkStep } from './steps/TableTalkStep';
import { TablesStep } from './steps/TablesStep';
import { VoteStep } from './steps/VoteStep';
import { WaitingStep } from './steps/WaitingStep';
import type { StepAttrs } from './steps/stepSlot';

/**
 * A student's whole screen for a lesson workspace. Renders the step named by
 * `lessonPlan.stepIndex` (the main statement is kept live by MainHub's
 * subscription, so a teacher's step change and a phone refresh both land here)
 * and delegates to ONE slot file per step (views/student/steps/):
 *   C2: Waiting, Opening, Side, Tables       C3: TableTalk, Proposals, Vote, Summary
 * Also starts the classroom listeners (`watchClass`) for the student role.
 */

const STEP_COMPONENTS: Record<LessonStepKey, m.Component<StepAttrs>> = {
	waiting: WaitingStep,
	opening: OpeningStep,
	side: SideStep,
	tables: TablesStep,
	tableTalk: TableTalkStep,
	proposals: ProposalsStep,
	vote: VoteStep,
	summary: SummaryStep,
};

export interface StudentStageAttrs {
	main: Statement;
}

export const StudentStage: m.Component<StudentStageAttrs> = {
	oninit(vnode) {
		const state = vnode.state as { stop?: () => void };
		state.stop = watchClass(vnode.attrs.main.statementId, 'student');
	},

	onremove(vnode) {
		(vnode.state as { stop?: () => void }).stop?.();
	},

	view({ attrs }) {
		const step = lessonStepOf(attrs.main.statementSettings?.lessonPlan);

		return m(STEP_COMPONENTS[step.key], { main: attrs.main, key: step.key });
	},
};
