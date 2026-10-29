import m from 'mithril';
import { t } from '@/lib/i18n';
import { listableItems } from '@/lib/classroom/c3Logic';
import { setImproveHandler } from '@/lib/classroom/replyUi';
import { proposalsTalkState, showsWriteButton } from '@/lib/classroom/proposalsTurn';
import { serverNow } from '@/lib/classroom/serverClock';
import { instructionFor } from '@/lib/classroom/turnMoment';
import type { FlowCtx, FlowParts } from './flowTypes';
import { rateBody } from './RateScreen';
import { RatedList } from './RatedList';
import { moveOnView } from '@/lib/classroom/moveOn';
import { MoveOn } from './MoveOn';
import { Sheet } from './Sheet';
import { nameOf, step as tableStep } from './tableTalkParts';
import { TalkScreen, talkFinishAction } from './TalkScreen';
import { WritePanel } from './WritePanel';

/**
 * The Proposals half of TableFlow: three sub-steps (talk, write, rate) that every
 * phone moves between freely (IA 17.13), the challenge question's proposals, the
 * class sheet and the plenum list. Props in, vnodes out.
 */

export function proposalsParts(ctx: FlowCtx): FlowParts {
	const { main, kind, table, uid, mates, self, feed, step, challenge } = ctx;
	const challengeId = challenge?.statementId ?? null;
	const ballotFrozen = !!challenge?.statementSettings?.ballot;
	const plenum = challenge?.statementSettings?.roundPhase === 'improve';
	const items = listableItems(
		feed.options.filter((o) => o.parentId === challengeId),
		{ uid, tableId: table.tableId, challengeId },
	);
	// "Improve my proposal" from the replies (IA 22.5): the plenum's edit box on
	// the rate screen, else the write screen (its box edits the sent proposal).
	setImproveHandler(self, () => {
		if (!plenum) {
			ctx.goto('write');

			return;
		}
		self.editing = true;
		if (step !== 'rate') ctx.goto('rate');
	});
	const unrated = items.filter((i) => feed.ratingOf(i.statementId) === undefined).length;
	const onError = (message: string): void => {
		self.error = message;
	};
	const writePanel = (): m.Children =>
		m(WritePanel, {
			main,
			kind,
			table,
			feed,
			uid,
			mates,
			question: null,
			challenge,
			locked: ballotFrozen,
			busy: self.busy,
			onAction: ctx.act,
		});
	let body: m.Children;
	let action: m.Children = null;
	if (step === 'talk') {
		const talking = proposalsTalkState(table, uid, main, serverNow());
		body = m(TalkScreen, {
			table,
			uid,
			speakerName: nameOf(ctx, table.speakerUid),
			busy: self.busy,
			// A lost race is not an error: the table doc already shows who has the floor.
			onClaim: () => tableStep(ctx, { action: 'claimSpeaker' }),
			onFinish: () => tableStep(ctx, { action: 'finishSpeaking' }),
			onPass: () => tableStep(ctx, { action: 'passSpeaking' }),
		});
		// Everyone spoke: write. Otherwise the table moves on when enough tablemates tap "move on".
		if (talking.kind === 'done') {
			action = talkFinishAction(self.busy, () => ctx.goto('write'));
		} else if (showsWriteButton(talking.kind)) {
			action = m(MoveOn, {
				view: moveOnView(table, uid),
				busy: self.busy,
				onToggle: () => tableStep(ctx, { action: 'moveOn' }),
			});
		}
	} else if (step === 'write') {
		body = writePanel();
		action = m(
			'button.btn.btn--secondary',
			{
				type: 'button',
				'data-testid': 'table-to-rate',
				disabled: self.busy,
				onclick: () => ctx.goto('rate'),
			},
			t('turn.to_rate'),
		);
	} else {
		body = rateBody({
			feed,
			items,
			challengeId,
			uid,
			plenum,
			editor: self.editing ? writePanel() : null,
			editing: self.editing,
			onToggleEdit: () => {
				self.editing = !self.editing;
			},
			onError,
		});
	}
	const line = instructionFor(step);
	const classButton = m(
		'button.btn.btn--secondary.btn--small.flow__class',
		{
			type: 'button',
			onclick: () => {
				self.sheetOpen = true;
			},
		},
		[unrated > 0 ? m('span.flow__count', `${unrated} · `) : null, t('rate.class_writing')],
	);

	// Talking: "Turn n of max" (IA 25.6, everyone speaks once per turn); writing and rating name the step.
	const talkState = step === 'talk' ? proposalsTalkState(table, uid, main, serverNow()) : null;

	return {
		headerLine: talkState
			? t('turn.header', { n: table.n, turn: talkState.turn, max: talkState.max })
			: t('turn.header_proposals', { n: table.n, step: t(`turn.now_${step}`) }),
		instruction: t(line.key, line.params),
		body,
		action,
		down: step === 'talk',
		askerLine: null,
		askerMark: false,
		ask: challenge?.statement
			? t('proposals.heading', { question: challenge.statement })
			: undefined,
		barExtra: classButton,
		overlay: self.sheetOpen
			? m(
					Sheet,
					{
						title: t('proposal.class_list'),
						onClose: () => {
							self.sheetOpen = false;
						},
					},
					m(RatedList, {
						items,
						feed,
						challengeId,
						emptyText: t('proposal.none_yet'),
						onError,
						replyLeave: () => {
							self.sheetOpen = false;
						},
						replyBack: () => {
							self.sheetOpen = true;
						},
					}),
				)
			: null,
		showStrip: true,
	};
}
