import { ComponentProps, FC } from "react";
import "./IconButton.scss";

interface IconButtonProps extends ComponentProps<'button'> {
	isSubAction?: boolean;
}

const IconButton: FC<IconButtonProps> = ({
	className = "action-btn",
	...props
}) => {
	return (
		<button
			className={`icon-button  ${className}`}
			aria-label="Icon button"
			{...props}
		/>
	);
};

export default IconButton;