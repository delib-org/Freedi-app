import { useState } from "react";
import { useApproveMembership } from "./WaitingListVM";
import MembersIcon from "@/assets/icons/group.svg?react";
import waitingStyles from "./approveMember/WaitingMember.module.scss";
import styles from "./WaitingList.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import ApproveMember from "./approveMember/WaitingMember";
import Checkbox from "../checkbox/Checkbox";
import { approveMultiple, rejectMultiple } from "@/services/membershipActions";
import closeList from "@/assets/icons/closeList.png";

const WaitingList = () => {
	const { waitingList } = useApproveMembership();
	const { dir, t } = useUserConfig();
	const [show, setShow] = useState(false);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);

	const allIds = waitingList.map((m) => m.statementsSubscribeId);
	const allSelected = waitingList.length > 0 && selectedIds.length === waitingList.length;

	const toggleSelectAll = () => {
		setSelectedIds(allSelected ? [] : allIds);
	};

	const handleApproveAll = () => {
		const membersToApprove = waitingList.filter(m => selectedIds.includes(m.statementsSubscribeId));
		approveMultiple(membersToApprove);
		setSelectedIds([]);
	};

	const handleDenyAll = () => {
		const membersToReject = waitingList.filter(m => selectedIds.includes(m.statementsSubscribeId));
		rejectMultiple(membersToReject);
		setSelectedIds([]);
	};

	const numberMembers = waitingList.length < 99 ? waitingList.length : "99+";
	if (numberMembers === 0) return null;

	return (
		<div className={styles.approveMembers}>
			<button
				onClick={() => setShow(!show)}
				className={styles.toggleButton}
			>
				<MembersIcon />
				<div className={`notificationsCircle ${styles.notification}`}>
					{numberMembers}
				</div>
			</button>

			{show && waitingList.length > 0 && (
				<div className={`${styles.membersList} ${dir === "rtl" ? styles.rtl : styles.ltr}`}>
					<button
						className={styles.exitButton}
						onClick={() => setShow(false)}
					>
						<img src={closeList} alt="Close" />
					</button>

					<h3 className={styles.listTitle}>{t("Waiting List")}</h3>

					<div className={styles.selectAllWrapper}>
						<Checkbox
							label={allSelected ? "Deselect All" : "Select All"}
							isChecked={allSelected}
							onChange={toggleSelectAll}
							className={styles.reverseCheckboxLayout}
						/>
					</div>

					{selectedIds.length === waitingList.length && (
						<div className={waitingStyles.actions}>
							<button className={waitingStyles.approveButton} onClick={handleApproveAll}>
								{t("Approve All")}
							</button>
							<button className={waitingStyles.rejectButton} onClick={handleDenyAll}>
								{t("Deny All")}
							</button>
						</div>
					)}

					{waitingList.map((member) => (
						<ApproveMember
							key={member.statementsSubscribeId}
							wait={member}
							isChecked={selectedIds.includes(member.statementsSubscribeId)}
							onCheckChange={(checked) => {
								setSelectedIds((prev) =>
									checked
										? [...prev, member.statementsSubscribeId]
										: prev.filter((id) => id !== member.statementsSubscribeId)
								);
							}}
						/>
					))}

					<button className={styles.bottomCloseButton} onClick={() => setShow(false)}>
						{t("Close")}
					</button>
				</div>
			)}
		</div>
	);
};

export default WaitingList;
