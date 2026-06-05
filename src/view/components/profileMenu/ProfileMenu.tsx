import { FC, useEffect, useLayoutEffect, useRef, useState, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { EngagementLevel } from '@freedi/shared-types';
import styles from './ProfileMenu.module.scss';
import ProfileAvatar from '@/view/components/atomic/atoms/ProfileAvatar/ProfileAvatar';
import MenuOption from '@/view/components/menu/MenuOption';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logOut } from '@/controllers/db/authenticationUtils';
import { logError } from '@/utils/errorHandling';
import TargetIcon from '@/assets/icons/target.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';

interface ProfileMenuProps {
	photoURL?: string | null;
	displayName?: string;
	level?: EngagementLevel;
	/** Opens the Join-with-PIN invitation modal */
	onJoinWithPin: () => void;
}

const LEVEL_LABEL_KEY: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: 'engagement.observer',
	[EngagementLevel.PARTICIPANT]: 'engagement.participant',
	[EngagementLevel.CONTRIBUTOR]: 'engagement.contributor',
	[EngagementLevel.ADVOCATE]: 'engagement.advocate',
	[EngagementLevel.LEADER]: 'engagement.leader',
};

const ProfileMenu: FC<ProfileMenuProps> = ({
	photoURL,
	displayName,
	level = EngagementLevel.OBSERVER,
	onJoinWithPin,
}) => {
	const { t, dir } = useTranslation();
	const navigate = useNavigate();

	const [isOpen, setIsOpen] = useState(false);
	const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

	const triggerRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	function closeMenu(returnFocus = true) {
		setIsOpen(false);
		if (returnFocus) {
			triggerRef.current?.focus();
		}
	}

	// Position the dropdown with fixed coordinates clamped to the viewport so it
	// always opens into the screen and escapes any overflow/stacking context.
	useLayoutEffect(() => {
		if (!isOpen || !triggerRef.current) {
			setMenuPos(null);

			return;
		}

		function updatePosition() {
			const trigger = triggerRef.current;
			if (!trigger) return;

			const rect = trigger.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const width = Math.min(280, viewportWidth - 16);
			// Align to the trigger's outer edge: right edge in LTR, left edge in RTL.
			let left = dir === 'rtl' ? rect.left : rect.right - width;
			left = Math.max(8, Math.min(left, viewportWidth - width - 8));

			setMenuPos({ top: rect.bottom + 10, left, width });
		}

		updatePosition();
		window.addEventListener('resize', updatePosition);

		return () => window.removeEventListener('resize', updatePosition);
	}, [isOpen, dir]);

	function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			setIsOpen((prev) => !prev);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			setIsOpen(true);
		}
	}

	// Outside-click and Escape dismiss
	useEffect(() => {
		if (!isOpen) return;

		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Node;
			if (menuRef.current?.contains(target)) return;
			setIsOpen(false);
		}

		function handleKeyDown(event: globalThis.KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMenu();
			}
		}

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	function handleMyImpact() {
		closeMenu(false);
		navigate('/my/engagement');
	}

	function handleJoinWithPin() {
		closeMenu(false);
		onJoinWithPin();
	}

	async function handleLogout() {
		try {
			closeMenu(false);
			await logOut();
		} catch (error) {
			logError(error, { operation: 'home.ProfileMenu.handleLogout' });
		}
	}

	return (
		<div ref={menuRef} className={`${styles.menu} ${isOpen ? styles['menu--open'] : ''}`} dir={dir}>
			<button
				ref={triggerRef}
				type="button"
				className={styles.trigger}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-label={t('Account menu')}
				onClick={() => setIsOpen((prev) => !prev)}
				onKeyDown={handleTriggerKeyDown}
			>
				<ProfileAvatar photoURL={photoURL} displayName={displayName} level={level} />
			</button>

			{isOpen && menuPos && (
				<div
					className={styles.menuContent}
					role="menu"
					aria-label={t('Account menu')}
					style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
				>
					<div className={styles.menuHeader}>
						<h2 className={styles.menuTitle}>FreeDi</h2>
						<Link to="/my" className={styles.menuUser} onClick={() => closeMenu(false)}>
							<ProfileAvatar
								photoURL={photoURL}
								displayName={displayName}
								level={level}
								size="medium"
							/>
							<span className={styles.menuUserText}>
								{displayName && <span className={styles.menuUsername}>{displayName}</span>}
								<span className={styles.menuLevel}>{t(LEVEL_LABEL_KEY[level])}</span>
							</span>
						</Link>
					</div>

					<MenuOption
						icon={<TargetIcon />}
						label={t('engagement.myImpact')}
						onOptionClick={handleMyImpact}
						children={''}
					/>
					<MenuOption
						icon={<InvitationIcon />}
						label={t('Join with PIN number')}
						onOptionClick={handleJoinWithPin}
						children={''}
					/>

					<div className={styles.menuFooter}>
						<MenuOption
							icon={<DisconnectIcon style={{ color: 'var(--text-error)' }} />}
							label={t('Disconnect')}
							onOptionClick={handleLogout}
							style={{ color: 'var(--text-error)' }}
							children={''}
						/>
					</div>
				</div>
			)}
		</div>
	);
};

export default ProfileMenu;
