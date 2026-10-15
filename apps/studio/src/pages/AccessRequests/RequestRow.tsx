import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AccessRequestRow, AccessSchoolOption } from '@freedi/shared-types';
import RequestActions, { type Decision } from './RequestActions';
import { RoleTag, StatusTag } from './StatusTag';
import { applicantName, schoolLabel } from './accessModel';
import styles from './AccessRequests.module.scss';

export function formatDate(ms: number): string {
	return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * One request in the list: who, which role, which school, when, the note;
 * Approve / Decline inline when the caller may decide; a link to the full
 * request. The applicant's email is shown only because the callable returned it.
 */
export default function RequestRow({
	row,
	base,
	canDecide,
	isAdmin,
	schools,
	onDecided,
}: {
	row: AccessRequestRow;
	base: string;
	canDecide: boolean;
	isAdmin: boolean;
	schools: AccessSchoolOption[];
	onDecided: (decision: Decision) => void;
}) {
	const { t } = useTranslation();
	const school = schoolLabel(row);

	return (
		<li className={styles.row}>
			<div className={styles.rowHead}>
				<h3 className={styles.name}>{applicantName(row)}</h3>
				<RoleTag role={row.role} />
				<StatusTag status={row.status} />
			</div>
			{row.applicantEmail && <p className={styles.meta}>{row.applicantEmail}</p>}
			<p className={styles.meta}>
				{school ? `${school} · ` : ''}
				{formatDate(row.createdAt)}
			</p>
			{row.note && <p className={styles.note}>{row.note}</p>}
			{row.status === 'declined' && row.declineReason && (
				<p className={styles.meta}>
					{t('Reason')}: {row.declineReason}
				</p>
			)}
			{canDecide ? (
				<RequestActions request={row} isAdmin={isAdmin} schools={schools} onDecided={onDecided} />
			) : null}
			<div className={styles.actions}>
				<Link to={`${base}/requests/${row.requestId}`}>{t('Open request')}</Link>
			</div>
		</li>
	);
}
