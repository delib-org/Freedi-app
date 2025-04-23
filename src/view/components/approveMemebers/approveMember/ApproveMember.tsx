import { WaitingMember } from 'delib-npm'
import { FC, useState } from 'react'
import styles from './ApproveMember.module.scss'
import { UserCheck, UserX } from 'lucide-react'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import { approveMembership } from '@/controllers/db/membership/setMembership'

interface Props {
	wait: WaitingMember
}
const ApproveMember: FC<Props> = ({ wait }) => {
	const { t } = useUserConfig();
	const [show, setShow] = useState(true);

	function handleApprove() {
		approveMembership(wait, true)
		setShow(false)
	}
	function handleReject() {
		const confirmReject = window.confirm(t("Are you sure you want to reject this member?"));
		if (confirmReject) {
			approveMembership(wait, false); // Call approveMembership with false to reject the member
			setShow(false)
		}
	}

	if (show === false) {
		return null; // Don't render anything if show is false
	}

	return (
		<div className={styles.memberDisplay}>
			<div className={styles.memberName}>{wait.user.displayName}</div>
			<span className={styles.inGroup}>{t("in")}</span>
			<div className={styles.statement}>{wait.statement.statement}</div>
			<div className={styles.buttons}>
				<button className={styles.approveButton} onClick={handleApprove}>
					<UserCheck size={20} color="green" />
				</button>
				<button className={styles.rejectButton} onClick={handleReject}>
					<UserX size={20} color="red" />
				</button>
			</div>
		</div>
	)
}

export default ApproveMember