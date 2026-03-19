import m from 'mithril';
import type { BreadcrumbItem } from '../lib/breadcrumb';
import { getMainAppUrl } from '../lib/links';

export interface BreadcrumbAttrs {
	items: BreadcrumbItem[];
	topParentId?: string;
}

export const Breadcrumb: m.Component<BreadcrumbAttrs> = {
	view(vnode) {
		const { items, topParentId } = vnode.attrs;

		if (items.length === 0) {
			return m('.breadcrumb', m('span.breadcrumb__item', '...'));
		}

		const children: m.Children[] = [];

		items.forEach((item, i) => {
			if (i > 0) {
				children.push(m('span.breadcrumb__sep', ' / '));
			}

			const isLast = i === items.length - 1;
			const url = getMainAppUrl(item.statementId, topParentId);

			children.push(
				m(
					'a.breadcrumb__item' + (isLast ? '.breadcrumb__item--current' : ''),
					{
						href: url,
						target: '_blank',
						rel: 'noopener',
					},
					item.title
				)
			);
		});

		return m('.breadcrumb', children);
	},
};
