// Helpers
import { useEffect, useState } from 'react';
import IconButton from '../../components/iconButton/IconButton';
import Menu from '../../components/menu/Menu';
import MenuOption from '../../components/menu/MenuOption';
import InvitationModal from './main/invitationModal/InvitationModal';
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';
import InstallIcon from '@/assets/icons/installIcon.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { logOut } from '@/controllers/db/authenticationUtils';
import LanguagesIcon from '@/assets/icons/languagesIcon.svg?react';
import Modal from '@/view/components/modal/Modal';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import { LANGUAGES } from '@/constants/Languages';
import MailIcon from '@/assets/icons/mailIcon.svg?react';
import InAppNotifications from '@/view/components/inAppNotifications/InAppNotifications';

export default function HomeHeader() {
	const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
	const [showInvitationModal, setShowInvitationModal] = useState(false);
	const [showLanguageModal, setShowLanguageModal] = useState(false);

	const [showInAppNotifications, setShowInAppNotifications] = useState(false);
	const [isInstallable, setIsInstallable] = useState(false);

	interface BeforeInstallPromptEvent extends Event {
		prompt: () => void;
		userChoice: Promise<{ outcome: string }>;
	}

	const [deferredPrompt, setDeferredPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);

	const { t, dir, currentLanguage } = useUserConfig();

	const currentLabel = LANGUAGES.find(
		(lang) => lang.code === currentLanguage
	).label;

	useEffect(() => {
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			const beforeInstallPromptEvent = e as BeforeInstallPromptEvent;

			// Prevent Chrome 67 and earlier from automatically showing the prompt
			beforeInstallPromptEvent.preventDefault();

			// Stash the event so it can be triggered later
			setDeferredPrompt(beforeInstallPromptEvent);
			setIsInstallable(true);
		});
	}, []);

	function handleInstallApp() {
		try {
			if (deferredPrompt) {
				deferredPrompt.prompt();
				deferredPrompt.userChoice.then(
					(choiceResult: { outcome: string }) => {
						if (choiceResult.outcome === 'accepted') {
							console.info('User accepted the install prompt');
						} else {
							console.info('User dismissed the install prompt');
						}
						setDeferredPrompt(null);
						setIsInstallable(false);
					}
				);
			}
		} catch (error) {
			console.error(error);
		}
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
	function handleShowInAppNotifications() {
		setShowInAppNotifications(!showInAppNotifications);
	}

	return (
		<div className={`homePage__header ${dir}`}>
			<div className='homePage__header__wrapper'>
				<h1 className='homePage__header__wrapper__title'>FreeDi</h1>

				<div className='homePage__header__wrapper__icons'>
					{isInstallable && (
						<IconButton onClick={handleInstallApp}>
							<InstallIcon />
						</IconButton>
					)}
					<button onClick={handleShowInAppNotifications} className='inAppNotifications'>
						<MailIcon />
						{showInAppNotifications && <InAppNotifications />}
					</button>
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

						<MenuOption
							icon={<MailIcon style={{ color: '#4E88C7' }} />}
							label={t('Notifications')}
							onOptionClick={handleShowInAppNotifications}
						>
							{showInAppNotifications && <InAppNotifications />}
						</MenuOption>
					</Menu>
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