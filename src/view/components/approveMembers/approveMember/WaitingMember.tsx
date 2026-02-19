import collapseIcon from '@/assets/icons/Collapse.png';
import expandIcon from '@/assets/icons/Expand.png';
import avatar from '@/assets/images/avatar.jpg';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { approveSingle, rejectSingle } from '@/services/membershipActions';
import { WaitingMember } from '@freedi/shared-types';
import { FC, useState } from 'react';
import Checkbox from '../../checkbox/Checkbox';
import styles from './WaitingMember.module.scss';

interface Props {
	wait: WaitingMember;
	isChecked: boolean;
	onCheckChange: (checked: boolean) => void;
}
const ApproveMember: FC<Props> = ({ wait, isChecked, onCheckChange }) => {
	const { t } = useTranslation();
	const [showDetails, setShowDetails] = useState(false);
	const [isVisible, setIsVisible] = useState(true);

	function handleApprove() {
		approveSingle(wait, () => setIsVisible(false));
	}

	function handleReject() {
		rejectSingle(wait, () => setIsVisible(false));
	}

	if (!isVisible) return null;

	return (
		<div className={styles.wrapper}>
			{/* Collapsed summary view */}
			<div className={styles.summaryRow}>
				<Checkbox
					name={`select-${wait.userId}`}
					isChecked={isChecked}
					onChange={onCheckChange}
					label=""
				/>
				<img src={wait.user.photoURL || avatar} className={styles.avatar} alt="User avatar" />

				<div className={styles.userInfo}>
					<div className={styles.displayName}>{wait.user.displayName}</div>
					<div className={styles.requestDate}>
						{new Date(wait.createdAt).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
							year: 'numeric',
						})}
					</div>
				</div>

				<button onClick={() => setShowDetails(!showDetails)} className={styles.expandBtn}>
					<img
						src={showDetails ? collapseIcon : expandIcon}
						alt="Toggle details"
						className={styles.expandIcon}
					/>
				</button>
			</div>

			{/* Expanded detail view */}
			{showDetails && (
				<div className={styles.detailsPanel}>
					<div className={styles.detailRow}>
						<label>{t('Group')}</label>
						<span className={styles.groupName}>{wait.statement.statement}</span>
					</div>
					<div className={`${styles.detailRow} ${styles.statusRow}`}>
						<label>{t('Group Status')}</label>
						<span className={styles.groupStatus}>{wait.statement.membership.access}</span>
					</div>

					<div className={styles.actions}>
						<button className={styles.approveBtn} onClick={handleApprove}>
							{t('Approve')}
						</button>
						<button className={styles.rejectBtn} onClick={handleReject}>
							{t('Deny')}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
export default ApproveMember;
