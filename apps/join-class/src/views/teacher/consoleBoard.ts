import m from 'mithril';
import { classRegistrationOf } from '@freedi/shared-types';
import type { LessonStatus, LessonStepKey, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getMainStatement, getSubQuestions } from '@/lib/store';
import {
	getChallengeQuestion,
	getGuidingQuestions,
	getLessonStep,
	getLessonSteps,
} from '@/lib/lesson';
import { classState } from '@/lib/classroom/classState';
import { gateOf } from '@/lib/classroom/classSettings';
import { decisionOf, showsDecision } from '@/lib/classroom/decision';
import {
	gateRows,
	isBallotClosed,
	isPlenum,
	rosterStudents,
	tablesAreDone,
} from '@/lib/classroom/consoleHelpers';
import { introVideosOf, projectorVideoOf } from '@/lib/classroom/introVideos';
import { sidesShownAt } from '@/lib/classroom/registrationLogic';
import { liveResultsOn, supportVisibleToClass } from '@/lib/classroom/voteResults';
import { groupWrittenTexts } from '@/lib/classroom/textsHelpers';
import { pickProjectorVideo } from './consoleActions';
import { voteCountsOn } from './classStatusData';
import { DecisionPanel } from './DecisionPanel';
import { readBallot } from './projector/projectorLogic';
import { consoleState } from './consoleState';
import type { ConsoleView } from './consoleState';
import { dragHintSeen, markDragHintDone } from './dragHintState';
import { GatePanel } from './GatePanel';
import { JoiningCard } from './JoiningCard';
import { QuestionLine } from './QuestionLine';
import { LazyStudentScreen } from './studentScreen/LazyStudentScreen';
import { OpeningPanel } from './OpeningPanel';
import { ProjectorPick } from './ProjectorPick';
import { readClassCode, studentJoinUrl } from './planHelpers';
import { SupportPanel } from './SupportPanel';
import { TablesBoard } from './TablesBoard';
import { WhatTheyWrote } from './WhatTheyWrote';
import { tableRatedText } from './allProposalsRatings';

/**
 * What fills the console under the action band: the tables (or the class list before the tables),
 * "what they wrote", or the sample of the students' screen. Split out of TeacherConsole.ts.
 */

function projectorChoice(main: Statement): m.Children {
	return m(ProjectorPick, {
		videos: introVideosOf(main),
		projectorVideoId: projectorVideoOf(main)?.id ?? null,
		held: consoleState.held,
		onPick: (id: string | null) => void pickProjectorVideo(main.statementId, id),
	});
}

function studentScreen(mid: string): m.Children {
	return [
		m(
			m.route.Link,
			{ class: 'console__link console__student-back', href: `/t/${mid}` },
			t('console.student_screen_back'),
		),
		m(LazyStudentScreen),
	];
}

function decisionCard(
	status: LessonStatus,
	stepKey: LessonStepKey,
	challenge: Statement | null,
	proposals: readonly Statement[],
): m.Children {
	if (!showsDecision({ stepKey, status, ballotClosed: isBallotClosed(challenge) })) return null;

	return m(DecisionPanel, {
		decision: decisionOf({
			ballot: readBallot(challenge),
			selections: challenge?.selections as Record<string, number> | undefined,
			proposals,
			present: voteCountsOn(challenge).present,
			resultsShown: liveResultsOn(challenge),
		}),
	});
}

export function board(
	mid: string,
	view: ConsoleView,
	stepIndex: number,
	status: LessonStatus,
): m.Children {
	const students = rosterStudents(classState.roster);
	const questions = getSubQuestions();
	const challenge = getChallengeQuestion(questions);
	const guiding = getGuidingQuestions(questions);
	// The lesson's OWN steps: an old 8-step lesson has no "כל ההצעות" (IA 19.8).
	const stepKey = getLessonSteps()[stepIndex] ?? getLessonStep().key;
	const main = getMainStatement();

	// What the phones show now: a look-only sample, never the projector (Trello 7S3Axkzd)
	if (view === 'student') return studentScreen(mid);
	if (view === 'texts') {
		const inputs = [
			...guiding.map((question) => ({ question, challenge: false })),
			...(challenge ? [{ question: challenge, challenge: true }] : []),
		];

		return m(WhatTheyWrote, {
			groups: groupWrittenTexts(inputs, consoleState.options, classState.tables),
		});
	}
	const proposals = challenge ? (consoleState.options.get(challenge.statementId) ?? []) : [];
	const gate = gateOf(challenge, main);
	const showGate =
		challenge !== null &&
		(stepKey === 'proposals' ||
			stepKey === 'allProposals' ||
			(stepKey === 'tableTalk' && proposals.length > 0));

	return [
		decisionCard(status, stepKey, challenge, proposals),
		m(TablesBoard, {
			mainId: mid,
			tables: classState.tables,
			students,
			plenum: isPlenum(challenge),
			tableTalk: stepKey === 'tableTalk',
			done: tablesAreDone(stepKey),
			namesOnly: stepKey === 'side' || stepKey === 'tables',
			questions,
			showSides: sidesShownAt(getLessonSteps(), stepIndex),
			connected: classRegistrationOf(main) !== undefined,
			dragHintSeen: dragHintSeen(),
			onDragHintDone: markDragHintDone,
			joining:
				stepKey === 'waiting' && main
					? [
							m(JoiningCard, {
								mid,
								code: readClassCode(main),
								url: studentJoinUrl(window.location.origin, mid),
								title: main.statement,
								address: window.location.host,
							}),
							challenge ? m(QuestionLine, { mid, question: challenge.statement }) : null,
						]
					: undefined,
			opening:
				stepKey === 'opening' && main
					? m(OpeningPanel, { main, projector: projectorChoice(main) })
					: undefined,
			ratedLineOf:
				stepKey === 'allProposals' ? (table) => tableRatedText(table, challenge) : undefined, // >>> allProposals
		}),
		showGate ? m(GatePanel, { rows: gateRows(proposals, gate), gate }) : null,
		stepKey === 'summary' && main
			? m(SupportPanel, { main, challenge, shownToClass: supportVisibleToClass(challenge) })
			: null,
	];
}
