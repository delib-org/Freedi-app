import BurgerIcon from '@/assets/icons/burgerIcon.svg?react';
import EllipsisIcon from '@/assets/icons/ellipsisIcon.svg?react';
import DefaultAvatar from '@/assets/images/avatar.jpg';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { RootState } from '@/redux/store';
import { Statement } from 'delib-npm';
import {
	ComponentProps,
	FC,
	ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
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
	const { dir } = useUserConfig();
	const user = useSelector((state: RootState) => state.creator.creator);
	const avatarSrc = user?.photoURL || DefaultAvatar;
	const { backgroundColor } = useStatementColor({ statement });

	const menuRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const [showAbove, setShowAbove] = useState(false);

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

	// Detect vertical position for chat menus only
	useEffect(() => {
		if (!isChatMenu || !isMenuOpen || !buttonRef.current) return;

		const buttonRect = buttonRef.current.getBoundingClientRect();
		const windowHeight = window.innerHeight;
		const buttonCenterY = buttonRect.top + buttonRect.height / 2;
		
		// If button is in bottom half of screen, show menu above
		setShowAbove(buttonCenterY > windowHeight / 2);
	}, [isMenuOpen, isChatMenu]);

	const handleToggle = useCallback(() => {
		setIsOpen(!isMenuOpen);
	}, [isMenuOpen, setIsOpen]);

	return (
		<div
			ref={menuRef}
			className={styles.menu}
			dir={dir}
		>
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
						isChatMenu && showAbove ? styles.above : '',
					].join(' ')}
					role="menu"
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
