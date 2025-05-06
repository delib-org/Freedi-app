import { ComponentProps, FC, ReactNode } from "react";
import "./MenuOption.scss";

interface MenuOptionProps extends ComponentProps<"button"> {
	onOptionClick: () => void;
	label: string;
	isOptionSelected?: boolean;
	icon: ReactNode;
	children?: ReactNode;
}

const MenuOption: FC<MenuOptionProps> = ({
	onOptionClick,
	label,
	isOptionSelected = false,
	icon,
	style,
	children,
}) => {
	return (
		<button
			className={`menu-option ${isOptionSelected ? "selected" : ""}`}
			onClick={onOptionClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					onOptionClick();
				}
			}}
		>
			{icon}
			<div className="label" style={style}>{label}</div>
			{children}
		</button>
	);
};

export default MenuOption;
