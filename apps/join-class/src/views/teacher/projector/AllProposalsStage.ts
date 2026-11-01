import m from 'mithril';
import { t } from '@/lib/i18n';
import { playFlip, recordPositions } from '@/lib/flipReorder';
import type { Positions } from '@/lib/flipReorder';
import { minRatingsPerProposal } from '@/lib/classroom/allProposalsConsole';
import { projectorData } from '@/lib/classroom/projectorData';
import { topProposals, visibleProposals } from './projectorLogic';

/**
 * The projector at "כל ההצעות" (IA 19.5): the title with the count, "every
 * proposal has at least k ratings", and the top proposals by C_p, gliding
 * (FLIP) to their new place as the ratings come in. No per-student data.
 */

const before = new WeakMap<Element, Positions>();

const TopList: m.Component<{ ids: string }> = {
	onbeforeupdate(vnode, old) {
		if (old.dom && vnode.attrs.ids !== old.attrs.ids) before.set(old.dom, recordPositions(old.dom));
	},

	onupdate(vnode: m.VnodeDOM<{ ids: string }>) {
		const positions = before.get(vnode.dom);
		if (!positions) return;
		before.delete(vnode.dom);
		playFlip(vnode.dom, positions);
	},

	view({ children }) {
		return m('ol.projector-top', children);
	},
};

export function allProposalsStage(): m.Vnode {
	const options = visibleProposals(projectorData.proposals);
	const top = topProposals(options);

	return m('section.projector-step.projector-step--all-proposals', [
		m('h1.projector-instruction', t('projector.allProposals', { n: options.length })),
		options.length > 0
			? m(
					'p.projector-all-min',
					t('projector.allProposals_min', { k: minRatingsPerProposal(options) }),
				)
			: m('p.projector-empty', t('proposal.none_yet')),
		m(
			TopList,
			{ ids: top.map((o) => o.statementId).join(',') },
			top.map((option, index) =>
				m('li.projector-top__card', { key: option.statementId, 'data-key': option.statementId }, [
					m('span.projector-top__rank', index + 1),
					m('span.projector-top__text', { dir: 'auto' }, option.statement),
				]),
			),
		),
	]);
}
