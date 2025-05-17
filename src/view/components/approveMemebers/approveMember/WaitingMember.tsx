import avatar from '@/assets/images/avatar.jpg'
import { approveMembership } from '@/controllers/db/membership/setMembership'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import { WaitingMember } from 'delib-npm'
import { FC, useState } from 'react'
import styles from './WaitingMember.module.scss'
import expandIcon from '@/assets/icons/Expand.png'
import collapseIcon from '@/assets/icons/Collapse.png'
import Checkbox from '../../checkbox/Checkbox'

interface Props {
	wait: WaitingMember
}
const ApproveMember: FC<Props> = ({ wait }) => {
	const { t } = useUserConfig();
	const [showDetails, setShowDetails] = useState(false);
	const [isVisible, setIsVisible] = useState(true);
	const [isChecked, setIsChecked] = useState(false);

	function handleApprove() {
		approveMembership(wait, true)
		setIsVisible(false);
	}
	function handleReject() {
		const confirmReject = window.confirm(t("Are you sure you want to reject this member?"));
		if (confirmReject) {
			approveMembership(wait, false); // Call approveMembership with false to reject the member
			setIsVisible(false);
		}
	}

	if (!isVisible) return null;

	return (
		<div className={styles.wrapper}>
			{/* Collapsed summary view */}
			<div className={styles.summaryRow}>
				<Checkbox
					name={`select-${wait.userId}`}
					isChecked={isChecked}
					onChange={(checked) => setIsChecked(checked)}
				/>
				<img src={wait.user.photoURL || avatar} className={styles.avatar} alt="User avatar" />

				<div className={styles.userInfo}>
					<div className={styles.displayName}>{wait.user.displayName}</div>
					<div className={styles.requestDate}>
						{new Date(wait.createdAt).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
							year: 'numeric'
						})}
					</div>
				</div>

				<button onClick={() => setShowDetails(!showDetails)} className={styles.expandBtn}>
					<img src={showDetails ? collapseIcon : expandIcon} alt="Toggle details" className={styles.expandIcon} />
				</button>
			</div>

			{/* Expanded detail view */}
			{showDetails && (
				<div className={styles.detailsPanel}>
					<div>
						<label>{t("Group")}</label>
						<span className={styles.groupName}>{wait.statement.statement}</span>
					</div>
					<div>
						<label>{t("Group Status")}</label>
						<span className={styles.groupStatus}>{wait.statement.membership.access}</span>
					</div>

					<div className={styles.actions}>
						<button className={styles.approveButton} onClick={handleApprove}>
							{t("Approve")}
						</button>
						<button className={styles.rejectButton} onClick={handleReject}>
							{t("Deny")}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
export default ApproveMember