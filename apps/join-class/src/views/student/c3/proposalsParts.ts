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
		body = m(TalkScreen, { table, prompt: challenge?.statement ?? '' });
		action = talkFinishAction(self.busy, () => ctx.goto('write'));
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

	return {
		headerLine: t('turn.header_proposals', { n: table.n, step: t(`turn.now_${step}`) }),
		instruction: t(line.key, line.params),
		body,
		action,
		down: step === 'talk',
		askerLine: null,
		askerMark: false,
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
