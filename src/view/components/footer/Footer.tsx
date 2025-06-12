import { FC } from "react";
// icons
import GroupIcon from "@/assets/icons/group.svg?react";
// import GravelIcon from "@/assets/icons/gravel.svg?react";
import TargetIcon from "@/assets/icons/target.svg?react";
import styles from "./Footer.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { NotificationType } from "delib-npm";
import { useSelector } from "react-redux";
import { inAppNotificationsSelector } from "@/redux/notificationsSlice/notificationsSlice";
import { creatorSelector } from "@/redux/creator/creatorSlice";
import AddButton from "@/view/pages/statement/components/addButton/AddButton";

interface Props {
	addGroup: () => void;
	subPage: "decisions" | "groups";
	setSubPage: (page: "decisions" | "groups") => void;
	isMain: boolean;
}

const Footer: FC<Props> = ({ addGroup, setSubPage, subPage, isMain }) => {

	const { t } = useUserConfig();
	const creator = useSelector(creatorSelector);
	const inAppNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(n => n.creatorId !== creator?.uid);

	return (

		<div className={styles.footer} data-cy="add-statement">

			<AddButton addGroup={addGroup} isMain={isMain} />
			<button onClick={() => setSubPage("decisions")} className={`${styles.button} ${subPage === "decisions" ? styles.buttonActive : ""}`}>
				<div className={`${styles.buttonImage} ${subPage === "decisions" ? styles.buttonImageActive : ""}`}>
					{inAppNotificationsList.length > 0 && <div className={styles.redCircle}>
						{inAppNotificationsList.length < 10
							? inAppNotificationsList.length
							: `9+`}
					</div>}
					<TargetIcon />
				</div>
				<span className={`${subPage === "decisions" ? styles.activeText : ""}`}>{t("Decisions")}</span>
			</button>
			<button onClick={() => setSubPage("groups")} className={`${styles.button} ${subPage === "groups" ? styles.buttonActive : ""}`}>
				<GroupIcon className={`${styles.buttonImage}`} />
				<span className={`${subPage === "groups" ? styles.activeText : ""}`}>{t("Groups")}</span>
			</button>

		</div>

	);
};

export default Footer;