import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import DefaultAvatar from '@/assets/images/avatar.jpg';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { RootState } from '@/redux/store';
import { Statement } from 'delib-npm';
import { ComponentProps, FC, ReactNode, useCallback } from 'react';
import { useSelector } from 'react-redux';
import IconButton from '../iconButton/IconButton';
import './Menu.scss';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { Link } from 'react-router';

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
	isNavMenu?: boolean;
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
	isNavMenu = true
}) => {
	const { dir } = useUserConfig();
	const user = useSelector((state: RootState) => state.creator.creator);
	const avatarSrc = user?.photoURL || DefaultAvatar;
	const { backgroundColor } = useStatementColor({ statement });

	const handleClickOutside = useCallback(() => {
		if (isMenuOpen) setIsOpen(false);
	}, [isMenuOpen, setIsOpen]);

	const menuRef = useClickOutside(handleClickOutside);

	return (
		<div ref={(node) => { if (menuRef) menuRef.current = node; }} className='menu'>
			<IconButton onClick={() => setIsOpen(!isMenuOpen)}>
				{isHamburger ? (
					<BurgerIcon style={{ color: iconColor }} />
				) : (
					<EllipsisIcon style={{ color: iconColor }} />
				)}
			</IconButton>

			<div
				className={`menu-content ${dir}${isCardMenu ? '--card-menu' : ''} ${isMenuOpen ? 'open' : ''}`}
			>
				{isNavMenu && <div
					className={`menu-header ${dir}`}
					style={{ backgroundColor }}
				>
					<h2 className='menu-title'>FreeDi</h2>
					<Link to='/my' className='menu-user'>
						<img
							className='menu-avatar'
							src={avatarSrc}
							alt='User avatar'
						/>
						<span className='menu-username'>
							{user?.displayName}
						</span>
					</Link>
				</div>}
				{children}
				{footer && (
					<div
						className='menu-footer'
						onClick={(e) => e.stopPropagation()}
						style={{ backgroundColor }}
					>
						{footer}
					</div>
				)}
				<button
					className='invisibleBackground'
					onClick={() => setIsOpen(false)}
					aria-label='Close menu'
				/>
			</div>
		</div>
	);
};

export default Menu;
