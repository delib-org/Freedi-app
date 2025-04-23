import { WaitingMember } from 'delib-npm'
import { FC } from 'react'
import styles from './ApproveMember.module.scss'
import { UserCheck, UserX } from 'lucide-react'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'
import { approveMembership } from '@/controllers/db/membership/setMembership'

interface Props {
	wait: WaitingMember
}
const ApproveMember: FC<Props> = ({ wait }) => {
	const { t } = useUserConfig();

	function handleApprove() {
		approveMembership(wait)
	}
	function handleReject() {
		console.log("reject")
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