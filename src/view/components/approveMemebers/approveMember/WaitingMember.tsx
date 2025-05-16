import { WaitingMember } from 'delib-npm'
import { FC, useState } from 'react'
import styles from './WaitingMember.module.scss'
import { UserCheck, UserX } from 'lucide-react'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import { approveMembership } from '@/controllers/db/membership/setMembership'
import avatar from '@/assets/images/avatar.jpg'

interface Props {
	wait: WaitingMember
}
const ApproveMember: FC<Props> = ({ wait }) => {
	const { t } = useUserConfig();
	const [showDetails, setShowDetails] = useState(false);
	const [isVisible, setIsVisible] = useState(true);

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
				<input type="checkbox" className={styles.checkbox} />

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
					{showDetails ? '-' : '+'}
				</button>
			</div>

			{/* Expanded detail view */}
			{showDetails && (
				<div className={styles.detailsPanel}>
					<div>
						<strong>{t("Group")}:</strong> {wait.statement.statement}
					</div>
					<div>
						<strong>{t("Group Status")}:</strong> {wait.statement.membership.access}
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