import React from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * Breadcrumb molecule — nav > ol trail. Items with `to` render as router
 * links; the last (or any item without `to`) is the current page.
 * Styles: styles/molecules/_breadcrumb.scss
 */

export interface BreadcrumbItem {
	label: string;
	to?: string;
}

export interface BreadcrumbProps {
	items: BreadcrumbItem[];
	className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
	const { t } = useTranslation();
	const lastIndex = items.length - 1;

	return (
		<nav className={clsx('breadcrumb', className)} aria-label={t('Breadcrumb')}>
			<ol className="breadcrumb__list">
				{items.map((item, index) => {
					const isCurrent = index === lastIndex || !item.to;

					return (
						<li key={`${item.label}-${index}`} className="breadcrumb__item">
							{isCurrent || !item.to ? (
								<span
									className="breadcrumb__current"
									aria-current={index === lastIndex ? 'page' : undefined}
									title={item.label}
								>
									{item.label}
								</span>
							) : (
								<Link className="breadcrumb__link" to={item.to} title={item.label}>
									{item.label}
								</Link>
							)}
							{index < lastIndex && (
								<span className="breadcrumb__separator" aria-hidden="true">
									›
								</span>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
};

export default Breadcrumb;
