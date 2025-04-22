import { useState } from "react";
import { useApproveMembership } from "./ApproveMembersVM";
import MembersIcon from "@/assets/icons/group.svg?react";
import styles from "./ApproveMembers.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";

const ApproveMembers = () => {
	const { waitingList } = useApproveMembership();
	const { dir } = useUserConfig();
	const [show, setShow] = useState(false);

	return (
		<div className={styles.approveMembers}>
			<button onClick={() => setShow(!show)} className={styles.toggleButton}> {/* Add toggle functionality */}
				<MembersIcon />
			</button>
			{show && waitingList.length > 0 && (
				<div className={`${styles.membersList} ${dir === "rtl" ? styles.rtl : ""}`}>
					<h3>Waiting List</h3>
					{waitingList.map(member => (
						<div key={member.userId}>{member.user.displayName}</div>
					))}
				</div>
			)}
		</div>
	)
}

export default ApproveMembers