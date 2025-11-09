// Helpers
import { useState } from 'react';
import IconButton from '../../components/iconButton/IconButton';
import Menu from '../../components/menu/Menu';
import MenuOption from '../../components/menu/MenuOption';
import InvitationModal from './main/invitationModal/InvitationModal';
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';
import InstallIcon from '@/assets/icons/installIcon.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { logOut } from '@/controllers/db/authenticationUtils';
import LanguagesIcon from '@/assets/icons/languagesIcon.svg?react';
import Modal from '@/view/components/modal/Modal';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import { LANGUAGES } from '@/constants/Languages';
import NotificationBtn from '@/view/components/notificationBtn/NotificationBtn';
import WaitingList from '@/view/components/approveMemebers/WaitingList';
import { usePWAInstallPrompt } from '@/hooks/usePWAInstallPrompt';

export default function HomeHeader() {
	const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
	const [showInvitationModal, setShowInvitationModal] = useState(false);
	const [showLanguageModal, setShowLanguageModal] = useState(false);

	const { t, dir, currentLanguage } = useTranslation();
	const { isInstallable, isAppInstalled, handleInstall } = usePWAInstallPrompt();

	const currentLabel = LANGUAGES.find(
		(lang) => lang.code === currentLanguage
	).label;

	// Always show install icon if app is not installed, even if beforeinstallprompt hasn't fired
	// This allows users to see the icon in development/testing
	const showInstallIcon = !isAppInstalled;

	// Debug logging for install icon visibility
	console.info('[HomeHeader] Install icon state:', {
		isInstallable,
		isAppInstalled,
		showInstallIcon,
	});

	function handleInstallClick() {
		if (!isInstallable) {
			// If beforeinstallprompt hasn't fired, show helpful message
			console.info('[HomeHeader] Install not available - beforeinstallprompt event not fired');
			alert('Install is not available. This browser may not support PWA installation, or the app is already installed.');
			return;
		}
		// Use the hook's handleInstall if available
		handleInstall();
	}

	function handlePanel(modal: string) {
		try {
			if (modal === 'invitation') setShowInvitationModal(true);
			else setShowLanguageModal(true);
			setIsHomeMenuOpen(false);
		} catch (error) {
			console.error(error);
		}
	}

	function closeModal() {
		setShowLanguageModal(false);
	}

	return (
		<div className={`homePage__header ${dir}`}>
			<div className='homePage__header__wrapper'>
				<h1 className='homePage__header__wrapper__title'>Delib.Org</h1>
				<WaitingList />
				<div className='homePage__header__wrapper__icons'>
					<Menu
						isMenuOpen={isHomeMenuOpen}
						setIsOpen={setIsHomeMenuOpen}
						iconColor="white"
						footer={
							<MenuOption
								className="footer"
								icon={<DisconnectIcon style={{ color: 'white' }} />}
								label={t('Disconnect')}
								onOptionClick={logOut} children={''} />
						}
					>

						<MenuOption
							icon={<LanguagesIcon style={{ color: '#4E88C7' }} />}
							label={currentLabel}
							onOptionClick={() => handlePanel('changeLanguage')} children={''} />
						<MenuOption
							icon={<InvitationIcon style={{ color: '#4E88C7' }} />}
							label={t('Join with PIN number')}
							onOptionClick={() => handlePanel('invitation')} children={''} />
					</Menu>

					{showInstallIcon && (
						<IconButton onClick={handleInstallClick}>
							<InstallIcon />
						</IconButton>
					)}

					<NotificationBtn />
				</div>
			</div>

			{showInvitationModal && (
				<InvitationModal setShowModal={setShowInvitationModal} />
			)}
			{showLanguageModal && (
				<Modal closeModal={closeModal}>
					<ChangeLanguage
						background
						setShowMenu={setIsHomeMenuOpen}
						setShowModal={setShowLanguageModal}
					/>
				</Modal>
			)}
		</div>
	);
}