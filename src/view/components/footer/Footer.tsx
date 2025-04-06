import { FC } from "react";
// icons
import AddIcon from "@/assets/icons/plusIcon.svg?react";
import GroupIcon from "@/assets/icons/group.svg?react";
import GravelIcon from "@/assets/icons/gravel.svg?react";
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
				<button onClick={() => setSubPage("groups")} className={`${styles.button}`}>
					<GroupIcon className={`${styles.buttonImage}  ${subPage === "groups" ? styles.buttonImageActive : ""}`} />
					<span className={`${subPage === "groups" ? styles.activeText : ""}`}>{t("Groups")}</span>
				</button>
				<button onClick={() => setSubPage("decisions")} className={`${styles.button} ${subPage === "decisions" ? styles.buttonImageActive : ""}`}>
					<GravelIcon className={`${styles.buttonImage} ${subPage === "decisions" ? styles.buttonImageActive : ""}`} />
					<span className={`${subPage === "decisions" ? styles.activeText : ""}`}>{t("Decisions")}</span>
				</button>

			</div>
		</div>
	);
};

export default Footer;