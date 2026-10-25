import m from 'mithril';
import type { LessonStepKey, Statement } from '@freedi/shared-types';
import { lessonStepOf } from '@/lib/lesson';
import { lessonStatusOfMain } from '@/lib/lessonCore';
import { setStudentStage } from '@/lib/studentStage';
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
import type { LessonStateAttrs } from './LessonStateScreen';

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

/**
 * The paused / ended screen is its own lazy chunk (with its small stylesheet):
 * a student whose lesson never pauses never downloads it.
 */
let stateScreen: m.ComponentTypes<LessonStateAttrs> | null = null;
let stateLoading = false;

function renderState(main: Statement, status: 'paused' | 'ended'): m.Children {
	if (stateScreen) return m(stateScreen, { main, status });
	if (!stateLoading) {
		stateLoading = true;
		import('./LessonStateScreen')
			.then((mod) => {
				stateScreen = mod.LessonStateScreen;
			})
			.catch((err: unknown) => {
				console.error('[StudentStage] loading the lesson-state screen failed:', err);
			})
			.finally(() => {
				stateLoading = false;
				m.redraw();
			});
	}

	return null;
}

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
		const status = lessonStatusOfMain(attrs.main);
		if (status === 'paused' || status === 'ended') {
			setStudentStage(null);

			return renderState(attrs.main, status);
		}
		const step = lessonStepOf(attrs.main.statementSettings?.lessonPlan);
		setStudentStage(step.key);

		return m(STEP_COMPONENTS[step.key], { main: attrs.main, key: step.key });
	},
};
