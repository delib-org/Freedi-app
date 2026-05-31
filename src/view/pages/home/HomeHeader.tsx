// Helpers
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import IconButton from '../../components/iconButton/IconButton';
import Menu from '../../components/menu/Menu';
import MenuOption from '../../components/menu/MenuOption';
import InvitationModal from './main/invitationModal/InvitationModal';
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';
import InstallIcon from '@/assets/icons/installIcon.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logOut } from '@/controllers/db/authenticationUtils';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import LanguagePill from '@/view/components/atomic/atoms/LanguagePill/LanguagePill';
import NotificationBtn from '@/view/components/notificationBtn/NotificationBtn';
import WaitingList from '@/view/components/approveMembers/WaitingList';
import { usePWAInstallPrompt } from '@/controllers/hooks/usePWAInstallPrompt';
import { logError } from '@/utils/errorHandling';
import ProfileAvatar from '@/view/components/atomic/atoms/ProfileAvatar/ProfileAvatar';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { userLevelSelector } from '@/redux/engagement/engagementSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';

const LANGUAGE_HINT_KEY = 'seenLanguageHint';
const LANGUAGE_HINT_TIMEOUT_MS = 5000;

export default function HomeHeader() {
	const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
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
			setIsHomeMenuOpen(false);
		} catch (error) {
			logError(error, { operation: 'home.HomeHeader.handleOpenInvitation' });
		}
	}

	function handleOpenInstallPrompt() {
		window.dispatchEvent(new Event('freedi:open-install-prompt'));
	}

	return (
		<div className={`homePage__header ${dir}`}>
			<div className="homePage__header__wrapper">
				<a href="https://wizcol.com" target="_blank" rel="noopener noreferrer">
					<h1 className="homePage__header__wrapper__title">WizCol.com</h1>
				</a>
				<WaitingList />
				<div className="homePage__header__wrapper__icons">
					<Link to="/my/engagement" aria-label={t('engagement.myImpact')}>
						<ProfileAvatar
							photoURL={creator?.photoURL}
							displayName={creator?.displayName}
							level={level}
						/>
					</Link>

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

					<Menu
						isMenuOpen={isHomeMenuOpen}
						setIsOpen={setIsHomeMenuOpen}
						iconColor="white"
						footer={
							<MenuOption
								className="footer"
								icon={<DisconnectIcon style={{ color: 'white' }} />}
								label={t('Disconnect')}
								onOptionClick={logOut}
								children={''}
							/>
						}
					>
						<MenuOption
							icon={<InvitationIcon style={{ color: '#4E88C7' }} />}
							label={t('Join with PIN number')}
							onOptionClick={handleOpenInvitation}
							children={''}
						/>
					</Menu>

					{showInstallIcon && (
						<IconButton onClick={handleOpenInstallPrompt}>
							<InstallIcon />
						</IconButton>
					)}

					<NotificationBtn />
				</div>
			</div>

			{showInvitationModal && <InvitationModal setShowModal={setShowInvitationModal} />}
		</div>
	);
}
