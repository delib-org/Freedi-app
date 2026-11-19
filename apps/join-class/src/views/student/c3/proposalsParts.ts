import m from 'mithril';
import { proposalLimitOf, proposalsTurnOf } from '@freedi/shared-types';
import { getLang, t } from '@/lib/i18n';
import { getLiveDrafts } from '@/lib/liveDrafts';
import { classTableStep } from '@/lib/classroom/api';
import { listableItems, myProposals, officialSubstep } from '@/lib/classroom/c3Logic';
import { penTextOf } from '@/lib/classroom/liveWriting';
import { moveOnView } from '@/lib/classroom/moveOn';
import {
	controlsOf,
	nextLineOf,
	proposalsScreenOf,
	type ProposalsScreen,
	type WriteScreenState,
} from '@/lib/classroom/proposalsScreen';
import { setImproveHandler } from '@/lib/classroom/replyUi';
import { serverNow } from '@/lib/classroom/serverClock';
import type { FlowCtx, FlowParts } from './flowTypes';
import { MoveOn } from './MoveOn';
import { PenClaim, PenWatch } from './PenScreen';
import { nextLineText, nextLineView } from './ProposalsNext';
import { rateBody } from './RateScreen';
import { nameOf, step as tableStep } from './tableTalkParts';
import { TalkScreen, talkStatusText } from './TalkScreen';
import { WritePanel } from './WritePanel';

/**
 * The Proposals half of TableFlow (IA join-class-proposals-flow). The table goes
 * Talk, Write, Rate together and every phone follows: the screen is the table's
 * step, never the phone's own pick. Each state shows only the controls that work
 * now, and one line says who the table waits for. Props in, vnodes out.
 */

/** "Noa is writing" in the live region, the state line in words. */
function writeStatus(screen: WriteScreenState, writerName: string, hasProposal: boolean): string {
	switch (screen.kind) {
		case 'free':
			return t('proposals.write.who_first');
		case 'mine':
			return t('proposals.write.mine_line');
		case 'other':
			return t('answer.live_one', { name: writerName });
		default:
			return hasProposal ? t('answer.sent') : t('proposals.write.passed');
	}
}

function statusOf(
	screen: ProposalsScreen,
	names: { speaker: string; writer: string },
	hasProposal: boolean,
	ratedLine: string | null,
): string {
	if (screen.part === 'talk') {
		return talkStatusText(screen, names.speaker);
	}
	if (screen.part === 'write') return writeStatus(screen, names.writer, hasProposal);

	return ratedLine ?? '';
}

export function proposalsParts(ctx: FlowCtx): FlowParts {
	const { main, table, uid, self, feed, challenge } = ctx;
	const challengeId = challenge?.statementId ?? null;
	const ballotFrozen = !!challenge?.statementSettings?.ballot;
	const plenum = challenge?.statementSettings?.roundPhase === 'improve';
	const items = listableItems(
		feed.options.filter((o) => o.parentId === challengeId),
		{ uid, tableId: table.tableId, challengeId },
	);
	const mine = myProposals(
		feed.options.filter((o) => o.parentId === challengeId),
		uid,
	);
	const screen = proposalsScreenOf({
		table,
		uid,
		main,
		now: serverNow(),
		unlimited: proposalLimitOf(main) === 'unlimited',
	});
	const controls = controlsOf(screen);
	const lang = getLang();
	const nameFor = (id: string): string => nameOf(ctx, id);
	const nextText = nextLineText(nextLineOf(screen, uid), nameFor, lang);
	// "Improve my proposal" from the replies (IA 22.5): the edit box on my sent proposal.
	setImproveHandler(self, (proposalId) => {
		self.editRequest = proposalId ?? null;
		// At rate the box opens above the list; at write my sent card (W4) takes the request itself.
		if (screen.part === 'rate') self.editing = true;
	});
	const unrated = items.filter((i) => feed.ratingOf(i.statementId) === undefined).length;
	const ratedLine =
		items.length === 0
			? null
			: unrated === 0
				? t('proposals.rate.all_done')
				: t('proposals.rate.count', { n: items.length - unrated, total: items.length });
	const onError = (message: string): void => {
		self.error = message;
	};
	const panel = (mode: 'pen' | 'edit'): m.Children =>
		m(WritePanel, {
			main,
			table,
			feed,
			uid,
			challenge,
			locked: ballotFrozen,
			mode,
			busy: self.busy,
			onPass: () => tableStep(ctx, { action: 'passWriting' }),
			// Best effort: a phone that is closing may not finish the call; the teacher can free the pen.
			onRelease: () => {
				classTableStep({ tableId: table.tableId, action: 'releasePen' }).catch(() => undefined);
			},
			takeEditRequest: () => {
				const request = self.editRequest;
				self.editRequest = null;

				return request;
			},
		});
	const editPanel = (): m.Children => panel('edit');
	const writerName = nameFor(table.writerUid ?? '');
	const names = { speaker: nameFor(table.speakerUid ?? ''), writer: writerName };
	let body: m.Children;
	let action: m.Children = null;

	if (screen.part === 'talk') {
		body = m(TalkScreen, {
			table,
			screen,
			speakerName: names.speaker,
			nextText,
			busy: self.busy,
			// A lost race is not an error: the table doc already shows who has the floor.
			onClaim: () => tableStep(ctx, { action: 'claimSpeaker' }),
			onFinish: () => tableStep(ctx, { action: 'finishSpeaking' }),
			onPass: () => tableStep(ctx, { action: 'passSpeaking' }),
		});
		if (controls.toWrite) {
			// One tap moves the whole table to writing (T6).
			action = m(
				'button.btn.btn--primary',
				{
					type: 'button',
					'data-testid': 'table-to-write',
					disabled: self.busy,
					onclick: () => tableStep(ctx, { action: 'toWrite' }),
				},
				t('proposals.talk.to_write'),
			);
		} else if (controls.moveOn) {
			action = m(MoveOn, {
				view: moveOnView(table, uid),
				busy: self.busy,
				onToggle: () =>
					tableStep(ctx, {
						action: 'moveOn',
						fromTurn: table.turn,
						fromProposalsTurn: proposalsTurnOf(table),
					}),
			});
		}
	} else if (screen.part === 'write') {
		const live = penTextOf(getLiveDrafts({ excludeSelf: true }), screen.writerUid, uid);
		const watching = screen.writerUid !== undefined && screen.writerUid !== uid;
		if (screen.kind === 'free') {
			body = m(PenClaim, {
				statusText: writeStatus(screen, writerName, false),
				nextText,
				busy: self.busy,
				onClaim: () => tableStep(ctx, { action: 'claimPen' }),
				onPass: () => tableStep(ctx, { action: 'passWriting' }),
			});
		} else if (screen.kind === 'mine') {
			body = panel('pen');
		} else if (screen.kind === 'other') {
			body = m(PenWatch, { name: writerName, text: live, nextText, testId: 'pen-watch' });
		} else {
			// W4: I sent or passed; my card (with its replies) stays, and the pen holder's text sits below it.
			body = [
				m(
					'p.pen__status',
					{ 'data-testid': 'pen-status' },
					writeStatus(screen, writerName, mine.length > 0),
				),
				mine.length > 0 ? editPanel() : null,
				watching
					? m(PenWatch, { name: writerName, text: live, nextText, testId: 'pen-watch' })
					: nextLineView(nextText),
				controls.claimPen
					? m(PenClaim, {
							statusText: '',
							nextText: null,
							busy: self.busy,
							onClaim: () => tableStep(ctx, { action: 'claimPen' }),
						})
					: null,
			];
		}
	} else {
		body = [
			nextLineView(ratedLine),
			rateBody({
				feed,
				items,
				challengeId,
				uid,
				plenum,
				editor: self.editing ? editPanel() : null,
				editing: self.editing,
				onToggleEdit: () => {
					self.editing = !self.editing;
				},
				onEdit: (proposalId) => {
					self.editRequest = proposalId;
					self.editing = true;
				},
				onError,
			}),
		];
	}

	const talking = screen.part === 'talk';

	return {
		headerLine: talking
			? t('turn.header', { n: table.n, turn: screen.turn, max: screen.max })
			: t('turn.table_n', { n: table.n }),
		status: [statusOf(screen, names, mine.length > 0, ratedLine), nextText]
			.filter(Boolean)
			.join('. '),
		instruction: undefined,
		body,
		action,
		down: talking,
		ask: challenge?.statement
			? t('proposals.heading', { question: challenge.statement })
			: undefined,
		strip: officialSubstep(table),
	};
}
