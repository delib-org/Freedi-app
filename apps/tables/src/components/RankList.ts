import m from 'mithril';
import type { TableAssignmentTopic } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { clampDragOffset, displacement, dragTargetIndex } from '@/logic/rankDrag';
import type { RowBox } from '@/logic/rankDrag';
import { isRankingFull, moveRank, moveRankTo, orderTopics, rankOf } from '@/logic/ranking';
import { dragHandleIcon, infoIcon } from '@/components/icons';

export interface RankListAttrs {
	topics: readonly TableAssignmentTopic[];
	ranked: readonly string[];
	/** Topics that pass the title filter; the picked ones always stay visible. */
	matches: (topic: TableAssignmentTopic) => boolean;
	onToggle: (topicId: string) => void;
	onReorder: (next: string[]) => void;
}

interface ActiveDrag {
	topicId: string;
	pointerId: number;
	from: number;
	target: number;
	startY: number;
	offset: number;
	rows: RowBox[];
	/** How far a passed row steps aside: the dragged row's height plus the list's gap. */
	step: number;
}

const PICKED_ROW_SELECTOR = '.rank-row--picked';

function measurePickedRows(list: HTMLElement): RowBox[] {
	return Array.from(list.querySelectorAll<HTMLElement>(PICKED_ROW_SELECTOR)).map((row) => {
		const rect = row.getBoundingClientRect();

		return { top: rect.top, height: rect.height };
	});
}

function rowGap(list: HTMLElement): number {
	return parseFloat(getComputedStyle(list).rowGap) || 0;
}

/**
 * Rank topics as one list: tap picks up to three, picked rows rise in order.
 * A picked row's handle drags with mouse or touch and moves with the arrow
 * keys; every move is announced to screen readers.
 */
export const RankList: m.ClosureComponent<RankListAttrs> = (initial) => {
	let latest = initial.attrs;
	let list: HTMLElement | null = null;
	let drag: ActiveDrag | null = null;
	let announcement = '';
	const explained = new Set<string>();

	function titleOf(topicId: string): string {
		return latest.topics.find((topic) => topic.topicId === topicId)?.title ?? '';
	}

	function announceMove(next: readonly string[], topicId: string): void {
		announcement = t('tableAssignment.rank.moved', {
			topic: titleOf(topicId),
			place: rankOf(next, topicId),
			order: next.map(titleOf).join(', '),
		});
	}

	function applyMove(next: string[], topicId: string): void {
		announceMove(next, topicId);
		latest.onReorder(next);
	}

	function handleMove(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;
		drag.offset = clampDragOffset(drag.rows, drag.from, event.clientY - drag.startY);
		drag.target = dragTargetIndex(drag.rows, drag.from, drag.offset);
		m.redraw();
	}

	function stopListening(): void {
		window.removeEventListener('pointermove', handleMove);
		window.removeEventListener('pointerup', handleEnd);
		window.removeEventListener('pointercancel', handleCancel);
	}

	function handleEnd(event: PointerEvent): void {
		if (!drag || event.pointerId !== drag.pointerId) return;

		const { from, target, topicId } = drag;

		stopListening();
		drag = null;
		if (target !== from) applyMove(moveRankTo(latest.ranked, from, target), topicId);
		m.redraw();
	}

	function handleCancel(): void {
		stopListening();
		drag = null;
		m.redraw();
	}

	function startDrag(event: PointerEvent, topicId: string): void {
		if (event.button !== 0 || !list) return;

		const rows = measurePickedRows(list);
		const from = latest.ranked.indexOf(topicId);

		if (from < 0 || !rows[from]) return;
		event.preventDefault();
		drag = {
			topicId,
			pointerId: event.pointerId,
			from,
			target: from,
			startY: event.clientY,
			offset: 0,
			rows,
			step: rows[from].height + rowGap(list),
		};
		window.addEventListener('pointermove', handleMove);
		window.addEventListener('pointerup', handleEnd);
		window.addEventListener('pointercancel', handleCancel);
	}

	function handleKey(event: KeyboardEvent, topicId: string): void {
		const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;

		if (delta === 0) return;
		event.preventDefault();

		const next = moveRank(latest.ranked, latest.ranked.indexOf(topicId), delta);

		if (next.join() !== latest.ranked.join()) applyMove(next, topicId);
	}

	function shiftOf(index: number, topicId: string): string | undefined {
		if (!drag || index < 0) return undefined;
		if (drag.topicId === topicId) return `${drag.offset}px`;

		return `${displacement(index, drag.from, drag.target, drag.step)}px`;
	}

	function explainButton(topic: TableAssignmentTopic): m.Vnode | null {
		if (!topic.description) return null;

		return m(
			'button.rank-row__explain',
			{
				type: 'button',
				'aria-expanded': explained.has(topic.topicId) ? 'true' : 'false',
				'aria-label': t('tableAssignment.rank.explain', { topic: topic.title }),
				onclick: () => {
					if (!explained.delete(topic.topicId)) explained.add(topic.topicId);
				},
			},
			infoIcon(),
		);
	}

	function row(topic: TableAssignmentTopic): m.Vnode {
		const rank = rankOf(latest.ranked, topic.topicId);
		const isPicked = rank > 0;
		const shift = shiftOf(rank - 1, topic.topicId);

		return m(
			'li.rank-row',
			{
				key: topic.topicId,
				class: [
					isPicked ? 'rank-row--picked' : '',
					drag?.topicId === topic.topicId ? 'rank-row--dragging' : '',
				].join(' '),
				style: shift === undefined ? undefined : { '--rank-shift': shift },
			},
			[
				m('.rank-row__main', [
					m(
						'button.rank-row__pick',
						{
							type: 'button',
							'aria-pressed': isPicked ? 'true' : 'false',
							'aria-disabled': !isPicked && isRankingFull(latest.ranked) ? 'true' : undefined,
							onclick: () => latest.onToggle(topic.topicId),
						},
						[
							m('span.rank-row__badge', { 'aria-hidden': 'true' }, isPicked ? String(rank) : ''),
							m('span', { dir: 'auto' }, topic.title),
							isPicked
								? m('span.visually-hidden', t('tableAssignment.rank.place', { place: rank }))
								: null,
						],
					),
					explainButton(topic),
					isPicked
						? m(
								'button.rank-row__handle',
								{
									type: 'button',
									'aria-label': t('tableAssignment.rank.handle', { topic: topic.title }),
									onpointerdown: (event: PointerEvent) => startDrag(event, topic.topicId),
									onkeydown: (event: KeyboardEvent) => handleKey(event, topic.topicId),
								},
								dragHandleIcon(),
							)
						: null,
				]),
				explained.has(topic.topicId) && topic.description
					? m('p.rank-row__details', { dir: 'auto' }, topic.description)
					: null,
			],
		);
	}

	return {
		onremove() {
			stopListening();
		},
		view({ attrs }) {
			latest = attrs;
			const visible = orderTopics(attrs.topics, attrs.ranked).filter(
				(topic) => rankOf(attrs.ranked, topic.topicId) > 0 || attrs.matches(topic),
			);

			return [
				m(
					'ul.rank-list',
					{
						oncreate: ({ dom }: m.VnodeDOM) => {
							list = dom as HTMLElement;
						},
					},
					visible.map(row),
				),
				m('p.visually-hidden', { 'aria-live': 'polite' }, announcement),
			];
		},
	};
};
