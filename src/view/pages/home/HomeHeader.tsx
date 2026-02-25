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
import WaitingList from '@/view/components/approveMembers/WaitingList';
import { usePWAInstallPrompt } from '@/controllers/hooks/usePWAInstallPrompt';
import { logError } from '@/utils/errorHandling';

export default function HomeHeader() {
	const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
	const [showInvitationModal, setShowInvitationModal] = useState(false);
	const [showLanguageModal, setShowLanguageModal] = useState(false);

	const { t, dir, currentLanguage } = useTranslation();
	const { isInstallable, isAppInstalled } = usePWAInstallPrompt();

	const currentLabel = LANGUAGES.find((lang) => lang.code === currentLanguage)?.label ?? 'English';

	// Only show install icon if app is installable AND not already installed
	const showInstallIcon = isInstallable && !isAppInstalled;

	function handlePanel(modal: string) {
		try {
			if (modal === 'invitation') setShowInvitationModal(true);
			else setShowLanguageModal(true);
			setIsHomeMenuOpen(false);
		} catch (error) {
			logError(error, { operation: 'home.HomeHeader.handlePanel' });
		}
	}

	function closeModal() {
		setShowLanguageModal(false);
	}

	function handleOpenInstallPrompt() {
		window.dispatchEvent(new Event('freedi:open-install-prompt'));
	}

	return (
		<div className={`homePage__header ${dir}`}>
			<div className="homePage__header__wrapper">
				<h1 className="homePage__header__wrapper__title">Delib.Org</h1>
				<WaitingList />
				<div className="homePage__header__wrapper__icons">
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
							icon={<LanguagesIcon style={{ color: '#4E88C7' }} />}
							label={currentLabel}
							onOptionClick={() => handlePanel('changeLanguage')}
							children={''}
						/>
						<MenuOption
							icon={<InvitationIcon style={{ color: '#4E88C7' }} />}
							label={t('Join with PIN number')}
							onOptionClick={() => handlePanel('invitation')}
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
