import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import DefaultAvatar from '@/assets/images/avatar.jpg';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { RootState } from '@/redux/store';
import { Statement } from '@freedi/shared-types';
import { ComponentProps, FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import IconButton from '../iconButton/IconButton';
import styles from './Menu.module.scss';
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
	isChatMenu?: boolean;
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
	isNavMenu = true,
	isChatMenu = false,
}) => {
	const { dir } = useTranslation();
	const user = useSelector((state: RootState) => state.creator.creator);
	const avatarSrc = user?.photoURL || DefaultAvatar;
	const { backgroundColor } = useStatementColor({ statement });

	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [showAbove, setShowAbove] = useState(false);
	const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

	// Simple click outside handler
	useEffect(() => {
		if (!isMenuOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;

			// Check if click is inside menu
			if (menuRef.current?.contains(target)) {
				return;
			}

			// Close menu if clicked outside
			setIsOpen(false);
		};

		// Add event listener
		document.addEventListener('mousedown', handleClickOutside);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isMenuOpen, setIsOpen]);

	// Calculate fixed position for card/chat menus to escape overflow containers
	useEffect(() => {
		// Apply fixed positioning for both card menus and chat menus
		if ((!isChatMenu && !isCardMenu) || !isMenuOpen || !buttonRef.current) return;

		const buttonRect = buttonRef.current.getBoundingClientRect();
		const windowHeight = window.innerHeight;
		const windowWidth = window.innerWidth;
		const buttonCenterY = buttonRect.top + buttonRect.height / 2;

		// If button is in bottom half of screen, show menu above
		const shouldShowAbove = buttonCenterY > windowHeight / 2;
		setShowAbove(shouldShowAbove);

		// Calculate fixed position for menu
		const menuWidth = 280; // Approximate menu width
		let left = buttonRect.left + buttonRect.width / 2 - menuWidth / 2;

		// Keep menu within viewport horizontally
		if (left < 8) left = 8;
		if (left + menuWidth > windowWidth - 8) left = windowWidth - menuWidth - 8;

		let top: number;
		if (shouldShowAbove) {
			// Position above button with some gap
			top = buttonRect.top - 4; // Will use bottom positioning in CSS
		} else {
			// Position below button
			top = buttonRect.bottom + 4;
		}

		setMenuPosition({ top, left });
	}, [isMenuOpen, isChatMenu, isCardMenu]);

	const handleToggle = useCallback(() => {
		setIsOpen(!isMenuOpen);
	}, [isMenuOpen, setIsOpen]);

	return (
		<div ref={menuRef} className={styles.menu} dir={dir}>
			<IconButton
				ref={buttonRef}
				onClick={handleToggle}
				aria-haspopup="menu"
				aria-expanded={isMenuOpen}
			>
				{isHamburger ? (
					<BurgerIcon style={{ color: iconColor }} />
				) : (
					<EllipsisIcon style={{ color: iconColor }} />
				)}
			</IconButton>

			{isMenuOpen && (
				<div
					className={[
						styles.menuContent,
						isCardMenu ? styles.card : '',
						isChatMenu ? styles.chatMenu : '',
						(isChatMenu || isCardMenu) && showAbove ? styles.above : '',
						(isChatMenu || isCardMenu) && menuPosition ? styles.fixed : '',
					].join(' ')}
					role="menu"
					style={
						(isChatMenu || isCardMenu) && menuPosition
							? {
									position: 'fixed',
									left: `${menuPosition.left}px`,
									...(showAbove
										? { bottom: `${window.innerHeight - menuPosition.top}px`, top: 'auto' }
										: { top: `${menuPosition.top}px`, bottom: 'auto' }),
								}
							: undefined
					}
				>
					{isNavMenu && !isCardMenu && (
						<div className={styles.menuHeader} style={{ backgroundColor }}>
							<h2 className={styles.menuTitle}>FreeDi</h2>
							<Link to="/my" className={styles.menuUser}>
								<img className={styles.menuAvatar} src={avatarSrc} alt="User avatar" />
								<span className={styles.menuUsername}>{user?.displayName}</span>
							</Link>
						</div>
					)}

					{children}

					{footer && (
						<div
							className={styles.menuFooter}
							onClick={(e) => e.stopPropagation()}
							style={{ backgroundColor, color: 'white' }}
						>
							{footer}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default Menu;
