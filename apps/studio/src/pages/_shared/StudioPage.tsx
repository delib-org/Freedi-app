import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/atomic/organisms/AppShell';
import { Breadcrumb, type BreadcrumbItem } from '@/components/atomic/molecules/Breadcrumb';
import { useStudioNav } from './useStudioNav';
import styles from './StudioPage.module.scss';

/**
 * Every console page renders inside StudioPage: the AppShell (top bar, org
 * switcher, side nav — AppShell owns the `<main>` landmark), an optional
 * breadcrumb trail and a page header (title + actions). The org itself is
 * represented by the OrgSwitcher, so it is never a crumb.
 */
export interface StudioPageProps {
	breadcrumb?: BreadcrumbItem[];
	title?: string;
	actions?: ReactNode;
	children: ReactNode;
}

export default function StudioPage({ breadcrumb, title, actions, children }: StudioPageProps) {
	const nav = useStudioNav();
	const navigate = useNavigate();

	return (
		<AppShell
			nav={nav}
			breadcrumb={
				breadcrumb && breadcrumb.length > 0 ? <Breadcrumb items={breadcrumb} /> : undefined
			}
			onCreateOrg={() => navigate('/admin/orgs?new=1')}
		>
			<div className={styles.page}>
				{(title || actions) && (
					<header className={styles.header}>
						{title && <h1 className={styles.title}>{title}</h1>}
						{actions && <div className={styles.actions}>{actions}</div>}
					</header>
				)}
				{children}
			</div>
		</AppShell>
	);
}
