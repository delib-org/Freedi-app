import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import DefaultAvatar from '@/assets/images/avatar.jpg';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { RootState } from '@/redux/store';
import { Statement } from 'delib-npm';
import { ComponentProps, FC, ReactNode } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router';
import IconButton from '../iconButton/IconButton';
import './Menu.scss';

interface MenuProps extends ComponentProps<'div'> {
	iconColor: string;
	isMenuOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	isHamburger?: boolean;
	isCardMenu?: boolean;
	footer?: ReactNode;
	statement?: Statement;
	currentPage?: string;
	children: ReactNode;
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

	const determineMenuColor = () => {
		return location.pathname.startsWith('/statement/') ? '#b893e7' : '#5f88e5';
	};

	return (
		<div className="menu"  >
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
					style={{ backgroundColor: backgroundColor || determineMenuColor() }}
				>
					<h2 className="menu-title">FreeDi</h2>
					<div className="menu-user">
						<img className="menu-avatar" src={avatarSrc} alt="User avatar" />
						<span className="menu-username">{user?.displayName}</span>
					</div>
				</div>
				{children}
				{footer && (
					<div
						className="menu-footer"
						onClick={(e) => e.stopPropagation()}
						style={{ backgroundColor: backgroundColor || determineMenuColor() }}
					>
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
