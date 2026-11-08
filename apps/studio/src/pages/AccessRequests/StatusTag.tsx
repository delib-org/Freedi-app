import { useTranslation } from '@freedi/shared-i18n/react';
import type { AgoraAccessRole, AgoraAccessStatus } from '@freedi/shared-types';
import { Tag } from '@/components/atomic/atoms';

/** "Waiting for approval" / "Approved" / "Declined" / "Withdrawn", as the spec names them. */
export function StatusTag({ status }: { status: AgoraAccessStatus }) {
	const { t } = useTranslation();

	switch (status) {
		case 'approved':
			return (
				<Tag status="open" dot>
					{t('Approved')}
				</Tag>
			);
		case 'declined':
			return (
				<Tag status="closed" dot>
					{t('Declined')}
				</Tag>
			);
		case 'withdrawn':
			return (
				<Tag status="queued" dot>
					{t('Withdrawn')}
				</Tag>
			);
		default:
			return (
				<Tag status="frozen" dot>
					{t('Waiting for approval')}
				</Tag>
			);
	}
}

/** Teacher or Regional coordinator (code name `supervisor`). */
export function RoleTag({ role }: { role: AgoraAccessRole }) {
	const { t } = useTranslation();

	return <Tag outline>{role === 'supervisor' ? t('Regional coordinator') : t('Teacher')}</Tag>;
}
