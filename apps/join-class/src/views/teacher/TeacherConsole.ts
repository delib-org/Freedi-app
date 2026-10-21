import m from 'mithril';
import '@/styles/teacher.scss';
import '@/styles/console.scss';
import '@/styles/console-board.scss';
import '@/styles/console-chips.scss';
import '@/styles/console-panels.scss';
import '@/styles/console-sheet.scss';
import { t } from '@/lib/i18n';
import { getMainStatement, getSubQuestions } from '@/lib/store';
import {
	LESSON_STEP_KEYS,
	getChallengeQuestion,
	getGuidingQuestions,
	getLessonStep,
} from '@/lib/lesson';
import { classState } from '@/lib/classroom/classState';
import { gateOf } from '@/lib/classroom/classSettings';
import {
	gateRows,
	isBallotClosed,
	isBallotFrozen,
	isPlenum,
	rosterStudents,
} from '@/lib/classroom/consoleHelpers';
import { groupWrittenTexts } from '@/lib/classroom/textsHelpers';
import { FacilitatorPanel } from '@/components/FacilitatorPanel';
import { QRShare } from '@/components/QRShare';
import { WizColFooter } from '@/components/WizColFooter';
import { readClassCode, studentJoinUrl } from './planHelpers';
import {
	allTablesTo,
	assignTables,
	closeBallot,
	freezeBallot,
	goToStep,
	startPlenum,
} from './consoleActions';
import { releaseConsole, retainConsole, session } from './consoleSession';
import { consoleState, dismissFailure, watchOptions } from './consoleState';
import type { ConsoleView } from './consoleState';
import { abortDrag } from './dragController';
import { GatePanel } from './GatePanel';
import { StepRail } from './StepRail';
import { SwitchBand } from './SwitchBand';
import { TableSheetPanel } from './TableSheetPanel';
import { TablesBoard } from './TablesBoard';
import { WhatTheyWrote } from './WhatTheyWrote';

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

function currentView(): ConsoleView {
	return m.route.param('view') === 'texts' ? 'texts' : 'tables';
}

function confirmEnd(): void {
	if (window.confirm(t('console.end_confirm'))) m.route.set('/t');
}

function header(mid: string, lessonName: string | undefined, code: string | undefined): m.Vnode {
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
		m(
			m.route.Link,
			{ class: 'console__link', href: `/t/${mid}/screen` },
			t('teacher.screen.title'),
		),
		m(m.route.Link, { class: 'console__link', href: `/t/${mid}/plan` }, t('teacher.row.plan')),
	]);
}

function failureBanner(): m.Children {
	const failure = consoleState.failure;
	if (!failure) return null;

	return m('div.console__failure', { role: 'alert' }, [
		m('span', t('console.failed', { label: failure.label })),
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
	const stepKey = LESSON_STEP_KEYS[stepIndex];

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
	const gate = gateOf(challenge, getMainStatement());
	const showGate =
		challenge !== null &&
		(stepKey === 'proposals' || (stepKey === 'tableTalk' && proposals.length > 0));

	return [
		m(TablesBoard, {
			mainId: mid,
			tables: classState.tables,
			students,
			plenum,
			showSides: stepIndex >= SIDE_STEP_INDEX,
		}),
		showGate ? m(GatePanel, { rows: gateRows(proposals, gate), gate }) : null,
	];
}

export const TeacherConsole: m.Component<TeacherConsoleAttrs> = {
	oninit(vnode) {
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
		if ((vnode.state as { held?: boolean }).held) releaseConsole();
	},

	view({ attrs }) {
		const mid = m.route.param('mid') ?? session.mainId;
		const main = getMainStatement();
		const ready = session.status === 'ready' && main !== null;
		const view = currentView();

		if (!ready) {
			return m('.console', [
				header(mid, main?.statement, undefined),
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
		const questions = getSubQuestions();
		const challenge = getChallengeQuestion(questions);
		const guiding = getGuidingQuestions(questions);
		watchOptions([
			...(challenge ? [challenge.statementId] : []),
			...(view === 'texts' ? guiding.map((q) => q.statementId) : []),
		]);
		const code = readClassCode(main);

		return m('.console', { 'data-step': step.key }, [
			header(mid, main.statement, code),
			showQr
				? m('section.console__qr', [
						m(QRShare, { url: studentJoinUrl(window.location.origin, mid), title: main.statement }),
					])
				: null,
			m(StepRail, {
				keys: LESSON_STEP_KEYS,
				currentIndex: step.index,
				elapsedMs: Date.now() - session.startedAt,
				onGo: (index: number) => void goToStep(mid, index),
				onEnd: confirmEnd,
			}),
			m(SwitchBand, {
				stepKey: step.key,
				view,
				hasTables: classState.tables.length > 0,
				hasChallenge: challenge !== null,
				plenum: isPlenum(challenge),
				ballotFrozen: isBallotFrozen(challenge),
				ballotClosed: isBallotClosed(challenge),
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
				onCloseVote: () => void closeBallot(mid),
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
						onClose: () => {
							consoleState.focusTableN = attrs.sheetN ?? null;
							m.route.set(`/t/${mid}`);
						},
					})
				: null,
			m(FacilitatorPanel),
		]);
	},
};
