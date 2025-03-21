import { ComponentProps, FC } from "react";
import IconButton from "../iconButton/IconButton";
import BurgerIcon from "@/assets/icons/burgerIcon.svg?react";
import EllipsisIcon from "@/assets/icons/ellipsisIcon.svg?react";
import "./Menu.scss";
import { useLanguage } from "@/controllers/hooks/useLanguages";

interface MenuProps extends ComponentProps<"div"> {
	iconColor: string;
	isMenuOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	isHamburger?: boolean;
	isCardMenu?: boolean;
}

const Menu: FC<MenuProps> = ({
	iconColor,
	isMenuOpen,
	setIsOpen,
	children,
	isHamburger = false,
	isCardMenu = false
}) => {
	const { dir } = useLanguage();

	if (!children) {
		return null;
	}

	return (
		<div className="menu">
			<IconButton onClick={() => setIsOpen(!isMenuOpen)}>
				{isHamburger ? <BurgerIcon style={{ color: iconColor }} /> : <EllipsisIcon style={{ color: iconColor }} />}
			</IconButton>

			{isMenuOpen && (
				<div className={`menu-content  ${dir}${isCardMenu ? "--card-menu" : ""}`}>
					{children}
					<button
						className="invisibleBackground"
						onClick={() => setIsOpen(false)}
						aria-label="Close menu"
					/>
				</div>
			)}
		</div>
	);
};

export default Menu;