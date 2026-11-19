import m from 'mithril';
import '@/styles/teacher.scss';
import '@/styles/console.scss';
import '@/styles/console-board.scss';
import '@/styles/console-chips.scss';
import '@/styles/console-panels.scss';
import '@/styles/console-sheet.scss';
import '@/styles/console-next.scss';
import '@/styles/console-mobile.scss';
import '@/styles/game-console.scss';
import { t } from '@/lib/i18n';
import { getMainStatement, getSubQuestions, setFollowLessonLanguage } from '@/lib/store';
import {
	getChallengeQuestion,
	getGuidingQuestions,
	getLessonStep,
	getLessonSteps,
} from '@/lib/lesson';
import { consoleStepLabel } from '@/lib/classroom/consoleStepLabel';
import { isLessonStanding, lessonStatusOfMain } from '@/lib/lessonCore';
import { classRegistrationOf, proposalLimitOf } from '@freedi/shared-types';
import type { ClassVoteOrder, Statement } from '@freedi/shared-types';
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
import {
	liveResultsOn,
	supportShownOn,
	supportVisibleToClass,
	voteOrderOf,
	voteResults,
} from '@/lib/classroom/voteResults';
import { everyoneVoted } from '@/lib/classroom/voteSummary';
import { noDeviceTotal } from '@/lib/classroom/actFor';
import { groupWrittenTexts } from '@/lib/classroom/textsHelpers';
import { flagState } from '@/lib/classroom/languageFlags';
import { unseenFlagCount } from '@/lib/classroom/flagLogic';
import { syncRegistrationWatch, watchedRegistration } from '@/lib/classroom/registrationData';
import {
	copyOfferOf,
	isSeatingCopied,
	sidesShownAt,
	withoutTableCount,
} from '@/lib/classroom/registrationLogic';
import { QRShare } from '@/components/QRShare';
import { WizColFooter } from '@/components/WizColFooter';
import { readClassCode, studentJoinUrl } from './planHelpers';
import {
	allTablesNewTurn,
	allTablesTo,
	assignTables,
	changeLessonStatus,
	pauseBallot,
	pickProjectorVideo,
	setVoteDisplay,
	setVoteOrder,
	startPlenum,
} from './consoleActions';
import { releaseConsole, retainConsole, session } from './consoleSession';
import { consoleState, watchOptions } from './consoleState';
import type { ConsoleView } from './consoleState';
import { consoleViewOf } from './consoleView';
import { LazyStudentScreen } from './studentScreen/LazyStudentScreen';
import { abortDrag } from './dragController';
import { EndChoice, openEndChoice } from './EndChoice';
import { backBar, failureBanner, header } from './ConsoleBar';
import { lessonNameOf } from '@/lib/lessonLinks';
import { LessonBanner } from './LessonBanner';
import { ConfirmDialog } from './ConfirmDialog';
import {
	confirmGoBack,
	confirmResetTurns,
	confirmResetVote,
	confirmResplit,
} from './consoleConfirms';
import { NotYourLesson } from './NotYourLesson';
import { GatePanel } from './GatePanel';
import { SupportPanel } from './SupportPanel';
import { voteScopeOf } from './voteScopeState';
import { ActForEntry } from './actFor/ActForEntry';
import { ActForSheet } from './actFor/ActForSheet';
import { actForMode, syncActFor } from './actFor/actForState';
import { StepLine } from './StepLine';
import { ActionBand } from './ActionBand';
import { SwitchBand } from './SwitchBand';
import { introVideosOf, projectorVideoOf } from '@/lib/classroom/introVideos';
import { TableSheetPanel } from './TableSheetPanel';
import { OpeningPanel } from './OpeningPanel';
import { ChallengeNeeded } from './ChallengeNeeded';
import { TablesBoard } from './TablesBoard';
import { CopySeating } from './CopySeating';
import { RegisterAheadRow, RegistrationStrip } from './RegistrationStrip';
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

let showQr = false;

const qr = {
	get shown(): boolean {
		return showQr;
	},
	toggle: (): void => {
		showQr = !showQr;
	},
};

// >>> voteSummary BEGIN
/** Votes cast on the running ballot, and the students in the room. */
function voteCountsOn(challenge: Statement | null): { voted: number; present: number } {
	const ids = challenge?.statementSettings?.ballot?.candidateIds ?? [];
	const voted = Object.values(voteResults(ids, challenge?.selections)).reduce(
		(sum, result) => sum + result.count,
		0,
	);

	return {
		voted,
		present: rosterStudents(classState.roster).length + noDeviceTotal(classState.tables),
	};
}

/** Every student in the room has a vote on the running ballot. */
function allVotedOn(challenge: Statement | null): boolean {
	const { voted, present } = voteCountsOn(challenge);

	return isBallotFrozen(challenge) && everyoneVoted(voted, present);
}
// >>> voteSummary END

function currentView(): ConsoleView {
	return consoleViewOf(m.route.param('view'));
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

	// What the phones show now: a look-only sample, never the projector (Trello 7S3Axkzd)
	if (view === 'student') return m(LazyStudentScreen);
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
			namesOnly: stepKey === 'side' || stepKey === 'tables',
			questions,
			showSides: sidesShownAt(getLessonSteps(), stepIndex),
			connected: classRegistrationOf(main) !== undefined,
			opening: stepKey === 'opening' && main ? m(OpeningPanel, { main }) : undefined,
			ratedLineOf:
				stepKey === 'allProposals' ? (table) => tableRatedText(table, challenge) : undefined, // >>> allProposals
		}),
		showGate ? m(GatePanel, { rows: gateRows(proposals, gate), gate }) : null,
		stepKey === 'summary' && main
			? m(SupportPanel, { main, challenge, shownToClass: supportVisibleToClass(challenge) })
			: null,
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
		syncRegistrationWatch(null);
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
				backBar(mid),
				header(mid, main ? lessonNameOf(main) : undefined, undefined, null, qr),
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
		Object.assign(consoleState, { held, ended: status === 'ended' });
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
		const registration = classRegistrationOf(main);
		syncRegistrationWatch(registration?.tableAssignmentId ?? null);
		const copyOffer = copyOfferOf({
			connected: registration !== undefined,
			copied: isSeatingCopied(main),
			status: watchedRegistration.assignment?.status,
			splitByTopic: watchedRegistration.assignment?.splitByTopic === true,
			stepKey: step.key,
		});
		// >>> allProposals BEGIN
		const atAllProposals = step.key === 'allProposals';
		watchAllProposalsRatings(atAllProposals ? (challenge?.statementId ?? null) : null);
		// >>> allProposals END
		const challengeProposals = challenge
			? (consoleState.options.get(challenge.statementId) ?? [])
			: [];
		syncActFor({
			mainId: mid,
			challengeId: challenge?.statementId ?? null,
			ballot: challenge?.statementSettings?.ballot,
			held,
			stepKey: step.key,
			tables: classState.tables,
		});

		return m('.console', { 'data-step': step.key }, [
			backBar(mid),
			header(mid, lessonNameOf(main), code, status, qr),
			showQr
				? m('section.console__qr', [
						m(QRShare, { url: studentJoinUrl(window.location.origin, mid), title: main.statement }),
					])
				: null,
			registration
				? m(RegistrationStrip, { mid, registration })
				: step.key === 'waiting'
					? m(RegisterAheadRow, { mid })
					: null,
			m(LessonBanner, {
				status,
				onEnd: openEndChoice,
				onReopen: () => void changeLessonStatus(mid, 'reopen'),
			}),
			m(StepLine, {
				keys: steps,
				currentIndex: step.index,
				elapsedMs: clockEnd - session.startedAt,
				held,
				heldKey: status === 'ended' ? 'console.ended_banner' : 'lesson.paused.title',
				// Going back keeps all work but asks first. Forward is only the big button.
				onBack: (index: number) => confirmGoBack(mid, index, consoleStepLabel(steps[index])),
			}),
			m(ActionBand, {
				mid,
				status,
				stepKey: step.key,
				stepIndex: step.index,
				steps,
				challenge,
				ballotFrozen: isBallotFrozen(challenge),
				ballotClosed: isBallotClosed(challenge),
				votedCount: voteCountsOn(challenge).voted,
				presentCount: voteCountsOn(challenge).present,
				proposalCount: challengeProposals.filter((proposal) => !proposal.hide).length,
				tableCount: classState.tables.length,
				studentCount: rosterStudents(classState.roster).length,
				copyOffer,
				resultsShown: liveResultsOn(challenge),
			}),
			m(SwitchBand, {
				held,
				ended: status === 'ended',
				stepKey: step.key,
				view,
				hasTables: classState.tables.length > 0,
				hasChallenge: challenge !== null,
				flagCount: unseenFlagCount(flagState.flags),
				plenum: isPlenum(challenge),
				ballotFrozen: isBallotFrozen(challenge),
				ballotPaused: isBallotPaused(challenge),
				ballotClosed: isBallotClosed(challenge),
				voteOrder: voteOrderOf(challenge),
				onVoteOrder: (order: ClassVoteOrder) => {
					if (challenge) void setVoteOrder(challenge.statementId, order);
				},
				resultsShown: liveResultsOn(challenge),
				onResultsShown: (shown: boolean) => {
					if (challenge) void setVoteDisplay(challenge.statementId, 'liveResults', shown);
				},
				supportShown: supportShownOn(challenge),
				onSupportShown: (shown: boolean) => {
					if (challenge) void setVoteDisplay(challenge.statementId, 'supportShown', shown);
				},
				voteScope: voteScopeOf(
					challenge,
					main,
					challenge ? (consoleState.options.get(challenge.statementId) ?? []) : [],
				),
				// >>> voteSummary BEGIN
				allVoted: allVotedOn(challenge),
				votedCount: voteCountsOn(challenge).voted,
				presentCount: voteCountsOn(challenge).present,
				// >>> voteSummary END
				introVideos: introVideosOf(main),
				projectorVideoId: projectorVideoOf(main)?.id ?? null,
				onProject: (id: string | null) => void pickProjectorVideo(mid, id),
				onView: (next: ConsoleView) =>
					m.route.set(m.route.get().split('?')[0], next === 'tables' ? {} : { view: next }, {
						replace: true,
					}),
				copySeating:
					registration && (copyOffer.kind === 'again' || copyOffer.kind === 'not-ready')
						? m(CopySeating, {
								mid,
								registrationId: registration.tableAssignmentId,
								offer: copyOffer,
								withoutTable: withoutTableCount(
									rosterStudents(classState.roster).map((student) => student.uid),
									classState.tables,
								),
							})
						: undefined,
				onSplit: (replace: boolean) => {
					if (replace) confirmResplit(mid);
					else void assignTables(mid, replace);
				},
				onAllToRate: () => void allTablesTo(mid, 'rate'),
				onAnotherTurnAll: () => void allTablesNewTurn(mid),
				onPlenum: () => {
					if (challenge) void startPlenum(challenge.statementId);
				},
				onPauseVote: (paused: boolean) => void pauseBallot(mid, paused),
				onResetTurns: () => confirmResetTurns(mid),
				onResetVote: () => confirmResetVote(mid),
				allRatedLine: atAllProposals ? allRatedBandLine(challenge) : undefined, // >>> allProposals
				actForEntry:
					actForMode() !== 'none' && classState.tables.length > 0
						? m(ActForEntry, { tables: classState.tables, proposals: challengeProposals })
						: null,
			}),
			failureBanner(),
			challenge === null && !held
				? m(ChallengeNeeded, {
						mainId: mid,
						started: step.key !== 'waiting',
						candidates: guiding,
					})
				: null,
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
						lessonName: lessonNameOf(main),
						connected: registration !== undefined,
						onClose: () => {
							consoleState.focusTableN = attrs.sheetN ?? null;
							m.route.set(`/t/${mid}`);
						},
					})
				: null,
			m(ActForSheet, {
				mainId: mid,
				tables: classState.tables,
				challenge,
				proposals: challengeProposals,
				held,
				limit: proposalLimitOf(main),
			}),
			m(EndChoice, { mainId: mid, status }),
			m(ConfirmDialog),
		]);
	},
};
