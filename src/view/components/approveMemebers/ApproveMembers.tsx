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

	console.log(waitingList)

	return (
		<div className={styles.approveMembers}>
			<button onClick={() => setShow(!show)} className={styles.toggleButton}> {/* Add toggle functionality */}
				<MembersIcon />
			</button>
			{show && waitingList.length > 0 && (
				<div className={`${styles.membersList} ${dir === "rtl" ? styles.rtl : ""}`}>
					<h3>{t("Waiting List")}</h3>
					{waitingList.map(member => (
						<ApproveMember key={member.userId} wait={member} />
					))}
				</div>
			)}
		</div>
	)
}

export default ApproveMembers