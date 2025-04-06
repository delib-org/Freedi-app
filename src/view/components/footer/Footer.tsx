import { FC } from "react";
// icons
import AddIcon from "@/assets/icons/plusIcon.svg?react";
import styles from "./Footer.module.scss";
import IconButton from "../iconButton/IconButton";

interface Props {
	onclick: () => void;
}

const Footer: FC<Props> = ({ onclick }) => {
	return (
		<div className="wrapper">
			<div className={styles.footer} data-cy="add-statement">

				<button onClick={onclick} >
					<AddIcon />
				</button>
				<button>
					Groups
				</button>
				<button>Decisions</button>
			</div>
		</div>
	);
};

export default Footer;