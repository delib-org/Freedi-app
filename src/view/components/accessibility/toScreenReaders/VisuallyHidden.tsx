import { FC } from "react";
import styles from "./VisuallyHidden.module.scss";

interface VisuallyHiddenProps {
  labelName: string;
}

const VisuallyHidden: FC<VisuallyHiddenProps> = ({ labelName }) => {
	return (
		<span className={styles.visuallyHidden}>
			{labelName}
		</span>
	);
};

export default VisuallyHidden;
