import m from 'mithril';
import type { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { partitionRateItems, plenumOrder, tableNumberOf } from '@/lib/classroom/c3Logic';
import type { FlowFeed } from './FlowFeed';
import { FlipList } from '@/components/FlipList';
import { RateFaces } from './RateFaces';
import { TextCard } from './TextCard';
import { ReplyEntry } from '../replies/ReplyEntry';

export interface RatedListAttrs {
	/** Already filtered: no own items, no hidden ones. */
	items: Statement[];
	feed: FlowFeed;
	/** The challenge question's id: options under it are proposals, the rest answers. */
	challengeId: string | null;
	/** "No answers yet" / "No proposals yet". */
	emptyText: string;
	/** The plenum list: proposals in consensus order, no rated group. */
	plenum?: boolean;
	/** Called with a translated message when a rating could not be saved. */
	onError: (message: string) => void;
	/** Inside the class sheet: the replies replace the sheet and come back to it (IA 22.2). */
	replyLeave?: () => void;
	replyBack?: () => void;
}

class RatedListState {
	/** Which items counted as rated at the last LIST refresh (cards never jump under a finger). */
	ratedIds = new Set<string>();
	key = '';
	open = false;
}

function eyebrowOf(item: Statement, challengeId: string | null, rated: boolean): string {
	const kind = item.parentId === challengeId ? t('proposal.title') : t('answer.title');
	const n = tableNumberOf(item.classTable?.tableId);
	const parts = [kind];
	if (n !== null) parts.push(t('turn.table_n', { n }));
	if (rated) parts.push(t('rate.rated'));

	return parts.join(' · ');
}

/**
 * The class's items to rate (UX §2.6.4): unrated first, newest first; rated
 * ones collect under "Rated n" (closed by default, faces still live). The
 * unrated/rated split is recomputed when the LIST changes, not on a tap.
 */
export const RatedList: m.ClassComponent<RatedListAttrs> = {
	oninit(vnode) {
		(vnode.state as { self?: RatedListState }).self = new RatedListState();
	},

	view(vnode) {
		const self = (vnode.state as { self?: RatedListState }).self as RatedListState;
		const { items, feed, challengeId } = vnode.attrs;
		const key = `${feed.ratingsLoaded ? 1 : 0}:${items.map((i) => i.statementId).join(',')}`;
		if (key !== self.key) {
			self.key = key;
			self.ratedIds = new Set(
				items.filter((i) => feed.ratingOf(i.statementId) !== undefined).map((i) => i.statementId),
			);
		}
		const { open, rated } = partitionRateItems(items, self.ratedIds);
		const card = (item: Statement): m.Children =>
			m(TextCard, {
				key: item.statementId,
				dataKey: item.statementId,
				eyebrow: eyebrowOf(item, challengeId, feed.ratingOf(item.statementId) !== undefined),
				text: item.statement,
				footer: m(RateFaces, {
					value: feed.ratingOf(item.statementId),
					onRate: (score: number) => {
						feed.rate(item, score).catch(() => vnode.attrs.onError(t('rate.failed')));
					},
				}),
				// Replies are on proposals only (IA 22), never on table answers.
				replies:
					item.parentId === challengeId
						? m(ReplyEntry, {
								proposal: item,
								leave: vnode.attrs.replyLeave,
								back: vnode.attrs.replyBack,
							})
						: null,
			});
		if (items.length === 0) return m('p.rated-list__empty', vnode.attrs.emptyText);
		// Plenum: one list in rank order (best first), every card re-ratable.
		if (vnode.attrs.plenum) {
			const ranked = plenumOrder(items);

			return m(
				FlipList,
				{ selector: '.rated-list', ids: ranked.map((item) => item.statementId) },
				ranked.map(card),
			);
		}

		return m(FlipList, { selector: '.rated-list', ids: open.map((item) => item.statementId) }, [
			open.map(card),
			rated.length > 0
				? m('.rated-list__group', [
						m(
							'button.rated-list__toggle',
							{
								type: 'button',
								'aria-expanded': self.open ? 'true' : 'false',
								onclick: () => {
									self.open = !self.open;
								},
							},
							[
								m('span', { 'aria-hidden': 'true' }, self.open ? '▾' : '▸'),
								` ${t('rate.rated_group', { n: rated.length })}`,
							],
						),
						self.open ? rated.map(card) : null,
					])
				: null,
		]);
	},
};
