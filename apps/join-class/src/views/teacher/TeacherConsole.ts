import m from 'mithril';
import '@/styles/teacher.scss';
import '@/styles/console.scss';
import '@/styles/console-board.scss';
import '@/styles/console-chips.scss';
import '@/styles/console-panels.scss';
import '@/styles/console-sheet.scss';
import '@/styles/console-mobile.scss';
import { t } from '@/lib/i18n';
import { getMainStatement, getSubQuestions, setFollowLessonLanguage } from '@/lib/store';
import {
	getChallengeQuestion,
	getGuidingQuestions,
	getLessonStep,
	getLessonSteps,
	stepLabel,
} from '@/lib/lesson';
import { isLessonStanding, lessonStatusOfMain } from '@/lib/lessonCore';
import type { LessonStatus, Statement } from '@freedi/shared-types';
import { classState } from '@/lib/classroom/classState';
import { gateOf } from '@/lib/classroom/classSettings';
import {
	gateRows,
	isBallotClosed,
	isBallotFrozen,
	isBallotPaused,
	isPlenum,
	rosterStudents,
	tablesAreDone,
} from '@/lib/classroom/consoleHelpers';
import { voteResults } from '@/lib/classroom/voteResults';
import { everyoneVoted } from '@/lib/classroom/voteSummary';
import { groupWrittenTexts } from '@/lib/classroom/textsHelpers';
import { QRShare } from '@/components/QRShare';
import { WizColFooter } from '@/components/WizColFooter';
import { readClassCode, studentJoinUrl } from './planHelpers';
import {
	allTablesTo,
	assignTables,
	changeLessonStatus,
	closeBallot,
	freezeBallot,
	goToStep,
	pauseBallot,
	pickProjectorVideo,
	startPlenum,
} from './consoleActions';
import { releaseConsole, retainConsole, session } from './consoleSession';
import { consoleState, dismissFailure, isBusy, watchOptions } from './consoleState';
import type { ConsoleView } from './consoleState';
import { abortDrag } from './dragController';
import { EndChoice, openEndChoice } from './EndChoice';
import { LessonBanner } from './LessonBanner';
import { ConfirmDialog } from './ConfirmDialog';
import {
	confirmCloseAndGo,
	confirmGoBack,
	confirmResetTurns,
	confirmResetVote,
} from './consoleConfirms';
import { NotYourLesson } from './NotYourLesson';
import { ConsoleSettings } from './ConsoleSettings';
import { ProjectorMenu } from './ProjectorMenu';
import { GatePanel } from './GatePanel';
import { StepRail } from './StepRail';
import { SwitchBand } from './SwitchBand';
import { introVideosOf, projectorVideoOf } from '@/lib/classroom/introVideos';
import { TableSheetPanel } from './TableSheetPanel';
import { OpeningPanel } from './OpeningPanel';
import { TablesBoard } from './TablesBoard';
import { WhatTheyWrote } from './WhatTheyWrote';
// >>> allProposals BEGIN
import {
	allRatedBandLine,
	stopAllProposalsRatings,
	tableRatedText,
	watchAllProposalsRatings,
} from './allProposalsRatings';
// >>> allProposals END

/**
 * The teacher console (route /t/:mid): three fixed bands (step rail 96 px,
 * switch 48 px, board) over the live classroom state. `sheetN` (set by the
 * /t/:mid/table/:n route) opens that table's side sheet over the board.
 */

export interface TeacherConsoleAttrs {
	sheetN?: number;
}

/** Index of the Side step: marks appear on the roster from here on. */
const SIDE_STEP_INDEX = 2;

let showQr = false;

// >>> voteSummary BEGIN
/** Every student in the room has a vote on the running ballot. */
function allVotedOn(challenge: Statement | null): boolean {
	const ids = challenge?.statementSettings?.ballot?.candidateIds ?? [];
	const voted = Object.values(voteResults(ids, challenge?.selections)).reduce(
		(sum, result) => sum + result.count,
		0,
	);

	return (
		isBallotFrozen(challenge) && everyoneVoted(voted, rosterStudents(classState.roster).length)
	);
}
// >>> voteSummary END

function currentView(): ConsoleView {
	return m.route.param('view') === 'texts' ? 'texts' : 'tables';
}

/** "Pause the lesson" and "End the lesson" (UX 13.E): the status group at the bar's end. */
function statusGroup(mid: string, status: LessonStatus | null): m.Children {
	if (status !== 'live' && status !== 'open') return null;
	const pausing = isBusy('status:pause');

	return m('div.console__status', [
		m(
			'button.btn.btn--secondary.btn--small.console__pause',
			{
				type: 'button',
				'data-testid': 'console-pause',
				disabled: pausing,
				'aria-busy': pausing ? 'true' : undefined,
				onclick: () => void changeLessonStatus(mid, 'pause'),
			},
			[
				m('span.status-mark.status-mark--paused', { 'aria-hidden': 'true' }),
				m('span', pausing ? t('console.busy_pausing') : t('console.pause')),
			],
		),
		// An open lesson keeps its "End the lesson" in the banner below.
		status === 'live'
			? m(
					'button.btn.btn--tertiary.btn--small.console__end',
					{ type: 'button', 'data-testid': 'console-end', onclick: openEndChoice },
					t('console.end'),
				)
			: null,
	]);
}

function header(
	mid: string,
	lessonName: string | undefined,
	code: string | undefined,
	status: LessonStatus | null,
): m.Vnode {
	return m('header.console__bar', [
		m(m.route.Link, { class: 'plan__back', href: '/t' }, [
			m('span.plan__back-chevron', { 'aria-hidden': 'true' }, '‹'),
			m('span', t('teacher.home.title')),
		]),
		m('h1.console__title', lessonName ?? t('teacher.console.title')),
		code
			? m('p.console__code', [
					m('span.console__code-label', `${t('teacher.console.code')}:`),
					m('strong.console__code-value', { dir: 'ltr' }, code),
				])
			: null,
		m(
			'button.btn.btn--tertiary.console__qr-btn',
			{
				type: 'button',
				'aria-expanded': showQr ? 'true' : 'false',
				onclick: () => {
					showQr = !showQr;
				},
			},
			t('console.qr'),
		),
		m(ProjectorMenu, { mid }),
		m(m.route.Link, { class: 'console__link', href: `/t/${mid}/plan` }, t('teacher.row.plan')),
		m(ConsoleSettings),
		statusGroup(mid, status),
	]);
}

function failureBanner(): m.Children {
	const failure = consoleState.failure;
	if (!failure) return null;

	return m('div.console__failure', { role: 'alert' }, [
		m('span', failure.message ?? t('console.failed', { label: failure.label })),
		m('button.btn.btn--secondary', { type: 'button', onclick: failure.retry }, t('console.retry')),
		m(
			'button.btn.btn--tertiary',
			{ type: 'button', onclick: dismissFailure },
			t('console.dismiss'),
		),
	]);
}

function board(mid: string, view: ConsoleView, stepIndex: number): m.Children {
	const students = rosterStudents(classState.roster);
	const questions = getSubQuestions();
	const challenge = getChallengeQuestion(questions);
	const guiding = getGuidingQuestions(questions);
	const plenum = isPlenum(challenge);
	// The lesson's OWN steps: an old 8-step lesson has no "כל ההצעות" (IA 19.8).
	const stepKey = getLessonSteps()[stepIndex] ?? getLessonStep().key;
	const main = getMainStatement();

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
		m(TablesBoard, {
			mainId: mid,
			tables: classState.tables,
			students,
			plenum,
			tableTalk: stepKey === 'tableTalk',
			done: tablesAreDone(stepKey),
			questions,
			showSides: stepIndex >= SIDE_STEP_INDEX,
			opening: stepKey === 'opening' && main ? m(OpeningPanel, { main }) : undefined,
			ratedLineOf:
				stepKey === 'allProposals' ? (table) => tableRatedText(table, challenge) : undefined, // >>> allProposals
		}),
		showGate ? m(GatePanel, { rows: gateRows(proposals, gate), gate }) : null,
	];
}

export const TeacherConsole: m.Component<TeacherConsoleAttrs> = {
	oninit(vnode) {
		setFollowLessonLanguage(false);
		const mid = m.route.param('mid');
		if (!mid) {
			m.route.set('/t');

			return;
		}
		showQr = false;
		(vnode.state as { held?: boolean }).held = true;
		retainConsole(mid);
	},

	onremove(vnode) {
		abortDrag();
		stopAllProposalsRatings(); // >>> allProposals
		if ((vnode.state as { held?: boolean }).held) releaseConsole();
	},

	view({ attrs }) {
		const mid = m.route.param('mid') ?? session.mainId;
		const main = getMainStatement();
		const ready = session.status === 'ready' && main !== null;
		const view = currentView();

		if (session.status === 'denied') return m(NotYourLesson);

		if (!ready) {
			return m('.console', [
				header(mid, main?.statement, undefined, null),
				m(
					'main.console__board',
					session.status === 'failed'
						? m('p.plan__load-error', { role: 'alert' }, t('plan.error.load'))
						: m('.plan__skeleton', { 'aria-busy': 'true', 'aria-label': t('plan.loading') }, [
								m('.plan__skeleton-block.plan__skeleton-block--tall'),
							]),
				),
				m(WizColFooter),
			]);
		}

		const step = getLessonStep();
		const status = lessonStatusOfMain(main);
		const held = isLessonStanding(status);
		consoleState.held = held;
		const plan = main.statementSettings?.lessonPlan;
		// The lesson clock stops while the room is held.
		const clockEnd = held ? (plan?.pausedAt ?? plan?.endedAt ?? Date.now()) : Date.now();
		const questions = getSubQuestions();
		const challenge = getChallengeQuestion(questions);
		const guiding = getGuidingQuestions(questions);
		watchOptions([
			...(challenge ? [challenge.statementId] : []),
			...(view === 'texts' ? guiding.map((q) => q.statementId) : []),
		]);
		const code = readClassCode(main);
		const steps = getLessonSteps();
		// >>> allProposals BEGIN
		const atAllProposals = step.key === 'allProposals';
		watchAllProposalsRatings(atAllProposals ? (challenge?.statementId ?? null) : null);
		// >>> allProposals END

		return m('.console', { 'data-step': step.key }, [
			header(mid, main.statement, code, status),
			showQr
				? m('section.console__qr', [
						m(QRShare, { url: studentJoinUrl(window.location.origin, mid), title: main.statement }),
					])
				: null,
			m(LessonBanner, {
				status,
				onResume: () => void changeLessonStatus(mid, 'resume'),
				onEnd: openEndChoice,
				onReopen: () => void changeLessonStatus(mid, 'reopen'),
			}),
			m(StepRail, {
				keys: steps,
				currentIndex: step.index,
				elapsedMs: clockEnd - session.startedAt,
				held,
				heldKey: status === 'ended' ? 'console.ended_banner' : 'lesson.paused.title',
				onGo: (index: number) => {
					// Going back keeps all work but asks first; forward is one tap.
					if (index < step.index) confirmGoBack(mid, index, stepLabel(steps[index]));
					// >>> voteSummary BEGIN
					// An open or paused vote has no decision yet: ask, close it, then move on.
					else if (step.key === 'vote' && isBallotFrozen(challenge) && !isBallotClosed(challenge))
						confirmCloseAndGo(mid, index);
					// >>> voteSummary END
					else void goToStep(mid, index);
				},
				onEnd: openEndChoice,
			}),
			m(SwitchBand, {
				held,
				ended: status === 'ended',
				stepKey: step.key,
				view,
				hasTables: classState.tables.length > 0,
				hasChallenge: challenge !== null,
				plenum: isPlenum(challenge),
				ballotFrozen: isBallotFrozen(challenge),
				ballotPaused: isBallotPaused(challenge),
				ballotClosed: isBallotClosed(challenge),
				// >>> voteSummary BEGIN
				allVoted: allVotedOn(challenge),
				// >>> voteSummary END
				introVideos: introVideosOf(main),
				projectorVideoId: projectorVideoOf(main)?.id ?? null,
				onProject: (id: string | null) => void pickProjectorVideo(mid, id),
				onView: (next: ConsoleView) =>
					m.route.set(m.route.get().split('?')[0], next === 'tables' ? {} : { view: next }, {
						replace: true,
					}),
				onSplit: (replace: boolean) => {
					if (replace && !window.confirm(t('console.resplit_confirm'))) return;
					void assignTables(mid, replace);
				},
				onAllToRate: () => void allTablesTo(mid, 'rate'),
				onPlenum: () => {
					if (challenge) void startPlenum(challenge.statementId);
				},
				onFreeze: () => void freezeBallot(mid),
				onPauseVote: (paused: boolean) => void pauseBallot(mid, paused),
				onCloseVote: () => void closeBallot(mid),
				onResetTurns: () => confirmResetTurns(mid),
				onResetVote: () => confirmResetVote(mid),
				allRatedLine: atAllProposals ? allRatedBandLine(challenge) : undefined, // >>> allProposals
			}),
			failureBanner(),
			m('main.console__board', board(mid, view, step.index)),
			consoleState.ghost
				? m(
						'div.chip-ghost',
						{
							'aria-hidden': 'true',
							style: { '--x': `${consoleState.ghost.x}px`, '--y': `${consoleState.ghost.y}px` },
						},
						consoleState.ghost.name,
					)
				: null,
			attrs.sheetN !== undefined
				? m(TableSheetPanel, {
						mainId: mid,
						n: attrs.sheetN,
						tables: classState.tables,
						students: rosterStudents(classState.roster),
						questions,
						plenum: isPlenum(challenge),
						tableTalk: step.key === 'tableTalk',
						onClose: () => {
							consoleState.focusTableN = attrs.sheetN ?? null;
							m.route.set(`/t/${mid}`);
						},
					})
				: null,
			m(EndChoice, { mainId: mid, status }),
			m(ConfirmDialog),
		]);
	},
};
