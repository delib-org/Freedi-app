import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { OrganizationStatus } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useOrg } from '@/org/OrgContext';
import { useAllOrganizations } from '@/db/orgStatements';
import { Button, EmptyState, Input, Skeleton, Tag } from '@/components/atomic/atoms';
import StudioPage from '../_shared/StudioPage';
import { useGrace } from '../_shared/useGrace';
import OpenOrganizationModal from './OpenOrganizationModal';
import styles from './AdminOrgs.module.scss';

/** `/admin/orgs` — every organization (system admins only). `?new=1` opens the create dialog. */
export default function AdminOrgs() {
	const { t, tWithParams } = useTranslation();
	const { isSystemAdmin, loading: orgLoading } = useOrg();
	const [params, setParams] = useSearchParams();
	const { data: orgs, loading, error } = useAllOrganizations(isSystemAdmin);
	const [search, setSearch] = useState('');
	const showModal = params.get('new') === '1';
	// The admin flag arrives on its own snapshot — give it a moment before bouncing.
	const denied = useGrace(!orgLoading && !isSystemAdmin);

	if (denied) return <Navigate to="/" replace />;

	const openModal = () => setParams({ new: '1' });
	const closeModal = () => setParams({});

	const needle = search.trim().toLowerCase();
	const visible = needle ? orgs.filter((o) => o.name.toLowerCase().includes(needle)) : orgs;

	if (!isSystemAdmin) {
		return (
			<StudioPage breadcrumb={[{ label: t('Organizations') }]}>
				<div className="studio-loading">{t('Loading…')}</div>
			</StudioPage>
		);
	}

	return (
		<StudioPage
			breadcrumb={[{ label: t('Organizations') }]}
			title={t('Organizations')}
			actions={
				<Button text={`+ ${t('Open organization')}`} variant="primary" onClick={openModal} />
			}
		>
			<div className={styles.toolbar}>
				<Input
					type="search"
					ariaLabel={t('Search organizations')}
					placeholder={t('Search organizations')}
					value={search}
					onChange={setSearch}
					clearable
				/>
				<span className={styles.count}>
					{tWithParams('{{count}} organizations', { count: visible.length })}
				</span>
			</div>

			{loading && (
				<div className={styles.skeleton} aria-hidden="true">
					<Skeleton variant="header" />
					<Skeleton variant="text" />
					<Skeleton variant="text" />
				</div>
			)}

			{error && (
				<EmptyState variant="error" title={t('Could not load the organizations.')} compact />
			)}

			{!loading && !error && visible.length === 0 && (
				<EmptyState
					variant={needle ? 'search' : 'default'}
					icon="🏢"
					title={needle ? t('No organizations match your search') : t('No organizations yet')}
					action={
						needle ? undefined : (
							<Button text={`+ ${t('Open organization')}`} variant="primary" onClick={openModal} />
						)
					}
				/>
			)}

			{visible.length > 0 && (
				<table className={styles.table}>
					<thead>
						<tr>
							<th scope="col">{t('Organization')}</th>
							<th scope="col">{t('Members')}</th>
							<th scope="col">{t('Questions')}</th>
							<th scope="col">{t('Status')}</th>
						</tr>
					</thead>
					<tbody>
						{visible.map((org) => (
							<tr key={org.organizationId}>
								<th scope="row">
									<Link to={`/admin/orgs/${org.organizationId}`}>{org.name}</Link>
								</th>
								<td className="stat-number">{org.memberCount ?? 0}</td>
								<td className="stat-number">{org.questionCount ?? 0}</td>
								<td>
									<Tag status={org.status === OrganizationStatus.active ? 'open' : 'closed'} dot>
										{org.status === OrganizationStatus.active ? t('Active') : t('Suspended')}
									</Tag>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{showModal && <OpenOrganizationModal onClose={closeModal} />}
		</StudioPage>
	);
}
