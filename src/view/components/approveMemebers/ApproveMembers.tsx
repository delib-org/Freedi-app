import { useState } from "react";
import { useApproveMembership } from "./ApproveMembersVM";
import MembersIcon from "@/assets/icons/group.svg?react";
import styles from "./ApproveMembers.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import ApproveMember from "./approveMember/ApproveMember";

const ApproveMembers = () => {
	const { waitingList } = useApproveMembership();
	const { dir, t } = useUserConfig();
	const [show, setShow] = useState(false);

	const numberMembers = waitingList.length;
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
						<ApproveMember key={member.userId} wait={member} />
					))}
				</div>
			)}
		</div >
	)
}

export default ApproveMembers