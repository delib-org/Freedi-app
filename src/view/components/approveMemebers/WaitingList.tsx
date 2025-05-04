import { useState } from "react";
import { useApproveMembership } from "./WaitingListVM";
import MembersIcon from "@/assets/icons/group.svg?react";
import styles from "./WaitingList.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import WaitingMember from "./approveMember/WaitingMember";

const WaitingList = () => {
	const { waitingList } = useApproveMembership();
	const { dir, t } = useUserConfig();
	const [show, setShow] = useState(false);

	const numberMembers = waitingList.length < 99 ? waitingList.length : "99+"; // Limit the number to 99+ if it exceeds 99
	if (numberMembers === 0) return null; // Don't render if there are no members

	return (
		<div className={styles.approveMembers}>
			<button onClick={() => setShow(!show)} className={styles.toggleButton}> {/* Add toggle functionality */}
				<MembersIcon />
				<div className={`notificationsCircle ${styles.notification}`}>{numberMembers}</div>
			</button >
			{show && waitingList.length > 0 && (
				<div className={`${styles.membersList} ${dir === "rtl" ? styles.rtl : ""}`}>
					<h3>{t("Waiting List")}</h3>
					{waitingList.map(member => (
						<WaitingMember key={member.statementsSubscribeId} wait={member} />
					))}
				</div>
			)}
		</div >
	)
}

export default WaitingList