import { ComponentProps, FC, ReactNode } from "react";
import "./MenuOption.scss";

interface MenuOptionProps extends ComponentProps<"button"> {
	onOptionClick: () => void;
	label: string;
	isOptionSelected?: boolean;
	icon: ReactNode;
}

const MenuOption: FC<MenuOptionProps> = ({
	onOptionClick,
	label,
	isOptionSelected = false,
	icon,
}) => {
	return (
		<div
			className={`menu-option ${isOptionSelected ? "selected" : ""}`}
			onClick={onOptionClick}
			role="button"
			tabIndex={0}
			onKeyPress={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					onOptionClick();
				}
			}}
		>
			{icon}
			<div className="label">{label}</div>
		</div>
	);
};

export default MenuOption;
