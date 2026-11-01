import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button from '@/view/components/atomic/atoms/Button';
import { Sheet } from '@/view/components/atomic/molecules/Sheet';
import { MemberBadges, memberActionClassName } from './MemberRow';
import { MemberAction, MemberEntry } from './membersLogic';
import { MEMBER_ACTION_LABEL, MEMBER_ACTION_VARIANT } from './memberActionLabels';
import styles from './MembersSubsection.module.scss';

interface MemberActionsSheetProps {
	entry: MemberEntry | null;
	actions: ReadonlyArray<MemberAction>;
	onAction: (entry: MemberEntry, action: MemberAction) => void;
	onClose: () => void;
}

/**
 * Row actions on phones (UX 3.4): the person's name and role on top so the
 * host never acts on the wrong row, one full-width button per action, Cancel last.
 */
const MemberActionsSheet: FC<MemberActionsSheetProps> = ({ entry, actions, onAction, onClose }) => {
	const { t } = useTranslation();
	if (!entry) return null;

	return (
		<Sheet isOpen onClose={onClose} title={entry.name} id="member-actions-sheet">
			<div className={styles.sheetRole}>
				<MemberBadges entry={entry} />
			</div>
			<div className={styles.sheetActions}>
				{actions.map((action) => (
					<Button
						key={action}
						text={t(MEMBER_ACTION_LABEL[action])}
						variant={MEMBER_ACTION_VARIANT[action]}
						fullWidth
						className={memberActionClassName(action, 'button--touch')}
						onClick={() => {
							onClose();
							onAction(entry, action);
						}}
					/>
				))}
				<Button
					text={t('Cancel')}
					variant="cancel"
					fullWidth
					className="button--touch"
					onClick={onClose}
				/>
			</div>
		</Sheet>
	);
};

export default MemberActionsSheet;
