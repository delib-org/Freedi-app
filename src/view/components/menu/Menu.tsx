import { FC, ComponentProps, ReactNode } from 'react';
import IconButton from '../iconButton/IconButton';
import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import './Menu.scss';
import DefaultAvatar from '@/assets/images/avatar.jpg';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { Statement } from 'delib-npm';
import { useLocation } from 'react-router';

interface MenuProps extends ComponentProps<'div'> {
	iconColor: string;
	isMenuOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	isHamburger?: boolean;
	isCardMenu?: boolean;
	footer?: ReactNode;
	statement?: Statement;
	currentPage?: string;
}

// eslint-disable-next-line no-redeclare
interface MenuProps {
	iconColor: string;
	isMenuOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	children: ReactNode;
	isHamburger?: boolean;
	isCardMenu?: boolean;
	footer?: ReactNode;
	statement?: Statement;
}

const Menu: FC<MenuProps> = ({
	iconColor,
	isMenuOpen,
	setIsOpen,
	children,
	isHamburger = false,
	isCardMenu = false,
	footer,
	statement,
}) => {
	const { dir } = useUserConfig();
	const user = useSelector((state: RootState) => state.creator.creator);
	const avatarSrc = user?.photoURL || DefaultAvatar;
	const location = useLocation();
	const { backgroundColor } = useStatementColor({ statement });
	const determineHeaderColor = () => {
		if (location.pathname === '/statement/') {
			return backgroundColor || '#b893e7';
		}

		return backgroundColor || '#5f88e5';
	};

	return (
		<div className="menu">
			<IconButton onClick={() => setIsOpen(!isMenuOpen)}>
				{isHamburger ? (
					<BurgerIcon style={{ color: iconColor }} />
				) : (
					<EllipsisIcon style={{ color: iconColor }} />
				)}
			</IconButton>

			<div className={`menu-content ${dir}${isCardMenu ? '--card-menu' : ''} ${isMenuOpen ? 'open' : ''}`}>
				<div
					className={`menu-header ${dir}`}
					style={{ backgroundColor: determineHeaderColor() }}  // Set dynamic color here
				>
					<h2 className="menu-title">FreeDi</h2>
					<div className="menu-user">
						<img className="menu-avatar" src={avatarSrc} alt="User avatar" />
						<span className="menu-username">{user?.displayName}</span>
					</div>
				</div>
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