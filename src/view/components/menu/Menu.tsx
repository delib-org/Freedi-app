import { ComponentProps, FC, ReactNode } from 'react';
import IconButton from '../iconButton/IconButton';
import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import './Menu.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface MenuProps extends ComponentProps<'div'> {
	iconColor: string;
	isMenuOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	isHamburger?: boolean;
	isCardMenu?: boolean;
	footer?: ReactNode;
}

const Menu: FC<MenuProps> = ({
	iconColor,
	isMenuOpen,
	setIsOpen,
	children,
	isHamburger = false,
	isCardMenu = false,
	footer,
}) => {
	const { dir } = useUserConfig();

	if (!children) {
		return null;
	}

	return (
		<div className='menu'>
			<IconButton onClick={() => setIsOpen(!isMenuOpen)}>
				{isHamburger ? (
					<BurgerIcon style={{ color: iconColor }} />
				) : (
					<EllipsisIcon style={{ color: iconColor }} />
				)}
			</IconButton>

			<div className={`menu-content ${dir}${isCardMenu ? '--card-menu' : ''} ${isMenuOpen ? 'open' : ''}`}>
				{children}
				{footer && (
					<div className="menu-footer" onClick={(e) => e.stopPropagation()}>
						{footer}
					</div>
				)}
				<button
					className="invisibleBackground"
					onClick={() => setIsOpen(false)}
					aria-label="Close menu"
				/>
			</div>
		</div>
	);
};

export default Menu;
