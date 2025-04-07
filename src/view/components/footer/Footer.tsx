import { FC } from "react";
// icons
import AddIcon from "@/assets/icons/plusIcon.svg?react";
import GroupIcon from "@/assets/icons/group.svg?react";
// import GravelIcon from "@/assets/icons/gravel.svg?react";
import QuestionMarkIcon from "@/assets/icons/questionIcon.svg?react";
import styles from "./Footer.module.scss";
import { useUserConfig } from "@/controllers/hooks/useUserConfig";

interface Props {
	addGroup: () => void;
	subPage: "decisions" | "groups";
	setSubPage: (page: "decisions" | "groups") => void;
}

const Footer: FC<Props> = ({ addGroup, setSubPage, subPage }) => {

	const { t } = useUserConfig();

	return (
		<div className="wrapper">
			<div className={styles.footer} data-cy="add-statement">

				<button onClick={addGroup} className={styles.addStatementButton}>
					<AddIcon />
				</button>
				<button onClick={() => setSubPage("decisions")} className={`${styles.button} ${subPage === "decisions" ? styles.buttonActive : ""}`}>
					<div className={`${styles.buttonImage} ${subPage === "decisions" ? styles.buttonImageActive : ""}`}>
						<QuestionMarkIcon />
					</div>
					<span className={`${subPage === "decisions" ? styles.activeText : ""}`}>{t("Decisions")}</span>
				</button>
				<button onClick={() => setSubPage("groups")} className={`${styles.button} ${subPage === "groups" ? styles.buttonActive : ""}`}>
					<GroupIcon className={`${styles.buttonImage}`} />
					<span className={`${subPage === "groups" ? styles.activeText : ""}`}>{t("Groups")}</span>
				</button>

			</div>
		</div >
	);
};

export default Footer;