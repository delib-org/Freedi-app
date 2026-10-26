import m from 'mithril';
import type { ClassTableAction } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getGuidingQuestions } from '@/lib/lesson';
import { classTableStep } from '@/lib/classroom/api';
import { createTableQuestion } from '@/lib/classroom/c3Data';
import { questionTextFrom } from '@/lib/classroom/questionLookup';
import { getFetchedQuestionTexts, requestQuestionText } from '@/lib/classroom/questionText';
import { Countdown, msLeft } from './Countdown';
import { lessonSpeakMs, tableSpeakMs } from '@/lib/classroom/speakTime';
import { isRaceRefusal, maxTurns, refusalReason } from '@/lib/classroom/turnMoment';
import { claimLabelKey } from '@/lib/classroom/c3Logic';
import { questionCapOf } from '@/lib/classroom/ownQuestions';
import { allowOwnQuestionsOf, noQuestionsLeft } from '@freedi/shared-types';
import { passedAnswer, tableTalkState, type TableTalkState } from '@/lib/classroom/tableTalkState';
import { FlowError, type FlowCtx, type FlowParts } from './flowTypes';
import { QuestionPick, type PickQuestion } from './QuestionPick';
import { TurnActions } from './TurnActions';
import { ErrorLine } from './ErrorLine';

/**
 * The Table talk half of TableFlow (UX 16 rev 3): one calm screen per state,
 * D, P1, P2, S, L, W, A, H (tableTalkState.ts). No strip, no pills, no askers
 * row, no speaker chips. Props in, vnodes out.
 */

/** "Finish" ignores taps (and is drawn disabled) for the first second of a minute. */
export const FINISH_GUARD_MS = 1000;
/** How long the quiet "who was first" line stays. */
export const WAS_FIRST_MS = 4000;

function pickQuestions(ctx: FlowCtx): PickQuestion[] {
	const { table, questions, main } = ctx;
	const ownAllowed = allowOwnQuestionsOf(main);

	return getGuidingQuestions(questions)
		.filter((q) => !q.classTable || (ownAllowed && q.classTable.tableId === table.tableId))
		.map((q) => ({
			id: q.statementId,
			text: q.statement,
			hint: q.statementSettings?.hint,
			own: !!q.classTable,
			used: table.usedQuestionIds.includes(q.statementId),
		}));
}

export function nameOf(ctx: FlowCtx, uid: string | undefined): string {
	if (!uid) return ctx.someone;
	const nd = ctx.table.noDeviceMembers.find((member) => member.id === uid);

	return nd?.name ?? ctx.mates.find((mate) => mate.uid === uid)?.name ?? ctx.someone;
}

/** Runs one table step; a lost race is not an error: the table doc already shows who won. */
export function step(
	ctx: FlowCtx,
	action: ClassTableAction,
	onRace?: (reason: string | null) => void,
): void {
	const { table } = ctx;
	ctx.run(async () => {
		try {
			await classTableStep({ tableId: table.tableId, ...action });
		} catch (error) {
			if (!isRaceRefusal(error)) throw error;
			onRace?.(refusalReason(error));
		}
	});
}

function noteWasFirst(ctx: FlowCtx, kind: 'turn' | 'floor'): void {
	const { self } = ctx;
	self.wasFirst = { kind, until: Date.now() + WAS_FIRST_MS };
	setTimeout(() => m.redraw(), WAS_FIRST_MS + 50);
}

function hasChoice(ctx: FlowCtx, teacherUsedUp: boolean): boolean {
	const { self } = ctx;
	const ownOn =
		allowOwnQuestionsOf(ctx.main) &&
		(self.ownSelected || (teacherUsedUp && self.chosenId === null));

	return ownOn ? self.ownText.trim() !== '' : self.chosenId !== null;
}

/** "I want to start": create the own question once if that is the choice, then claim the turn. */
function startTurn(ctx: FlowCtx, teacherUsedUp: boolean): void {
	const { self, table, main } = ctx;
	if (!hasChoice(ctx, teacherUsedUp)) {
		self.pickFirst = true;
		document.querySelector<HTMLElement>('[data-testid="table-pick-question"]')?.focus();
		m.redraw();

		return;
	}
	const ownOn =
		allowOwnQuestionsOf(ctx.main) &&
		(self.ownSelected || (teacherUsedUp && self.chosenId === null));
	ctx.run(async () => {
		let questionId = self.chosenId;
		if (ownOn) {
			if (!self.ownCreatedId) {
				try {
					self.ownCreatedId = await createTableQuestion(main, self.ownText.trim(), table.tableId);
				} catch {
					throw new FlowError('question.add_failed');
				}
			}
			questionId = self.ownCreatedId;
		}
		if (!questionId) return;
		try {
			await classTableStep({
				tableId: table.tableId,
				action: 'claimTurn',
				fromTurn: table.turn,
				questionId,
			});
			self.ownText = '';
			self.ownCreatedId = null;
			self.ownSelected = false;
			self.chosenId = null;
		} catch (error) {
			if (refusalReason(error) === 'question-used') {
				self.chosenId = null;
				throw error;
			}
			if (!isRaceRefusal(error)) throw error;
			if (refusalReason(error) === 'turn-claimed') noteWasFirst(ctx, 'turn');
		}
	});
}

function pickBody(
	ctx: FlowCtx,
	teacherUsedUp: boolean,
	noTeacher: boolean,
	allowOwn: boolean,
): m.Children {
	const { self } = ctx;
	const ownOn = allowOwn && (self.ownSelected || (teacherUsedUp && self.chosenId === null));

	return m(QuestionPick, {
		questions: pickQuestions(ctx),
		selectedId: self.chosenId,
		ownSelected: ownOn,
		ownText: self.ownText,
		teacherUsedUp,
		noTeacherQuestions: noTeacher,
		allowOwn,
		disabled: self.busy,
		onSelect: (id: string) => {
			self.chosenId = id;
			self.ownSelected = false;
			self.pickFirst = false;
		},
		onSelectOwn: () => {
			self.ownSelected = true;
			self.chosenId = null;
			self.pickFirst = false;
		},
		onOwnText: (text: string) => {
			self.ownText = text;
			// A new text is a new question: never reuse the id created for the old one.
			self.ownCreatedId = null;
			self.pickFirst = false;
		},
	});
}

function pickActions(ctx: FlowCtx, teacherUsedUp: boolean): m.Children {
	const { self, table } = ctx;
	const ready = hasChoice(ctx, teacherUsedUp);

	return m(TurnActions, {
		primary: {
			label: t(self.busy ? 'turn.saving' : 'turn.claim'),
			testId: 'table-claim',
			disabled: self.busy,
			dimmed: !ready && !self.busy,
			describedBy: self.pickFirst ? 'turn-pick-first' : undefined,
			onclick: () => startTurn(ctx, teacherUsedUp),
		},
		secondary: {
			label: t('turn.pass_ask'),
			testId: 'pass-ask',
			disabled: self.busy,
			onclick: () => undefined,
		},
		confirm: {
			text: t('turn.pass_ask_confirm'),
			yesLabel: t('turn.pass_ask_yes'),
			yesTestId: 'pass-ask-yes',
			cancelTestId: 'pass-ask-cancel',
			onYes: () => step(ctx, { action: 'passAsking' }),
		},
		resetKey: `${table.turn}:${table.step}:${table.askerUid ?? ''}`,
		busy: self.busy,
		hint: self.pickFirst && !ready ? { id: 'turn-pick-first', text: t('turn.pick_first') } : null,
		below: m(ErrorLine, {
			message: self.error,
			onRetry: self.retry ? () => void self.retry?.() : undefined,
		}),
	});
}

function answerActions(ctx: FlowCtx): m.Children {
	const { self, table } = ctx;

	return m(TurnActions, {
		primary: {
			label: t(self.busy ? 'turn.saving' : claimLabelKey(ctx.kind)),
			testId: 'table-answer',
			disabled: self.busy,
			onclick: () =>
				step(ctx, { action: 'claimSpeaker' }, (reason) => {
					if (reason === 'floor-taken') noteWasFirst(ctx, 'floor');
				}),
		},
		secondary: {
			label: t('turn.pass_answer'),
			testId: 'pass-answer',
			disabled: self.busy,
			onclick: () => step(ctx, { action: 'passSpeaking' }),
		},
		resetKey: `${table.turn}:${table.spokenUids.length}:${table.speakerUid ?? ''}`,
		busy: self.busy,
		below: m(ErrorLine, {
			message: self.error,
			onRetry: self.retry ? () => void self.retry?.() : undefined,
		}),
	});
}

/** The quiet "{{name}} was first" line (not an error), for a few seconds. */
function wasFirstLine(ctx: FlowCtx): string | null {
	const { self, table } = ctx;
	if (!self.wasFirst || Date.now() >= self.wasFirst.until) return null;
	const who = self.wasFirst.kind === 'turn' ? table.askerUid : table.speakerUid;

	return who && who !== ctx.uid ? t('turn.was_first', { name: nameOf(ctx, who) }) : null;
}

function clock(ctx: FlowCtx): m.Children {
	const { table, main } = ctx;
	// Idle: the time the next speaker gets. Running: the length the server wrote with this minute.
	const totalMs =
		table.speakerEndsAt === undefined ? lessonSpeakMs(main) : tableSpeakMs(table, main);

	return m(Countdown, { endsAt: table.speakerEndsAt, totalMs, quietEnd: true });
}

function finishButton(ctx: FlowCtx): m.Children {
	const { self, table, main } = ctx;
	const totalMs = tableSpeakMs(table, main);
	const guarded =
		table.speakerEndsAt !== undefined &&
		msLeft(table.speakerEndsAt, totalMs) > totalMs - FINISH_GUARD_MS;

	return m(
		'button.btn.btn--secondary.tt__finish',
		{
			type: 'button',
			'data-testid': 'table-finish',
			disabled: self.busy || guarded ? true : undefined,
			onclick: () => step(ctx, { action: 'finishSpeaking' }),
		},
		t('turn.finish'),
	);
}

interface Screen {
	status: string;
	body: m.Children;
	action: m.Children;
	down: boolean;
	/** The h1: the question at talk states, the status at pick/done. */
	heading: string;
	/** The heading is the chosen question: drawn big, in the top third. */
	questionHeading?: boolean;
}

function talkScreen(ctx: FlowCtx, state: TableTalkState, question: string): Screen {
	const { table, uid } = ctx;
	const first = wasFirstLine(ctx);
	const firstNote = first ? m('p.tt__quiet', { 'data-testid': 'was-first' }, first) : null;
	const base = {
		heading: question,
		questionHeading: true,
		down: true,
		action: null as m.Children,
	};
	switch (state) {
		case 'S': {
			const status = t('turn.answer_mine');

			return {
				...base,
				status,
				body: m('.tt__clock', [m('p.tt__status', status), clock(ctx), finishButton(ctx)]),
			};
		}
		case 'L': {
			const status = t('turn.answering', { name: nameOf(ctx, table.speakerUid) });
			const mine = table.spokenUids.includes(uid);
			const note = passedAnswer(table, uid)
				? `– ${t('turn.passed_answer_me')}`
				: mine
					? `✓ ${t('turn.answered_me')}`
					: null;

			return {
				...base,
				status,
				body: m('.tt__clock', [
					m('p.tt__status', { 'data-testid': 'answering' }, status),
					clock(ctx),
					note ? m('p.tt__note', note) : null,
					firstNote,
				]),
			};
		}
		case 'W': {
			const status = t('turn.others_first');

			return { ...base, status, body: m('p.tt__status.tt__status--big', status) };
		}
		case 'A': {
			const status = t('turn.who_answers');

			return {
				...base,
				status,
				body: [m('p.tt__status.tt__status--big', status), firstNote],
				action: answerActions(ctx),
			};
		}
		default: {
			const passed = passedAnswer(table, uid);
			const status = passed ? `– ${t('turn.passed_answer_me')}` : `✓ ${t('turn.answered_me')}`;

			return {
				...base,
				status,
				body: [
					m('p.tt__status.tt__status--big', { 'data-testid': 'answered' }, status),
					m('p.tt__note', t('turn.who_answers')),
				],
			};
		}
	}
}

function pickScreen(
	ctx: FlowCtx,
	state: TableTalkState,
	teacherUsedUp: boolean,
	noTeacher: boolean,
	allowOwn: boolean,
): Screen {
	const { uid, table } = ctx;
	if (state === 'P2') {
		const passed = (table.passedAskingUids ?? []).includes(uid);
		const status = t('turn.wait_pick');

		return {
			status,
			heading: status,
			down: false,
			action: null,
			body: passed ? m('p.tt__note', t('turn.passed_ask_done')) : null,
		};
	}
	const first = wasFirstLine(ctx);

	return {
		status: t('turn.instr_pick'),
		heading: t('turn.instr_pick'),
		down: false,
		body: [
			pickBody(ctx, teacherUsedUp, noTeacher, allowOwn),
			first ? m('p.tt__quiet', { 'data-testid': 'was-first' }, first) : null,
		],
		action: pickActions(ctx, teacherUsedUp),
	};
}

/** The parts of the Table talk screen for this phone, this redraw. */
export function tableTalkParts(ctx: FlowCtx): FlowParts {
	const { table, uid, now, questions, self, main } = ctx;
	const noneLeft = noQuestionsLeft(
		table,
		pickQuestions(ctx)
			.filter((q) => !q.own)
			.map((q) => q.id),
		allowOwnQuestionsOf(main),
	);
	const state = tableTalkState(table, uid, now, noneLeft);
	// A new turn clears a half-made choice: nothing carries over from the last pick.
	if (self.chosenTurn !== table.turn) {
		self.chosenTurn = table.turn;
		self.chosenId = null;
		self.ownSelected = false;
		self.pickFirst = false;
	}
	const teacher = pickQuestions(ctx).filter((q) => !q.own);
	const teacherUsedUp = teacher.every((q) => q.used);
	let question = questionTextFrom(questions, getFetchedQuestionTexts(), table.questionId);
	if (question === null) {
		// Not in the live list (yet): read that one statement; the heading stays empty meanwhile.
		if (table.questionId) requestQuestionText(table.questionId);
		question = '';
	}
	let screen: Screen;
	if (state === 'D') {
		const status = t('turn.wait_others');
		screen = { status, heading: status, body: null, action: null, down: false };
	} else if (state === 'P1' || state === 'P2') {
		screen = pickScreen(ctx, state, teacherUsedUp, teacher.length === 0, allowOwnQuestionsOf(main));
	} else {
		screen = talkScreen(ctx, state, question);
	}

	return {
		headerLine:
			state === 'D'
				? t('turn.header_done', { n: table.n })
				: t('turn.header', {
						n: table.n,
						turn: table.turn,
						max: maxTurns(table, questionCapOf(main, questions)),
					}),
		status: screen.status,
		stateKey: `${state}:${table.turn}`,
		instruction: screen.heading,
		questionHeading: screen.questionHeading,
		body: m('.tt', { key: `${state}:${table.turn}` }, screen.body),
		action: screen.action
			? m('.tt__footer', { key: `${state}:${table.turn}` }, screen.action)
			: null,
		down: screen.down,
		askerLine: null,
		askerMark: false,
		barExtra: null,
		overlay: null,
		showStrip: false,
	};
}
