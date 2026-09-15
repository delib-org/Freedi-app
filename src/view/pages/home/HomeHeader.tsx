// Helpers
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import IconButton from '../../components/iconButton/IconButton';
import InstallIcon from '@/assets/icons/installIcon.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import LanguagePill from '@/view/components/atomic/atoms/LanguagePill/LanguagePill';
import NotificationBtn from '@/view/components/notificationBtn/NotificationBtn';
import WaitingList from '@/view/components/approveMembers/WaitingList';
import { usePWAInstallPrompt } from '@/controllers/hooks/usePWAInstallPrompt';
import { logError } from '@/utils/errorHandling';
import ProfileMenu from '@/view/components/profileMenu/ProfileMenu';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { userLevelSelector } from '@/redux/engagement/engagementSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import PinJoinSheet from './pin/PinJoinSheet';
import styles from './HomeHeader.module.scss';

const LANGUAGE_HINT_KEY = 'seenLanguageHint';
const LANGUAGE_HINT_TIMEOUT_MS = 5000;

export default function HomeHeader() {
	const [showInvitationModal, setShowInvitationModal] = useState(false);
	const [showLanguagePopover, setShowLanguagePopover] = useState(false);
	const [showLanguageHint, setShowLanguageHint] = useState(false);

	const { t, dir, currentLanguage } = useTranslation();
	const { isInstallable, isAppInstalled } = usePWAInstallPrompt();
	const level = useAppSelector(userLevelSelector);
	const creator = useAppSelector(creatorSelector);

	const languagePillRef = useRef<HTMLButtonElement>(null);

	// Show one-time pulse hint for first-time users on the authenticated home
	useEffect(() => {
		try {
			if (!localStorage.getItem(LANGUAGE_HINT_KEY)) {
				setShowLanguageHint(true);
				const timer = setTimeout(() => {
					setShowLanguageHint(false);
					localStorage.setItem(LANGUAGE_HINT_KEY, 'true');
				}, LANGUAGE_HINT_TIMEOUT_MS);

				return () => clearTimeout(timer);
			}
		} catch (error) {
			logError(error, { operation: 'home.HomeHeader.languageHint' });
		}
	}, []);

	const showInstallIcon = isInstallable && !isAppInstalled;
	const initial = (creator?.displayName || '').trim().charAt(0).toUpperCase() || '?';

	function dismissLanguageHint() {
		if (showLanguageHint) {
			setShowLanguageHint(false);
			try {
				localStorage.setItem(LANGUAGE_HINT_KEY, 'true');
			} catch (error) {
				logError(error, { operation: 'home.HomeHeader.languageHint' });
			}
		}
	}

	function handleToggleLanguagePopover() {
		dismissLanguageHint();
		setShowLanguagePopover((prev) => !prev);
	}

	function handleOpenInvitation() {
		try {
			setShowInvitationModal(true);
		} catch (error) {
			logError(error, { operation: 'home.HomeHeader.handleOpenInvitation' });
		}
	}

	function handleOpenInstallPrompt() {
		window.dispatchEvent(new Event('freedi:open-install-prompt'));
	}

	return (
		<div className={`homePage__header ${styles.header} ${dir}`}>
			<div className="homePage__header__wrapper">
				<a href="https://wizcol.com" target="_blank" rel="noopener noreferrer">
					<h1 className="homePage__header__wrapper__title">WizCol.com</h1>
				</a>
				<img
					className={styles.header__wordmark}
					src="/brand/wizcol-logo-app.webp"
					alt="WizCol"
					width="360"
					height="240"
				/>
				<WaitingList />
				<div className="homePage__header__wrapper__icons">
					{/* Desktop keeps the account menu and bell; phones use the floating nav. */}
					<span className={styles.header__desktopOnly}>
						<ProfileMenu
							photoURL={creator?.photoURL}
							displayName={creator?.displayName}
							level={level}
							onJoinWithPin={handleOpenInvitation}
						/>
					</span>

					<span className={styles.header__desktopOnly}>
						<NotificationBtn />
					</span>

					<span className="language-pill-anchor">
						<LanguagePill
							ref={languagePillRef}
							currentLanguage={currentLanguage}
							isOpen={showLanguagePopover}
							showPulse={showLanguageHint && !showLanguagePopover}
							hintText={
								showLanguageHint && !showLanguagePopover ? t('Change language here') : undefined
							}
							onClick={handleToggleLanguagePopover}
						/>
						{showLanguagePopover && (
							<ChangeLanguage
								onClose={() => setShowLanguagePopover(false)}
								returnFocusRef={languagePillRef}
								align="end"
							/>
						)}
					</span>

					{showInstallIcon && (
						<IconButton onClick={handleOpenInstallPrompt}>
							<InstallIcon />
						</IconButton>
					)}

					<Link
						to="/my"
						className={styles.header__avatar}
						aria-label={t('Your profile')}
						data-testid="home-header-avatar"
					>
						{initial}
					</Link>
				</div>
			</div>

			<PinJoinSheet isOpen={showInvitationModal} onClose={() => setShowInvitationModal(false)} />
		</div>
	);
}
