import type { ReactNode } from 'react';
import { AppShell } from '@/components/atomic/organisms/AppShell';
import type { BreadcrumbItem } from '@/components/atomic/molecules/Breadcrumb';
import { useStudioNav } from './useStudioNav';
import { useStudioScope } from './useStudioScope';
import styles from './StudioPage.module.scss';

/**
 * Every console page renders inside StudioPage: the AppShell (top bar, side
 * nav — AppShell owns the `<main>` landmark), a breadcrumb trail and a page
 * header (title + actions).
 *
 * The trail always begins with the workspace the URL puts you in — the
 * organization, your own events, or the admin screens — and that first crumb
 * is the switcher. Pages supply only what sits *inside* their workspace, so a
 * page cannot disagree with the shell about where it is.
 */
export interface StudioPageProps {
	/** The trail after the workspace crumb. */
	breadcrumb?: BreadcrumbItem[];
	title?: string;
	actions?: ReactNode;
	children: ReactNode;
}

export default function StudioPage({ breadcrumb, title, actions, children }: StudioPageProps) {
	const scope = useStudioScope();
	const nav = useStudioNav(scope);

	return (
		<AppShell nav={nav} scope={scope} breadcrumb={breadcrumb}>
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
