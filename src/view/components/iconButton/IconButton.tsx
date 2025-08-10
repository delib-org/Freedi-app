import { ComponentProps, FC } from "react";
import styles from './IconButton.module.scss';

const IconButton: FC<ComponentProps<"button">>  = ({
	className = "action-btn",
	
	...props
}) => {
	return (
		<button
			className={`${styles.iconButton} ${className}`}
			aria-label="Icon button"
			{...props}
		/>
	);
};

export default IconButton;