import { ComponentProps, FC, ReactNode } from 'react';
import IconButton from '../iconButton/IconButton';
import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import './Menu.scss';
import DefaultAvatar from '@/assets/images/avatar.jpg';

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
	const user = useSelector((state: RootState) => state.creator.creator);
	const avatarSrc = user?.photoURL || DefaultAvatar;

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
				{/* HEADER STARTS HERE */}
				<div className={`menu-header ${dir}`}>
					<h2 className="menu-title">FreeDi</h2>
					<div className="menu-user">
						<img className="menu-avatar" src={avatarSrc} alt="User avatar" />
						<span className="menu-username">{user?.displayName}</span>
					</div>
				</div>
				{/* HEADER ENDS HERE */}

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
