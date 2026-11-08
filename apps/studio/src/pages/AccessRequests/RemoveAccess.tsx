import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { canRemoveAccess } from '@freedi/shared-types';
import type { AgoraAccessActor, AgoraAccessRole } from '@freedi/shared-types';
import { Button } from '@/components/atomic/atoms';
import { removeAccess } from '@/db/agoraAccess';
import ConfirmDialog from './ConfirmDialog';

export interface RemoveAccessTarget {
	uid: string;
	role: AgoraAccessRole;
	schoolId: string;
}

/**
 * "Remove access" for one person at one school, behind a confirm step that
 * names the school. Renders nothing unless the shared `canRemoveAccess` policy
 * lets this actor do it (admins: anyone; coordinators: teachers of their
 * schools). Removing touches that one attachment; other schools stay.
 *
 * `teacherInScope` is true wherever the screen only lists teachers the actor
 * already sees (a narrowed coordinator never sees the others).
 */
export default function RemoveAccess({
	actor,
	target,
	personName,
	schoolName,
	onRemoved,
}: {
	actor: AgoraAccessActor;
	target: RemoveAccessTarget;
	personName: string;
	schoolName: string;
	onRemoved: () => void;
}) {
	const { t, tWithParams } = useTranslation();
	const [open, setOpen] = useState(false);

	if (!canRemoveAccess(actor, target, true)) return null;

	return (
		<>
			<Button
				text={t('Remove access')}
				variant="secondary"
				size="small"
				onClick={() => setOpen(true)}
			/>
			{open && (
				<ConfirmDialog
					title={t('Remove access')}
					message={tWithParams(
						'Remove access for {{name}} at {{school}}? Their past lessons stay theirs.',
						{ name: personName, school: schoolName },
					)}
					confirmText={t('Remove access')}
					operation="RemoveAccess.remove"
					onClose={() => setOpen(false)}
					onConfirm={async () => {
						await removeAccess(target);
						setOpen(false);
						onRemoved();
					}}
				/>
			)}
		</>
	);
}
