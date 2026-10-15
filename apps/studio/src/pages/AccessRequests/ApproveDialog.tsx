import { useEffect, useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { AccessRequestRow, AccessSchoolOption } from '@freedi/shared-types';
import { Button, Checkbox } from '@/components/atomic/atoms';
import { approveAccessRequest, listAccessRequests } from '@/db/agoraAccess';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import { callableMessage } from '../_shared/callableErrors';
import { canSubmitSchools } from './accessModel';
import styles from './AccessRequests.module.scss';

/**
 * The system admin's approval with a choice: a teacher request that names no
 * school (pick one, or approve with none), or a coordinator request (pick one
 * or more schools; at least one). Schools come from the list the screen
 * already has, else are fetched when the dialog opens.
 */
export default function ApproveDialog({
	request,
	schools: given,
	onApproved,
	onClose,
}: {
	request: AccessRequestRow;
	schools?: AccessSchoolOption[];
	onApproved: () => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const isCoordinator = request.role === 'supervisor';
	const [schools, setSchools] = useState<AccessSchoolOption[]>(given ?? []);
	const [loading, setLoading] = useState(!given);
	const [selected, setSelected] = useState<string[]>(request.schoolId ? [request.schoolId] : []);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (given) return undefined;
		let alive = true;
		listAccessRequests('pending')
			.then((data) => {
				if (alive) setSchools(data.schools);
			})
			.catch((err: unknown) => {
				logError(err, { operation: 'ApproveDialog.loadSchools' });
				if (alive) setError(t('Could not load the schools.'));
			})
			.finally(() => {
				if (alive) setLoading(false);
			});

		return () => {
			alive = false;
		};
	}, [given, t]);

	const toggle = (schoolId: string, checked: boolean) => {
		if (isCoordinator) {
			setSelected((ids) => (checked ? [...ids, schoolId] : ids.filter((id) => id !== schoolId)));
		} else {
			setSelected(checked ? [schoolId] : []);
		}
	};

	const approve = async () => {
		if (busy || !canSubmitSchools(request.role, selected)) return;
		setBusy(true);
		setError('');
		try {
			await approveAccessRequest(
				isCoordinator
					? { requestId: request.requestId, schoolIds: selected }
					: { requestId: request.requestId, ...(selected[0] ? { schoolId: selected[0] } : {}) },
			);
			onApproved();
		} catch (err) {
			logError(err, {
				operation: 'ApproveDialog.approve',
				metadata: { requestId: request.requestId, role: request.role },
			});
			setError(callableMessage(err, t('Something went wrong. Please try again.')));
			setBusy(false);
		}
	};

	return (
		<SimpleModal title={t('Approve')} onClose={onClose} busy={busy}>
			<div className={styles.form}>
				<p className={styles.note}>
					{isCoordinator
						? t('Choose the schools this regional coordinator will oversee.')
						: t('Choose the school this teacher joins. You may also approve without a school.')}
				</p>
				{loading ? (
					<p className={styles.meta} role="status">
						{t('Loading…')}
					</p>
				) : (
					<div className={styles.schoolList}>
						{schools.map((school) => (
							<Checkbox
								key={school.schoolId}
								label={school.city ? `${school.name} · ${school.city}` : school.name}
								checked={selected.includes(school.schoolId)}
								disabled={busy}
								onChange={(checked) => toggle(school.schoolId, checked)}
							/>
						))}
					</div>
				)}
				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
				<div className={styles.formActions}>
					<Button text={t('Cancel')} variant="secondary" disabled={busy} onClick={onClose} />
					<Button
						text={busy ? t('Working…') : t('Approve')}
						variant="primary"
						disabled={busy || loading || !canSubmitSchools(request.role, selected)}
						onClick={() => void approve()}
					/>
				</div>
			</div>
		</SimpleModal>
	);
}
