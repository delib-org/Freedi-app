import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { RoleBadge, Skeleton } from '@/components/atomic/atoms';
import StudioPage from '../_shared/StudioPage';
import styles from './OrgPicker.module.scss';

/**
 * `/orgs` — the workspaces the caller can enter: their organizations, and
 * their own events.
 *
 * A picker, not a dashboard. The events themselves live at `/personal`; a grid
 * of organizations with a list of un-organized events underneath it read as
 * though those events belonged to the organizations above them.
 */
export default function OrgPicker() {
	const { t, tWithParams } = useTranslation();
	const { orgs, memberships, isSystemAdmin, loading } = useOrg();

	const roleOf = (organizationId: string) =>
		memberships.find((m) => m.organizationId === organizationId)?.role;

	return (
		<StudioPage
			title={t('Your organizations')}
			actions={
				isSystemAdmin ? (
					<Link to="/admin/orgs" className="button button--secondary button--small">
						{t('Manage organizations')}
					</Link>
				) : undefined
			}
		>
			<section className={styles.section} aria-label={t('Organizations')}>
				{loading && (
					<ul className={styles.grid} aria-hidden="true">
						<li>
							<Skeleton variant="card" height="6rem" />
						</li>
						<li>
							<Skeleton variant="card" height="6rem" />
						</li>
					</ul>
				)}

				{!loading && orgs.length === 0 && (
					<p className={styles.muted}>{t('You are not a member of any organization yet.')}</p>
				)}

				{orgs.length > 0 && (
					<ul className={styles.grid}>
						{orgs.map((org) => {
							const role = roleOf(org.organizationId);

							return (
								<li key={org.organizationId}>
									<Link
										to={`/orgs/${org.organizationId}`}
										className="card card--interactive card--elevated"
									>
										<div className="card__header">
											<span className="card__title">{org.name}</span>
											{role && <RoleBadge role={role} />}
										</div>
										<p className="card__subtitle">
											{tWithParams('{{count}} questions', { count: org.questionCount ?? 0 })}
										</p>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<section className={styles.section} aria-label={t('Personal')}>
				<Link
					to="/personal"
					className={clsx('card card--interactive card--elevated', styles.personalCard)}
				>
					<div className="card__header">
						<span className="card__title">{t('Personal')}</span>
					</div>
					<p className="card__subtitle">{t('Events outside any organization')}</p>
				</Link>
			</section>
		</StudioPage>
	);
}
