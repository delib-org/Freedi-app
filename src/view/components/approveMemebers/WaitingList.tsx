import { useState } from "react";
import { useApproveMembership } from "./WaitingListVM";
import MembersIcon from "@/assets/icons/group.svg?react";
import styles from "./WaitingList.module.scss";
import "./approveMember/WaitingMember.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import ApproveMember from "./approveMember/WaitingMember";
import Checkbox from "../checkbox/Checkbox";
import { approveMembership } from "@/controllers/db/membership/setMembership";

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
		selectedIds.forEach((id) => {
			const member = waitingList.find((m) => m.statementsSubscribeId === id);
			if (member) approveMembership(member, true);
		});
		setSelectedIds([]);
	};

	const handleDenyAll = () => {
		const confirmReject = window.confirm(t("Are you sure you want to reject all selected members?"));
		if (confirmReject) {
			selectedIds.forEach((id) => {
				const member = waitingList.find((m) => m.statementsSubscribeId === id);
				if (member) approveMembership(member, false);
			});
			setSelectedIds([]);
		}
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
				<div className={`${styles.membersList} ${dir === "rtl" ? styles.rtl : ""}`}>
					<h3>{t("Waiting List")}</h3>

					<div className={styles.selectAllWrapper}>
						<Checkbox
							label={allSelected ? "Unselect All" : "Select All"}
							isChecked={allSelected}
							onChange={toggleSelectAll}
						/>
					</div>

					{selectedIds.length > 0 && (
						<div className={styles.bulkActions}>
							<button className="approveButton" onClick={handleApproveAll}>
								{t("Approve Selected")}
							</button>
							<button className="rejectButton" onClick={handleDenyAll}>
								{t("Deny Selected")}
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
				</div>
			)}
		</div>
	);
};

export default WaitingList;
