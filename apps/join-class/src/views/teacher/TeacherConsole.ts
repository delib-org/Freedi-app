import m from 'mithril';
import '@/styles/teacher.scss';
import '@/styles/console.scss';
import '@/styles/console-board.scss';
import '@/styles/console-chips.scss';
import '@/styles/console-panels.scss';
import '@/styles/console-sheet.scss';
import '@/styles/console-next.scss';
import '@/styles/console-more.scss';
import '@/styles/console-mobile.scss';
import '@/styles/game-console.scss';
import '@/styles/mulberry/index.scss';
import { t } from '@/lib/i18n';
import { getMainStatement, getSubQuestions, setFollowLessonLanguage } from '@/lib/store';
import {
	getChallengeQuestion,
	getGuidingQuestions,
	getLessonStep,
	getLessonSteps,
} from '@/lib/lesson';
import { isLessonStanding, lessonStatusOfMain } from '@/lib/lessonCore';
import { classRegistrationOf, proposalLimitOf } from '@freedi/shared-types';
import { classState } from '@/lib/classroom/classState';
import {
	isBallotClosed,
	isBallotFrozen,
	isPlenum,
	rosterStudents,
} from '@/lib/classroom/consoleHelpers';
import { liveResultsOn } from '@/lib/classroom/voteResults';
import { flagState } from '@/lib/classroom/languageFlags';
import { unseenFlagCount } from '@/lib/classroom/flagLogic';
import { syncRegistrationWatch, watchedRegistration } from '@/lib/classroom/registrationData';
import { copyOfferOf, isSeatingCopied, withoutTableCount } from '@/lib/classroom/registrationLogic';
import { WizColFooter } from '@/components/WizColFooter';
import { QRShare } from '@/components/QRShare';
import { readClassCode, studentJoinUrl } from './planHelpers';
import { changeLessonStatus } from './consoleActions';
import { releaseConsole, retainConsole, session } from './consoleSession';
import { consoleState, watchOptions } from './consoleState';
import type { ConsoleView } from './consoleState';
import { consoleViewOf } from './consoleView';
import { abortDrag } from './dragController';
import { EndChoice } from './EndChoice';
import { backBar, failureBanner, header } from './ConsoleBar';
import { lessonNameOf } from '@/lib/lessonLinks';
import { LessonBanner } from './LessonBanner';
import { ConfirmDialog } from './ConfirmDialog';
import { confirmGoBack } from './consoleConfirms';
import { consoleStepLabel } from '@/lib/classroom/consoleStepLabel';
import { NotYourLesson } from './NotYourLesson';
import { ActForEntry } from './actFor/ActForEntry';
import { ActForSheet } from './actFor/ActForSheet';
import { actForMode, syncActFor } from './actFor/actForState';
import { StepLine } from './StepLine';
import { ActionBand } from './ActionBand';
import { SwitchBand } from './SwitchBand';
import { liveStatusInput, voteCountsOn } from './classStatusData';
import { markDragHintDone } from './dragHintState';
import { setStudentMovedHook } from './moveHook';
import { board } from './consoleBoard';
import { TableSheetPanel } from './TableSheetPanel';
import { ChallengeNeeded } from './ChallengeNeeded';
import { ChallengeDialog } from './ChallengeDialog';
import { CopySeating } from './CopySeating';
import { RegistrationStrip } from './RegistrationStrip';
// >>> allProposals BEGIN
import {
	allRatedState,
	stopAllProposalsRatings,
	watchAllProposalsRatings,
} from './allProposalsRatings';
// >>> allProposals END

/**
 * The teacher console (route /t/:mid): the step line ("where we are"), the action band (what the
 * class is doing and the ONE button to press), the view switch and the board, over the live
 * classroom state. `sheetN` (set by the /t/:mid/table/:n route) opens that table's side sheet
 * over the board.
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

function currentView(): ConsoleView {
	return consoleViewOf(m.route.param('view'));
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
		setStudentMovedHook(() => {
			markDragHintDone();
			m.redraw();
		});
		(vnode.state as { held?: boolean }).held = true;
		retainConsole(mid);
	},

	onremove(vnode) {
		abortDrag();
		setStudentMovedHook(null);
		stopAllProposalsRatings(); // >>> allProposals
		syncRegistrationWatch(null);
		if ((vnode.state as { held?: boolean }).held) releaseConsole();
	},

	view({ attrs }) {
		const mid = m.route.param('mid') ?? session.mainId;
		const main = getMainStatement();
		const ready = session.status === 'ready' && main !== null;
		const routeView = currentView();

		if (session.status === 'denied') return m(NotYourLesson);

		if (!ready) {
			return m('.console', [
				backBar(mid),
				header(mid, main ? lessonNameOf(main) : undefined, undefined, null),
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
		// Step 1 has no "what they wrote" yet and no tabs to leave it by.
		const atWaiting = step.key === 'waiting';
		const view: ConsoleView = atWaiting && routeView === 'texts' ? 'tables' : routeView;
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
		const votes = voteCountsOn(challenge);

		return m('.console', { 'data-step': step.key }, [
			backBar(mid),
			header(mid, lessonNameOf(main), code, status, {
				stepKey: step.key,
				connected: registration !== undefined,
				qr,
			}),
			showQr && step.key !== 'waiting'
				? m('section.console__qr', [
						m(QRShare, { url: studentJoinUrl(window.location.origin, mid), title: main.statement }),
					])
				: null,
			registration ? m(RegistrationStrip, { mid, registration }) : null,
			m(LessonBanner, {
				status,
				onReopen: () => void changeLessonStatus(mid, 'reopen'),
			}),
			m(StepLine, {
				keys: steps,
				currentIndex: step.index,
				elapsedMs: clockEnd - session.startedAt,
				showClock: !atWaiting,
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
				votedCount: votes.voted,
				presentCount: votes.present,
				proposalCount: challengeProposals.filter((proposal) => !proposal.hide).length,
				tableCount: classState.tables.length,
				studentCount: rosterStudents(classState.roster).length,
				copyOffer,
				resultsShown: liveResultsOn(challenge),
				statusInput: liveStatusInput({
					stepKey: step.key,
					challenge,
					status,
					allRated: atAllProposals ? allRatedState(challenge) : null, // >>> allProposals
				}),
				statusEntry:
					actForMode() !== 'none' && classState.tables.length > 0
						? m(ActForEntry, { tables: classState.tables, proposals: challengeProposals })
						: undefined,
				main,
				plenum: isPlenum(challenge),
				connected: registration !== undefined,
				registrationId: registration?.tableAssignmentId,
			}),
			atWaiting
				? null
				: m(SwitchBand, {
						view,
						flagCount: unseenFlagCount(flagState.flags),
						onView: (next: ConsoleView) =>
							m.route.set(m.route.get().split('?')[0], next === 'tables' ? {} : { view: next }, {
								replace: true,
							}),
					}),
			failureBanner(),
			// Step 1 asks for the question in a dialog (the big button opens it); later steps keep the box.
			challenge === null && !held && !atWaiting
				? m(ChallengeNeeded, { mainId: mid, started: true, candidates: guiding })
				: null,
			atWaiting
				? m(ChallengeDialog, {
						mainId: mid,
						candidates: guiding,
						hasChallenge: challenge !== null,
					})
				: null,
			registration && copyOffer.kind !== 'ordinary'
				? m(CopySeating, {
						mid,
						registrationId: registration.tableAssignmentId,
						offer: copyOffer,
						withoutTable: withoutTableCount(
							rosterStudents(classState.roster).map((student) => student.uid),
							classState.tables,
						),
					})
				: null,
			m('main.console__board', board(mid, view, step.index, status)),
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
