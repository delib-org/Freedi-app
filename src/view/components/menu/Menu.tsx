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
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { useSelector } from 'react-redux';
import IconButton from '../iconButton/IconButton';
import styles from './Menu.module.scss';
import useClickOutside from '@/controllers/hooks/useClickOutside';
import { Link } from 'react-router';
import { computeMenuPosition, Placement } from '@/utils/computeMenuPosition';

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
	isNavMenu = true,
}) => {
	const { dir } = useUserConfig();
	const user = useSelector((state: RootState) => state.creator.creator);
	const avatarSrc = user?.photoURL || DefaultAvatar;
	const { backgroundColor } = useStatementColor({ statement });

	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRootRef = useRef<HTMLDivElement | null>(null);

	const [coords, setCoords] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
	const [placement, setPlacement] = useState<Placement>('below');

	const handleClickOutside = useCallback(() => {
		if (isMenuOpen) setIsOpen(false);
	}, [isMenuOpen, setIsOpen]);

	const menuRef = useClickOutside(handleClickOutside);

	useEffect(() => {
		if (menuRef && menuRef.current) {
			menuRootRef.current = menuRef.current;
		}
	}, [menuRef]);

	// Listen for close-menu events
	useEffect(() => {
		const handleCloseMenu = () => {
			if (isMenuOpen) {
				setIsOpen(false);
			}
		};

		if (buttonRef.current) {
			buttonRef.current.addEventListener('close-menu', handleCloseMenu);

			return () => {
				if (buttonRef.current) {
					buttonRef.current.removeEventListener('close-menu', handleCloseMenu);
				}
			};
		}
	}, [isMenuOpen, setIsOpen]);

	// Handle clicks outside for card menus
	useEffect(() => {
		if (!isCardMenu || !isMenuOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			
			// Check if clicked on this menu or its button
			if (menuRootRef.current?.contains(target)) {
				return;
			}
			
			// Check if clicked on another menu button
			const clickedMenuButton = target.closest('[aria-haspopup="menu"]');
			if (clickedMenuButton && clickedMenuButton !== buttonRef.current) {
				// Close this menu immediately
				setIsOpen(false);
				// The other menu will open via its own click handler
				return;
			}
			
			// Otherwise, close the menu
			setIsOpen(false);
		};

		// Use capture phase to intercept clicks before they reach other elements
		document.addEventListener('click', handleClickOutside, true);
		
		return () => {
			document.removeEventListener('click', handleClickOutside, true);
		};
	}, [isCardMenu, isMenuOpen, setIsOpen]);

	const handleToggle = useCallback(() => {
		if (!isMenuOpen) {
			// Close any other open menus first
			if (isCardMenu) {
				// Find all open card menus and close them
				const allOpenMenus = document.querySelectorAll('[aria-expanded="true"][aria-haspopup="menu"]');
				allOpenMenus.forEach((menu) => {
					if (menu !== buttonRef.current) {
						// Dispatch close event to the menu
						menu.dispatchEvent(new Event('close-menu', { bubbles: true }));
					}
				});

				const btn = buttonRef.current;
				const root = menuRootRef.current;
				if (btn && root) {
					const menuEl = root.querySelector(`.${styles.menuContent}`) as HTMLElement | null;
					if (menuEl) {
						const rect = btn.getBoundingClientRect();
						const next = computeMenuPosition({ triggerRect: rect, menuEl, dir, skipHiddenMeasure: false });
						setCoords({ top: next.top, left: next.left });
						setPlacement(next.placement);
					}
				}
			}
			setIsOpen(true);
		} else {
			setIsOpen(false);
		}
	}, [isMenuOpen, setIsOpen, dir, isCardMenu]);

	useLayoutEffect(() => {
		if (!isMenuOpen || !isCardMenu) return;
		const onResize = () => {
			const btn = buttonRef.current;
			const root = menuRootRef.current;
			if (!btn || !root) return;
			const menuEl = root.querySelector(`.${styles.menuContent}`) as HTMLElement | null;
			if (!menuEl) return;
			const rect = btn.getBoundingClientRect();
			const next = computeMenuPosition({ triggerRect: rect, menuEl, dir, skipHiddenMeasure: true });
			setCoords({ top: next.top, left: next.left });
			setPlacement(next.placement);
		};
		window.addEventListener('resize', onResize);

		return () => window.removeEventListener('resize', onResize);
	}, [isMenuOpen, isCardMenu, dir]);

	return (
		<div
			ref={(node) => {
				if (menuRef) menuRef.current = node;
				menuRootRef.current = node;
			}}
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


			<div
				className={[
					styles.menuContent,
					isCardMenu ? styles.card : '',
					isMenuOpen ? styles.open : '',
				].join(' ')}
				role="menu"
				data-placement={placement}
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
		</div>
	);
};

export default Menu;
