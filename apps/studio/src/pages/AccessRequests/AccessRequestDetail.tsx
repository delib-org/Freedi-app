import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AccessRequestRow } from '@freedi/shared-types';
import { useOrg } from '@/org/OrgContext';
import { EmptyState } from '@/components/atomic/atoms';
import { getAccessRequest } from '@/db/agoraAccess';
import { logError } from '@/utils/logError';
import StudioPage from '../_shared/StudioPage';
import { LoadError, Loading } from '../AdminAgora/sections/LoadState';
import RequestActions from './RequestActions';
import { RoleTag, StatusTag } from './StatusTag';
import { formatDate } from './RequestRow';
import { applicantName, schoolLabel } from './accessModel';
import { useAccessTree } from './useAccessTree';
import styles from './AccessRequests.module.scss';

interface Loaded {
	request: AccessRequestRow;
	lessonsRun: number;
	applicantApproved: boolean;
	canDecide: boolean;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/**
 * One request, in full: who, email, school, note, lessons already run, and
 * Approve / Decline when the caller may decide. `canDecide` comes from the
 * callable, which applies the same `canDecideAccessRequest` rule.
 */
export function AccessRequestBody({
	requestId,
	listPath,
	isAdmin,
}: {
	requestId: string;
	listPath: string;
	isAdmin: boolean;
}) {
	const { t, tWithParams } = useTranslation();
	const navigate = useNavigate();
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [tick, setTick] = useState(0);

	useEffect(() => {
		let alive = true;
		setError(null);
		getAccessRequest(requestId)
			.then((response) => {
				if (alive) setData(response);
			})
			.catch((err: unknown) => {
				logError(err, { operation: 'AccessRequestDetail.get', metadata: { requestId } });
				if (alive) setError(asError(err));
			});

		return () => {
			alive = false;
		};
	}, [requestId, tick]);

	const retry = useCallback(() => setTick((n) => n + 1), []);

	if (error) {
		return <LoadError error={error} notFoundText={t('Request not found.')} onRetry={retry} />;
	}
	if (!data) return <Loading />;

	const { request, lessonsRun, applicantApproved, canDecide } = data;
	const school = schoolLabel(request);

	return (
		<div className={styles.detail}>
			<div className={styles.rowHead}>
				<h2 className={styles.name}>{applicantName(request)}</h2>
				<RoleTag role={request.role} />
				<StatusTag status={request.status} />
			</div>
			<dl className={styles.facts}>
				{request.applicantEmail && (
					<>
						<dt>{t('Email')}</dt>
						<dd>{request.applicantEmail}</dd>
					</>
				)}
				<dt>{t('School')}</dt>
				<dd>{school || t('No school')}</dd>
				<dt>{t('Requested')}</dt>
				<dd>{formatDate(request.createdAt)}</dd>
				<dt>{t('Lessons run')}</dt>
				<dd>{lessonsRun}</dd>
				{request.note && (
					<>
						<dt>{t('Note')}</dt>
						<dd>{request.note}</dd>
					</>
				)}
				{request.declineReason && (
					<>
						<dt>{t('Reason')}</dt>
						<dd>{request.declineReason}</dd>
					</>
				)}
				{request.decidedAt && (
					<>
						<dt>{t('Decided')}</dt>
						<dd>{formatDate(request.decidedAt)}</dd>
					</>
				)}
			</dl>
			{applicantApproved && request.status === 'pending' && (
				<p className={styles.meta}>
					{tWithParams('{{name}} is already approved, for example at another school.', {
						name: applicantName(request),
					})}
				</p>
			)}
			{canDecide && request.status === 'pending' && (
				<RequestActions request={request} isAdmin={isAdmin} onDecided={() => navigate(listPath)} />
			)}
		</div>
	);
}

/** `…/requests/:requestId` */
export default function AccessRequestDetail() {
	const { t } = useTranslation();
	const { requestId = '' } = useParams<{ requestId: string }>();
	const tree = useAccessTree();
	const { isSystemAdmin } = useOrg();
	const title = t('Access request');
	const listPath = `${tree.base}/requests`;
	const crumbs = [
		{ label: tree.rootLabel, to: tree.base },
		{ label: t('Access requests'), to: listPath },
		{ label: title },
	];

	if (tree.redirectTo) return <Navigate to={tree.redirectTo} replace />;

	return (
		<StudioPage breadcrumb={crumbs} title={title}>
			{tree.enabled && requestId ? (
				<AccessRequestBody requestId={requestId} listPath={listPath} isAdmin={isSystemAdmin} />
			) : (
				<EmptyState variant="error" title={t('Request not found.')} compact />
			)}
		</StudioPage>
	);
}
