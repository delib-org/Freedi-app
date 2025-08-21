import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import DefaultAvatar from '@/assets/images/avatar.jpg';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { RootState } from '@/redux/store';
import { Statement } from 'delib-npm';
import { ComponentProps, FC, ReactNode, useCallback, useRef, useEffect, useState } from 'react';
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
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [menuPosition, setMenuPosition] = useState<'above' | 'below'>('below');

	const handleClickOutside = useCallback(() => {
		if (isMenuOpen) setIsOpen(false);
	}, [isMenuOpen, setIsOpen]);

	const menuRef = useClickOutside(handleClickOutside);

	// Calculate menu position when it opens
	useEffect(() => {
		if (isMenuOpen && isCardMenu) {
			// Small delay to ensure DOM is ready
			const timer = setTimeout(() => {
				if (buttonRef.current) {
					const buttonRect = buttonRef.current.getBoundingClientRect();
					const viewportHeight = window.innerHeight;
					const buttonCenterY = buttonRect.top + buttonRect.height / 2;
					
					// Find the chat message box (parent with messageBox class)
					const messageBox = buttonRef.current.closest('[class*="messageBox"]');
					
					if (messageBox) {
						const messageBoxRect = messageBox.getBoundingClientRect();
						const menuElement = menuRef.current?.querySelector('[class*="menuContent"]') as HTMLElement;
						
						if (menuElement) {
							// Calculate horizontal center position relative to message box
							const messageBoxCenter = messageBoxRect.left + (messageBoxRect.width / 2);
							const menuWidth = 250; // Default menu width
							const leftPosition = messageBoxCenter - (menuWidth / 2);
							
							// Set the position directly for horizontal centering
							menuElement.style.left = `${leftPosition}px`;
							
							// Set vertical position based on button position
							if (buttonCenterY > viewportHeight / 2) {
								// Open above
								menuElement.style.bottom = `${viewportHeight - buttonRect.top + 10}px`;
								menuElement.style.top = 'auto';
							} else {
								// Open below
								menuElement.style.top = `${buttonRect.bottom + 10}px`;
								menuElement.style.bottom = 'auto';
							}
						}
					}
					
					// If button is in the lower half of viewport, open menu above
					if (buttonCenterY > viewportHeight / 2) {
						setMenuPosition('above');
					} else {
						setMenuPosition('below');
					}
				}
			}, 10);
			
			return () => clearTimeout(timer);
		}
	}, [isMenuOpen, isCardMenu]);

	const mainClass = isUnderStatement? "": `menuContent--main--${dir}`

	return (
		<div ref={(node) => { if (menuRef) menuRef.current = node; }} className={styles.menu}>
			<IconButton ref={buttonRef} onClick={() => setIsOpen(!isMenuOpen)}>
				{isHamburger ? (
					<BurgerIcon style={{ color: iconColor }} />
				) : (
					<EllipsisIcon style={{ color: iconColor }} />
				)}
			</IconButton>
			
			{isMenuOpen && (
				<button
					className={styles.invisibleBackground}
					onClick={() => setIsOpen(false)}
					aria-label='Close menu'
				/>
			)}

			<div
				className={`${styles.menuContent} ${styles[mainClass]} ${styles[dir]}${isCardMenu ? styles[`${dir}--card-menu`] : ''} ${isMenuOpen ? styles.open : ''} ${isCardMenu ? styles[`position--${menuPosition}`] : ''}`}
			>
				{isNavMenu && !isCardMenu && <div
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
			</div>
		</div>
	);
};

export default Menu;
