import React, { type ReactNode } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * Breadcrumb molecule — nav > ol trail. Items with `to` render as router
 * links; the last (or any item without `to`) is the current page.
 * Styles: styles/molecules/_breadcrumb.scss
 *
 * The trail begins with `root`: the workspace you are in, rendered as its own
 * control (the organization switcher) rather than as a link. That is what
 * makes the hierarchy legible — everything after it is inside it.
 *
 * Separators lead each item rather than trailing it, so hiding a crumb on a
 * narrow screen cannot leave a dangling ›.
 */

export interface BreadcrumbItem {
	label: string;
	to?: string;
}

export interface BreadcrumbProps {
	/** The workspace crumb. Rendered first and never hidden. */
	root?: ReactNode;
	items: BreadcrumbItem[];
	className?: string;
}

const Separator: React.FC = () => (
	<span className="breadcrumb__separator" aria-hidden="true">
		›
	</span>
);

const Breadcrumb: React.FC<BreadcrumbProps> = ({ root, items, className }) => {
	const { t } = useTranslation();
	const lastIndex = items.length - 1;

	return (
		<nav className={clsx('breadcrumb', className)} aria-label={t('Breadcrumb')}>
			<ol className="breadcrumb__list">
				{root && <li className="breadcrumb__item breadcrumb__item--root">{root}</li>}
				{items.map((item, index) => {
					const isCurrent = index === lastIndex || !item.to;
					const isParent = index === lastIndex - 1;

					return (
						<li
							key={`${item.label}-${index}`}
							className={clsx(
								'breadcrumb__item',
								index === lastIndex && 'breadcrumb__item--current',
								isParent && 'breadcrumb__item--parent',
							)}
						>
							{(root || index > 0) && <Separator />}
							{isCurrent || !item.to ? (
								<span
									className="breadcrumb__current"
									aria-current={index === lastIndex ? 'page' : undefined}
									dir="auto"
									title={item.label}
								>
									{item.label}
								</span>
							) : (
								<Link className="breadcrumb__link" to={item.to} dir="auto" title={item.label}>
									{item.label}
								</Link>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
};

export default Breadcrumb;
