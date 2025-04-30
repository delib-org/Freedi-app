import { FC, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import styles from './StatementTopNav.module.scss';
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';
import FollowMe from '@/assets/icons/follow.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import SettingsIcon from '@/assets/icons/settings.svg?react';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import { LANGUAGES } from '@/constants/Languages';
import useStatementColor from '@/controllers/hooks/useStatementColor.ts';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import Modal from '@/view/components/modal/Modal';
import { Role, Statement } from 'delib-npm';
import NavButtons from './navButtons/NavButtons';
import { useSelector } from 'react-redux';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import LanguagesIcon from '@/assets/icons/languagesIcon.svg?react';

interface Props {
	statement?: Statement;
	parentStatement?: Statement;
	handleShare: () => void;
	handleFollowMe: () => void;
	handleInvitePanel: () => void;
	handleLogout: () => void;
	setIsHeaderMenuOpen: (value: boolean) => void;
	isHeaderMenuOpen: boolean;
};

const StatementTopNav: FC<Props> = ({
	statement,
	parentStatement,
	setIsHeaderMenuOpen,
	handleLogout,
	handleFollowMe,
	handleInvitePanel,
	isHeaderMenuOpen,
	handleShare,
}) => {

	const { t, currentLanguage } = useUserConfig();
	const navigate = useNavigate();
	const { screen } = useParams();
	const role = useSelector(statementSubscriptionSelector(statement?.topParentId))?.role;
	const headerStyle = useStatementColor({ statement });
	const [showLanguageModal, setShowLanguageModal] = useState(false);

	const menuIconStyle = {
		color: headerStyle.backgroundColor,
		width: '24px',
	};

	if (!statement) return null;

	const _statement = parentStatement || statement;

	const enableNavigationalElements = Boolean(
		_statement?.statementSettings?.enableNavigationalElements
	);

	const isAdmin = role === Role.admin;
	const allowNavigation = enableNavigationalElements || isAdmin;

	function handleNavigation(path: string, screen?: "screen") {
		if (!statement?.statementId) return;
		if (path === 'settings' || screen === "screen") {
			setIsHeaderMenuOpen(false);
			navigate(`/statement-screen/${statement.statementId}/${path}`);

			return;
		}

		navigate(`/statement/${statement.statementId}/${path}`);
		setIsHeaderMenuOpen(false);
	}

	function closeOpenModal() {
		setShowLanguageModal(!showLanguageModal);
	}
	const currentLabel = LANGUAGES.find(
		(lang) => lang.code === currentLanguage
	)?.label;

	return (
		<nav
			className={`${styles.nav} ${currentLanguage === 'he' ? styles.rtl : styles.ltr}`}
			data-cy='statement-nav'
			style={{ backgroundColor: headerStyle.backgroundColor }}
		>
			<div className={`${styles.wrapper} ${currentLanguage === 'he' ? styles.rtl : styles.ltr}`}>
				{allowNavigation && statement && (
					<HeaderMenu
						setIsHeaderMenuOpen={setIsHeaderMenuOpen}
						isHeaderMenuOpen={isHeaderMenuOpen}
						headerStyle={headerStyle}
						handleShare={handleShare}
						handleLogout={handleLogout}
						handleFollowMe={handleFollowMe}
						handleInvitePanel={handleInvitePanel}
						handleNavigation={handleNavigation}
						setShowLanguageModal={closeOpenModal}
						showLanguageModal={showLanguageModal}
						isAdmin={isAdmin}
						menuIconStyle={menuIconStyle}
						t={t}
						currentLabel={currentLabel}
						statement={statement}
					/>
				)}
				<NavButtons
					statement={statement}
					parentStatement={parentStatement}
					screen={screen}
					handleNavigation={handleNavigation}
					headerStyle={headerStyle}
					allowNavigation={allowNavigation}
				/>
			</div>
		</nav>
	);
};

export default StatementTopNav;

function HeaderMenu({
	setIsHeaderMenuOpen,
	isHeaderMenuOpen,
	headerStyle,
	handleShare,
	handleLogout,
	handleFollowMe,
	handleInvitePanel,
	handleNavigation,
	setShowLanguageModal,
	showLanguageModal,
	isAdmin,
	menuIconStyle,
	t,
	currentLabel,
	statement,
}: Readonly<{
	statement: Statement;
	setIsHeaderMenuOpen: (value: boolean) => void;
	isHeaderMenuOpen: boolean;
	headerStyle: { color: string; backgroundColor: string };
	setShowLanguageModal: () => void;
	handleShare: () => void;
	handleLogout: () => void;
	handleFollowMe: () => void;
	handleInvitePanel: () => void;
	handleNavigation: (path: string) => void;
	showLanguageModal: boolean;
	isAdmin: boolean;
	menuIconStyle: { color: string; width: string };
	t: (key: string) => string;
	currentLabel: string | undefined;
}>) {
	// Apply dynamic style to the menu-header
	const menuHeaderStyle = {
		backgroundColor: headerStyle.backgroundColor,
		color: headerStyle.color
	};

	return (
		<div className={styles.button} style={menuHeaderStyle}>
			<Menu
				statement={statement}
				setIsOpen={setIsHeaderMenuOpen}
				isMenuOpen={isHeaderMenuOpen}
				iconColor={headerStyle.color}
				isHamburger={true}
			>
				<MenuOption
					label={t('Share')}
					icon={<ShareIcon style={menuIconStyle} />}
					onOptionClick={handleShare} />
				{!isAdmin && <MenuOption
					label={currentLabel}
					icon={<LanguagesIcon style={menuIconStyle} />}
					onOptionClick={setShowLanguageModal} />}

				{isAdmin && (
					<>
						<MenuOption
							label={t('Follow Me')}
							icon={<FollowMe style={menuIconStyle} />}
							onOptionClick={handleFollowMe} />
						<MenuOption
							label={t('Invite with PIN number')}
							icon={<InvitationIcon style={menuIconStyle} />}
							onOptionClick={handleInvitePanel} />
						<MenuOption
							label={currentLabel}
							icon={<LanguagesIcon style={menuIconStyle} />}
							onOptionClick={setShowLanguageModal} />
						<MenuOption
							label={t('Settings')}
							icon={<SettingsIcon style={menuIconStyle} />}
							onOptionClick={() => handleNavigation('settings')} />

					</>
				)}

				{/* Footer Section */}
				<div className={`${styles.menuFooter}`}>
					<MenuOption
						label={t('Disconnect')}
						icon={<DisconnectIcon />}
						onOptionClick={handleLogout}
						style={{ color: 'white' }}
					/>
				</div>
			</Menu>
			{showLanguageModal && (
				<Modal>
					<ChangeLanguage
						sameDirMenu={true}
						background
						setShowModal={setShowLanguageModal}
					/>
				</Modal>
			)}
		</div>
	);
}
