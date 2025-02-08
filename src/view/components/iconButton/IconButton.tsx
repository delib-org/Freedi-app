import { ComponentProps, FC } from "react";
import "./IconButton.scss";

interface IconButtonProps extends ComponentProps<'button'> {
	isSubAction?: boolean;
}

const IconButton: FC<IconButtonProps> = ({
	className = "",
	isSubAction = false,
	...props
}) => {
	return (
		<button
			className={`icon-button ${isSubAction ? "action-btn" : ""} ${className}`}
			aria-label="Icon button"
			{...props}
		/>
	);
};

export default IconButton;