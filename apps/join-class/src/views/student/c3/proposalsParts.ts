import m from 'mithril';
import { t } from '@/lib/i18n';
import { listableItems } from '@/lib/classroom/c3Logic';
import { instructionFor } from '@/lib/classroom/turnMoment';
import type { FlowCtx, FlowParts } from './flowTypes';
import { rateBody } from './RateScreen';
import { RatedList } from './RatedList';
import { Sheet } from './Sheet';
import { TalkScreen, talkFinishAction } from './TalkScreen';
import { WritePanel } from './WritePanel';

/**
 * The Proposals half of TableFlow (talk -> write -> rate, unchanged by the
 * table turn v2): the challenge question's proposals, the class sheet and the
 * plenum list. Props in, vnodes out.
 */

export function proposalsParts(ctx: FlowCtx): FlowParts {
	const { main, kind, table, uid, mates, self, feed, step, official, challenge, someone } = ctx;
	const challengeId = challenge?.statementId ?? null;
	const ballotFrozen = !!challenge?.statementSettings?.ballot;
	const plenum = challenge?.statementSettings?.roundPhase === 'improve';
	const items = listableItems(
		feed.options.filter((o) => o.parentId === challengeId),
		{ uid, tableId: table.tableId, challengeId },
	);
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
	const isAsker = table.askerUid === uid;
	let body: m.Children;
	let action: m.Children = null;
	if (step === 'talk') {
		body = m(TalkScreen, { table, prompt: challenge?.statement ?? '' });
		action = talkFinishAction(kind, table, uid, self.busy, ctx.act);
	} else if (step === 'write') {
		body = writePanel();
		action = isAsker
			? m(
					'button.btn.btn--secondary',
					{
						type: 'button',
						'data-testid': 'table-to-rate',
						disabled: self.busy,
						onclick: () => ctx.act({ action: 'toRate' }),
					},
					t('turn.to_rate'),
				)
			: null;
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
	const line = instructionFor(official);
	const asker = mates.find((x) => x.uid === table.askerUid);
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

	return {
		headerLine: t('turn.header_proposals', { n: table.n, step: t(`turn.now_${official}`) }),
		instruction: t(line.key, line.params),
		body,
		action,
		down: step === 'talk',
		askerLine: isAsker ? t('turn.asker_me') : t('turn.asker', { name: asker?.name ?? someone }),
		askerMark: isAsker,
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
					}),
				)
			: null,
		showStrip: true,
	};
}
