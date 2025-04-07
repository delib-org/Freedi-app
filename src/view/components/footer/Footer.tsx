import { FC } from "react";
// icons
import AddIcon from "@/assets/icons/plusIcon.svg?react";
import GroupIcon from "@/assets/icons/group.svg?react";
// import GravelIcon from "@/assets/icons/gravel.svg?react";
import QuestionMarkIcon from "@/assets/icons/questionIcon.svg?react";
import styles from "./Footer.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";
import { NotificationType } from "delib-npm";
import { useSelector } from "react-redux";
import { inAppNotificationsSelector } from "@/redux/notificationsSlice/notificationsSlice";
import { creatorSelector } from "@/redux/creator/creatorSlice";

interface Props {
	addGroup: () => void;
	subPage: "decisions" | "groups";
	setSubPage: (page: "decisions" | "groups") => void;
}

const Footer: FC<Props> = ({ addGroup, setSubPage, subPage }) => {

	const { t } = useUserConfig();
	const creator = useSelector(creatorSelector);
	const inAppNotificationsList: NotificationType[] = useSelector(inAppNotificationsSelector).filter(n => n.creatorId !== creator?.uid);

	return (

		<div className={styles.footer} data-cy="add-statement">

			<button onClick={addGroup} className={styles.addStatementButton}>
				<AddIcon />
			</button>
			<button onClick={() => setSubPage("decisions")} className={`${styles.button} ${subPage === "decisions" ? styles.buttonActive : ""}`}>
				<div className={`${styles.buttonImage} ${subPage === "decisions" ? styles.buttonImageActive : ""}`}>
					{inAppNotificationsList.length > 0 && <div className={styles.redCircle}>
						{inAppNotificationsList.length < 10
							? inAppNotificationsList.length
							: `9+`}
					</div>}
					<QuestionMarkIcon />
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