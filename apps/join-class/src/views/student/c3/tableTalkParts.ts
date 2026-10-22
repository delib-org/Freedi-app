import m from 'mithril';
import { t } from '@/lib/i18n';
import { getGuidingQuestions } from '@/lib/lesson';
import { classTableStep } from '@/lib/classroom/api';
import { createTableQuestion } from '@/lib/classroom/c3Data';
import {
	claimMoment,
	instructionFor,
	maxTurns,
	refusalReason,
	type ClaimMoment,
} from '@/lib/classroom/turnMoment';
import { ClaimFooter, type ClaimPrimary } from './ClaimFooter';
import type { FlowCtx, FlowParts } from './flowTypes';
import { QuestionPick, type PickQuestion } from './QuestionPick';
import { TalkScreen, isTimeUp, passMinuteAction } from './TalkScreen';

/**
 * The Table talk half of TableFlow (UX 16 rev 2): V1 (nobody asks, "אני אשאל"),
 * A (the asker picks), B/C (everyone speaks a minute, the asker too), V2 (everyone
 * spoke: the next volunteer) and Done. Nobody writes or rates here. Props in, vnodes out.
 */

function pickQuestions(ctx: FlowCtx): PickQuestion[] {
	const { table, questions } = ctx;

	return getGuidingQuestions(questions)
		.filter((q) => !q.classTable || q.classTable.tableId === table.tableId)
		.map((q) => ({
			id: q.statementId,
			text: q.statement,
			hint: q.statementSettings?.hint,
			own: !!q.classTable,
			used: table.usedQuestionIds.includes(q.statementId),
		}));
}

/** First tap wins: a lost race is not an error, the table doc already shows who won. */
function claimTurn(ctx: FlowCtx): void {
	const { table } = ctx;
	ctx.run(async () => {
		try {
			await classTableStep({ tableId: table.tableId, action: 'nextTurn', fromTurn: table.turn });
		} catch (error) {
			if (refusalReason(error) !== 'turn-claimed') throw error;
		}
	});
}

function pickQuestion(ctx: FlowCtx, id: string): void {
	const { self, table } = ctx;
	self.chosenId = id;
	ctx.run(async () => {
		try {
			await classTableStep({ tableId: table.tableId, action: 'pickQuestion', questionId: id });
		} catch (error) {
			self.chosenId = null;
			throw error;
		}
	});
}

/**
 * A-own: one tap saves the asker's own question, picks it and starts the talk. One
 * retry on a failed step (the question is created once; the typed text is kept).
 */
function chooseOwnAndTalk(ctx: FlowCtx): void {
	const { self, table, main } = ctx;
	const text = self.ownText.trim();
	if (!text) return;
	const chain = async (): Promise<void> => {
		if (!self.ownCreatedId)
			self.ownCreatedId = await createTableQuestion(main, text, table.tableId);
		await classTableStep({
			tableId: table.tableId,
			action: 'pickQuestion',
			questionId: self.ownCreatedId,
		});
		await classTableStep({ tableId: table.tableId, action: 'toTalk' });
	};
	ctx.run(async () => {
		try {
			await chain();
		} catch (error) {
			console.error('[TableFlow] own question chain failed, retrying once', error);
			await chain();
		}
		self.ownText = '';
		self.ownCreatedId = null;
	});
}

function primaryFor(ctx: FlowCtx, moment: ClaimMoment, allUsed: boolean): ClaimPrimary | null {
	const { self, table, uid } = ctx;
	if (moment.canClaim) {
		return {
			label: t(self.busy ? 'turn.saving' : 'turn.claim'),
			testId: 'table-claim',
			disabled: self.busy,
			onclick: () => claimTurn(ctx),
		};
	}
	if (moment.phase !== 'a' || table.askerUid !== uid) return null;
	const chosen = self.chosenId ?? table.questionId ?? null;

	return {
		label: t('turn.to_talk'),
		testId: 'table-start',
		disabled: self.busy || (allUsed ? !self.ownText.trim() : !chosen),
		onclick: () => (allUsed ? chooseOwnAndTalk(ctx) : ctx.act({ action: 'toTalk' })),
	};
}

function footerFor(ctx: FlowCtx, moment: ClaimMoment, allUsed: boolean): m.Children {
	const { self, table, mates, uid } = ctx;
	if (moment.phase === 'talk') return passMinuteAction(table, uid, mates, self.busy, ctx.act);
	const primary = primaryFor(ctx, moment, allUsed);
	if (!primary && !moment.canPassAsk) return null;

	return m(ClaimFooter, {
		primary,
		canPass: moment.canPassAsk,
		busy: self.busy,
		resetKey: `${table.turn}:${table.step}:${table.askerUid ?? ''}`,
		onPass: () => ctx.act({ action: 'passAsking' }),
	});
}

function bodyFor(ctx: FlowCtx, moment: ClaimMoment, allUsed: boolean, askLine: string): m.Children {
	const { self, table, uid, mates, main, step } = ctx;
	if (moment.phase === 'done' && step === ctx.official) return null;
	const tableQuestion = ctx.questions.find((q) => q.statementId === table.questionId) ?? null;
	if (step === 'pick') {
		const isAsker = table.askerUid === uid;
		const chosenId = isAsker
			? (self.chosenId ?? table.questionId ?? null)
			: (table.questionId ?? null);

		return m(QuestionPick, {
			questions: pickQuestions(ctx),
			chosenId,
			canChoose: isAsker && moment.phase === 'a',
			onPick: (id: string) => pickQuestion(ctx, id),
			onAddOwn: async (text: string) => {
				await createTableQuestion(main, text, table.tableId);
			},
			allUsed,
			ownText: self.ownText,
			onOwnText: (text: string) => {
				self.ownText = text;
				self.ownCreatedId = null;
			},
		});
	}

	return m(TalkScreen, {
		kind: 'tableTalk',
		table,
		uid,
		mates,
		prompt: tableQuestion?.statement ?? '',
		busy: self.busy,
		onAction: ctx.act,
		over: moment.phase === 'v2' ? { askLine } : undefined,
	});
}

/** The parts of the Table talk screen for this phone, this redraw. */
export function tableTalkParts(ctx: FlowCtx): FlowParts {
	const { table, uid, mates, kind, now, someone, official } = ctx;
	const moment = claimMoment(table, uid, now);
	const pickable = pickQuestions(ctx);
	const allUsed = pickable.length > 0 && pickable.every((q) => q.used);
	const done = moment.phase === 'done';
	const line = instructionFor(
		official,
		{ kind, table, uid, mates, timeUp: isTimeUp(table), now, allUsed },
		someone,
	);
	const instruction = t(line.key, line.params);
	const isAsker = table.askerUid === uid;
	const asker = mates.find((x) => x.uid === table.askerUid);
	const stepName = t(`turn.now_${official}`);
	// The asker line belongs to the moments with an asker at work (A and talk).
	const showAsker = (moment.phase === 'a' || moment.phase === 'talk') && table.askerUid !== null;

	return {
		headerLine: done
			? t('turn.header_done', { n: table.n })
			: t('turn.header', { n: table.n, turn: table.turn, max: maxTurns(table), step: stepName }),
		instruction: moment.phase === 'v2' ? undefined : instruction,
		body: bodyFor(ctx, moment, allUsed, instruction),
		action: footerFor(ctx, moment, allUsed),
		// Dark follows the table's OFFICIAL step, never a peek: dark = talking.
		down: official === 'talk' && !done,
		askerLine: showAsker
			? isAsker
				? t('turn.asker_me')
				: t('turn.asker', { name: asker?.name ?? someone })
			: null,
		askerMark: isAsker && showAsker,
		barExtra: null,
		overlay: null,
		showStrip: !done,
	};
}
