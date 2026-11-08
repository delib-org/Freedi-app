import { useCallback, useEffect, useMemo, useState } from 'react';
import { canDecideAccessRequest } from '@freedi/shared-types';
import type { AgoraAccessStatus, AccessRequestRow, AccessSchoolOption } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { EmptyState, Input, SegmentedControl } from '@/components/atomic/atoms';
import { listAccessRequests } from '@/db/agoraAccess';
import { logError } from '@/utils/logError';
import { LoadError, Loading } from '../AdminAgora/sections/LoadState';
import RequestRow from './RequestRow';
import { refreshAccessCount } from './accessCount';
import {
	NO_SCHOOL,
	actorFromList,
	filterRequests,
	sortRequests,
	type RoleFilter,
} from './accessModel';
import styles from './AccessRequests.module.scss';

interface Loaded {
	isAdmin: boolean;
	requests: AccessRequestRow[];
	schools: AccessSchoolOption[];
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/**
 * The requests list for both roles. The callable scopes it: an admin gets
 * every school (and may filter to "no school"); a coordinator gets only the
 * teacher requests of the schools they coordinate. Approve and Decline show
 * per row only where `canDecideAccessRequest` says the caller may decide.
 */
export default function AccessRequestsView({ base, uid }: { base: string; uid: string }) {
	const { t } = useTranslation();
	const [status, setStatus] = useState<AgoraAccessStatus>('pending');
	const [role, setRole] = useState<RoleFilter>('all');
	const [schoolId, setSchoolId] = useState('');
	const [search, setSearch] = useState('');
	const [data, setData] = useState<Loaded | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [tick, setTick] = useState(0);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError(null);
		listAccessRequests(status, schoolId || undefined)
			.then((response) => {
				if (alive) {
					setData({
						isAdmin: response.isAdmin,
						requests: response.requests,
						schools: response.schools,
					});
				}
			})
			.catch((err: unknown) => {
				logError(err, { operation: 'AccessRequestsView.list', metadata: { status } });
				if (alive) setError(asError(err));
			})
			.finally(() => {
				if (alive) setLoading(false);
			});

		return () => {
			alive = false;
		};
	}, [status, schoolId, tick]);

	const reload = useCallback(() => setTick((n) => n + 1), []);
	const actor = useMemo(
		() => (data ? actorFromList(uid, data.isAdmin, data.schools) : null),
		[data, uid],
	);
	const rows = useMemo(
		() => (data ? sortRequests(filterRequests(data.requests, { role, search }), status) : []),
		[data, role, search, status],
	);
	const showSchoolFilter = !!data && (data.isAdmin || data.schools.length > 1);
	const showRoleFilter = !!data?.isAdmin;

	return (
		<>
			<div className={styles.filters}>
				<SegmentedControl
					ariaLabel={t('Status')}
					segments={[
						{ id: 'pending', label: t('Waiting for approval') },
						{ id: 'approved', label: t('Approved') },
						{ id: 'declined', label: t('Declined') },
					]}
					activeId={status}
					onChange={(id) => setStatus(id as AgoraAccessStatus)}
				/>
				{showRoleFilter && (
					<SegmentedControl
						ariaLabel={t('Role')}
						segments={[
							{ id: 'all', label: t('All') },
							{ id: 'teacher', label: t('Teacher') },
							{ id: 'supervisor', label: t('Regional coordinator') },
						]}
						activeId={role}
						onChange={(id) => setRole(id as RoleFilter)}
					/>
				)}
				{showSchoolFilter && data && (
					<select
						className={styles.select}
						aria-label={t('School')}
						value={schoolId}
						onChange={(event) => setSchoolId(event.target.value)}
					>
						<option value="">{t('All schools')}</option>
						{data.isAdmin && <option value={NO_SCHOOL}>{t('No school')}</option>}
						{data.schools.map((school) => (
							<option key={school.schoolId} value={school.schoolId}>
								{school.name}
							</option>
						))}
					</select>
				)}
				<div className={styles.search}>
					<Input
						type="search"
						ariaLabel={t('Search by name or email')}
						placeholder={t('Search by name or email')}
						value={search}
						onChange={setSearch}
					/>
				</div>
			</div>

			{loading && !data && <Loading />}
			{error && <LoadError error={error} onRetry={reload} />}
			{data && !error && rows.length === 0 && !loading && (
				<EmptyState
					icon="📭"
					title={status === 'pending' ? t('No requests waiting') : t('No requests here')}
					compact
				/>
			)}
			{data && actor && rows.length > 0 && (
				<ul className={styles.list} aria-busy={loading}>
					{rows.map((row) => (
						<RequestRow
							key={row.requestId}
							row={row}
							base={base}
							isAdmin={data.isAdmin}
							schools={data.schools}
							canDecide={canDecideAccessRequest(actor, row)}
							onDecided={() => {
								reload();
								void refreshAccessCount();
							}}
						/>
					))}
				</ul>
			)}
		</>
	);
}
