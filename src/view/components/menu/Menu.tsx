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
import styles from './Menu.module.scss';
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
	const isUnderStatement = statement?.statementId !== undefined;

	const handleClickOutside = useCallback(() => {
		if (isMenuOpen) setIsOpen(false);
	}, [isMenuOpen, setIsOpen]);

	const menuRef = useClickOutside(handleClickOutside);

	const mainClass = isUnderStatement? "": `menuContent--main--${dir}`

	return (
		<div ref={(node) => { if (menuRef) menuRef.current = node; }} className={styles.menu}>
			<IconButton onClick={() => setIsOpen(!isMenuOpen)}>
				{isHamburger ? (
					<BurgerIcon style={{ color: iconColor }} />
				) : (
					<EllipsisIcon style={{ color: iconColor }} />
				)}
			</IconButton>

			<div
				className={`${styles.menuContent} ${styles[mainClass]} ${styles[dir]}${isCardMenu ? styles[`${dir}--card-menu`] : ''} ${isMenuOpen ? styles.open : ''}`}
			>
				{isNavMenu && <div
					className={`${styles.menuHeader} ${styles[dir]}`}
					style={{ backgroundColor }}
				>
					<h2 className={styles.menuTitle}>FreeDi</h2>
					<Link to='/my' className={styles.menuUser}>
						<img
							className={styles.menuAvatar}
							src={avatarSrc}
							alt='User avatar'
						/>
						<span className={styles.menuUsername}>
							{user?.displayName}
						</span>
					</Link>
				</div>}
				{children}
				{footer && (
					<div
						className={styles.menuFooter}
						onClick={(e) => e.stopPropagation()}
						style={{ backgroundColor }}
					>
						{footer}
					</div>
				)}
				<button
					className={styles.invisibleBackground}
					onClick={() => setIsOpen(false)}
					aria-label='Close menu'
				/>
			</div>
		</div>
	);
};

export default Menu;
