import { WaitingMember } from 'delib-npm'
import { FC } from 'react'
import styles from './ApproveMember.module.scss'
import { UserCheck, UserX } from 'lucide-react'
import { useUserConfig } from '@/controllers/hooks/useUserConfig'

interface Props {
	wait: WaitingMember
}
const ApproveMember: FC<Props> = ({ wait }) => {
	const { t } = useUserConfig();

	return (
		<div className={styles.memberDisplay}>
			<div className={styles.memberName}>{wait.user.displayName}</div>
			<span className={styles.inGroup}>{t("in group")}</span>
			<div className={styles.statement}>{wait.statement.statement}</div>
			<div className={styles.buttons}>
				<button className={styles.approveButton}>
					<UserCheck size={20} color="green" />
				</button>
				<button className={styles.rejectButton}>
					<UserX size={20} color="red" />
				</button>
			</div>
		</div>
	)
}

export default ApproveMember