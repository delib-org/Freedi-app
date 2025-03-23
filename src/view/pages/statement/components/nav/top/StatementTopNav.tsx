import { FC, useContext, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import styles from './StatementTopNav.module.scss';

import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';

import FollowMe from '@/assets/icons/follow.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import SettingsIcon from '@/assets/icons/settings.svg?react';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import useStatementColor from '@/controllers/hooks/useStatementColor.ts';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import { StatementContext } from '../../../StatementCont';
import { Statement, Role } from 'delib-npm';
import NavButtons from './navButtons/NavButtons';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { LANGUAGES } from '@/constants/Languages';
import LanguagesIcon from '@/assets/icons/languagesIcon.svg?react';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import Modal from '@/view/components/modal/Modal';

interface Props {
	statement?: Statement;
	parentStatement?: Statement;
	handleShare: () => void;
	handleFollowMe: () => void;
	handleInvitePanel: () => void;
	handleLogout: () => void;
	setIsHeaderMenuOpen: (value: boolean) => void;
	isHeaderMenuOpen: boolean;
}

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
	//hooks
	const { t, currentLanguage } = useUserConfig();
	const navigate = useNavigate();
	const { screen } = useParams();
	const { role } = useContext(StatementContext);
	const headerStyle = useStatementColor({ statement });
	const [showLanguageModal, setShowLanguageModal] = useState(false);

	// const
	
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

	function handleNavigation(path: string) {
		if (path === 'settings') setIsHeaderMenuOpen(false);
		if (statement?.statementId)
			navigate(`/statement/${statement.statementId}/${path}`);
	}

	function closeOpenModal() {
		setShowLanguageModal(!showLanguageModal);
	}
	const currentLabel = LANGUAGES.find(
		(lang) => lang.code === currentLanguage
	).label;

	return (
		<nav
			className={styles.nav}
			data-cy='statement-nav'
			style={{ backgroundColor: headerStyle.backgroundColor }}
		>
			<div className={styles.wrapper}>
				{allowNavigation && (
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
}: Readonly<{
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
	currentLabel: string;
}>) {
	return (
		<div className={styles.button}>
			<Menu
				sameDirMenu={true}
				setIsOpen={setIsHeaderMenuOpen}
				isMenuOpen={isHeaderMenuOpen}
				iconColor={headerStyle.color}
				isHamburger={true}
			>
				<MenuOption
					label={t('Share')}
					icon={<ShareIcon style={menuIconStyle} />}
					onOptionClick={handleShare}
				/>
				<MenuOption
					label={currentLabel}
					icon={<LanguagesIcon style={menuIconStyle} />}
					onOptionClick={setShowLanguageModal}
				/>
				<MenuOption
					label={t('Disconnect')}
					icon={<DisconnectIcon style={menuIconStyle} />}
					onOptionClick={handleLogout}
				/>
				{isAdmin && (
					<>
						<MenuOption
							label={t('Follow Me')}
							icon={<FollowMe style={menuIconStyle} />}
							onOptionClick={handleFollowMe}
						/>
						<MenuOption
							label={t('Invite with PIN number')}
							icon={<InvitationIcon style={menuIconStyle} />}
							onOptionClick={handleInvitePanel}
						/>

						<MenuOption
							label={t('Settings')}
							icon={<SettingsIcon style={menuIconStyle} />}
							onOptionClick={() => handleNavigation('settings')}
						/>
					</>
				)}
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
