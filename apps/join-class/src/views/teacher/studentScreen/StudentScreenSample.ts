import m from 'mithril';
import type { LessonStepKey, Statement } from '@freedi/shared-types';
import '@/styles/student-c2.scss';
import '@/styles/student-c3.scss';
import '@/styles/student-c3-all-proposals.scss';
import { t } from '@/lib/i18n';
import { getChallengeQuestion, getLessonStep, getLessonSteps } from '@/lib/lesson';
import { lessonStatusOfMain } from '@/lib/lessonCore';
import { getMainStatement, getSubQuestions } from '@/lib/store';
import { setStudentStage } from '@/lib/studentStage';
import { liveResultsOn } from '@/lib/classroom/voteResults';
import { isBallotClosed, isBallotFrozen, isBallotPaused } from '@/lib/classroom/consoleHelpers';
import { OpeningView } from '@/views/student/c2/OpeningView';
import { LessonStateScreen } from '@/views/student/LessonStateScreen';
import {
	allProposalsSample,
	endedSample,
	proposalsSample,
	sideSample,
	summarySample,
	tablesSample,
	tableTalkSample,
	voteSample,
	waitingSample,
} from './screens';
import type { SampleBallot } from './screens';

/**
 * "Student screen" (console view `?view=student`, Trello 7S3Axkzd): a phone-shaped,
 * look-only sample of what students' phones show at the lesson's current step.
 * It follows the step and the lesson status live and has no picker of its own.
 *
 * Why not mount StudentStage: it starts `watchClass` (which resets the console's
 * roster and tables), subscribes the member (a write) and appends the replies
 * host to the page. Instead every step has a stand-in built from the student
 * screens' shared parts (screens.ts), with sample content for anything a student
 * makes, and the whole phone is `inert`: nothing in it can be focused or pressed.
 */

/** The ballot's real state, which decides how the sample vote looks. */
function ballotStateOf(challenge: Statement | null): SampleBallot {
	if (!isBallotFrozen(challenge)) return 'waiting';
	if (isBallotClosed(challenge)) return 'closed';

	return isBallotPaused(challenge) ? 'paused' : 'open';
}

function stepSample(key: LessonStepKey, main: Statement): m.Children {
	const resultsShown = liveResultsOn(getChallengeQuestion(getSubQuestions()));

	switch (key) {
		case 'waiting':
			return waitingSample();
		case 'opening':
			return m(OpeningView, { main });
		case 'side':
			return sideSample(main);
		case 'tables':
			return tablesSample();
		case 'tableTalk':
			return tableTalkSample(main);
		case 'proposals':
			return proposalsSample();
		case 'allProposals':
			return allProposalsSample();
		case 'vote':
			return voteSample(ballotStateOf(getChallengeQuestion(getSubQuestions())), resultsShown);
		case 'summary':
			return summarySample(main, resultsShown);
	}
}

/** The phone's content for the lesson's current step and status. */
function screenOf(main: Statement): m.Children {
	const status = lessonStatusOfMain(main);
	// Paused and ended lessons show no step name, as on the phones.
	if (status === 'paused') {
		setStudentStage(null);

		return m(LessonStateScreen, { main, status: 'paused' });
	}
	if (status === 'ended') {
		setStudentStage(null);

		return endedSample(main, liveResultsOn(getChallengeQuestion(getSubQuestions())));
	}
	const step = getLessonStep();
	setStudentStage(step.key, { index: step.index, total: getLessonSteps().length });

	return stepSample(step.key, main);
}

export const StudentScreenSample: m.Component = {
	// The stage name belongs to the phones; leaving the view must not leave it set.
	onremove() {
		setStudentStage(null);
	},

	view() {
		const main = getMainStatement();
		if (!main) return null;

		return m('section.student-screen', { 'data-testid': 'student-screen' }, [
			m('div.student-screen__phone', { role: 'group', 'aria-label': t('console.student_screen') }, [
				// inert: look only. Nothing inside takes focus, a tap or a key.
				m('div.student-screen__screen', { inert: true }, screenOf(main)),
			]),
			m('p.student-screen__note', t('console.student_screen_note')),
		]);
	},
};
