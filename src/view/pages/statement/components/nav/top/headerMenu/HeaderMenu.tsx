import { FC, useState } from 'react';
import { Statement, Screen } from '@freedi/shared-types';

// Icons
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';
import FollowMe from '@/assets/icons/follow.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import LanguagesIcon from '@/assets/icons/languagesIcon.svg?react';
import SettingsIcon from '@/assets/icons/settings.svg?react';
import TriangleIcon from '@/assets/icons/triangle.svg?react';
import MapIcon from '@/assets/icons/navMainPageIcon.svg?react';

// Components
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import Modal from '@/view/components/modal/Modal';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';

// Styles
import styles from './HeaderMenu.module.scss';

interface HeaderMenuProps {
	statement: Statement;
	isMenuOpen: boolean;
	setIsMenuOpen: (value: boolean) => void;
	headerStyle: { color: string; backgroundColor: string };
	isAdmin: boolean;
	currentLabel: string | undefined;
	t: (key: string) => string;
	onShare: () => void;
	onLogout: () => void;
	onFollowMe: () => void;
	onInvitePanel: () => void;
	onNavigateToSettings: () => void;
	onNavigateToScreen: (screen: Screen) => void;
}

const HeaderMenu: FC<HeaderMenuProps> = ({
	statement,
	isMenuOpen,
	setIsMenuOpen,
	headerStyle,
	isAdmin,
	currentLabel,
	t,
	onShare,
	onLogout,
	onFollowMe,
	onInvitePanel,
	onNavigateToSettings,
	onNavigateToScreen,
}) => {
	const [showLanguageModal, setShowLanguageModal] = useState(false);

	const menuIconStyle = {
		color: headerStyle.backgroundColor,
		width: '24px',
	};

	const menuHeaderStyle = {
		backgroundColor: headerStyle.backgroundColor,
		color: headerStyle.color,
	};

	const handleNavigateToMap = (screen: Screen) => {
		onNavigateToScreen(screen);
		setIsMenuOpen(false);
	};

	return (
		<div className={styles.headerMenu} style={menuHeaderStyle}>
			<Menu
				statement={statement}
				setIsOpen={setIsMenuOpen}
				isMenuOpen={isMenuOpen}
				iconColor={headerStyle.color}
				isHamburger={true}
				footer={
					<div className={styles.menuFooter}>
						<MenuOption
							label={t('Disconnect')}
							icon={<DisconnectIcon />}
							onOptionClick={onLogout}
							style={{ color: 'white' }}
						/>
					</div>
				}
			>
				<MenuOption
					label={t('Share')}
					icon={<ShareIcon style={menuIconStyle} />}
					onOptionClick={onShare}
				/>

				<MenuOption
					label={t('Agreement Map')}
					icon={<TriangleIcon style={menuIconStyle} />}
					onOptionClick={() => handleNavigateToMap(Screen.agreementMap)}
				/>
				<MenuOption
					label={t('Collaboration Index')}
					icon={<TriangleIcon style={menuIconStyle} />}
					onOptionClick={() => handleNavigateToMap(Screen.polarizationIndex)}
				/>
				<MenuOption
					label={t('Mind Map')}
					icon={<MapIcon style={menuIconStyle} />}
					onOptionClick={() => handleNavigateToMap(Screen.mindMap)}
				/>
				{statement.statementSettings?.enableSubQuestionsMap !== false && (
					<MenuOption
						label={t('Statement Map')}
						icon={<MapIcon style={menuIconStyle} />}
						onOptionClick={() => handleNavigateToMap(Screen.subQuestionsMap)}
					/>
				)}

				{!isAdmin && (
					<MenuOption
						label={currentLabel}
						icon={<LanguagesIcon style={menuIconStyle} />}
						onOptionClick={() => {
							setIsMenuOpen(false);
							setShowLanguageModal(true);
						}}
					/>
				)}

				{isAdmin && (
					<>
						<MenuOption
							label={t('Follow Me')}
							icon={<FollowMe style={menuIconStyle} />}
							onOptionClick={onFollowMe}
						/>
						<MenuOption
							label={t('Invite with PIN number')}
							icon={<InvitationIcon style={menuIconStyle} />}
							onOptionClick={onInvitePanel}
						/>
						<MenuOption
							label={currentLabel}
							icon={<LanguagesIcon style={menuIconStyle} />}
							onOptionClick={() => {
								setIsMenuOpen(false);
								setShowLanguageModal(true);
							}}
						/>
						<MenuOption
							label={t('Settings')}
							icon={<SettingsIcon style={menuIconStyle} />}
							onOptionClick={onNavigateToSettings}
						/>
					</>
				)}
			</Menu>

			{showLanguageModal && (
				<Modal>
					<ChangeLanguage
						sameDirMenu={true}
						background
						setShowModal={() => {
							setShowLanguageModal(false);
							setIsMenuOpen(false);
						}}
					/>
				</Modal>
			)}
		</div>
	);
};

export default HeaderMenu;
