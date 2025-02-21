import { FC, useContext } from 'react';
import { useNavigate, useParams } from 'react-router';
import Back from '../../header/Back';
import HomeButton from '../../header/HomeButton';
import styles from './StatementTopNav.module.scss';
import Chat from '@/assets/icons/chatTop.svg?react';
import DisconnectIcon from '@/assets/icons/disconnectIcon.svg?react';
import MainIcon from '@/assets/icons/evaluations2Icon.svg?react';
import FollowMe from '@/assets/icons/follow.svg?react';
import InvitationIcon from '@/assets/icons/invitation.svg?react';
import SettingsIcon from '@/assets/icons/settings.svg?react';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import View from '@/assets/icons/view.svg?react';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import useStatementColor from '@/controllers/hooks/useStatementColor.ts';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import { StatementContext } from '../../../StatementCont';
import { Statement } from '@/types/statement/Statement';
import { Role } from '@/types/user/UserSettings';

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
	const { t } = useLanguage();
	const navigate = useNavigate();
	const { screen } = useParams();
	const { role } = useContext(StatementContext);
	// const
	const headerStyle = useStatementColor({ statement });
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
						isAdmin={isAdmin}
						menuIconStyle={menuIconStyle}
						t={t}
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

interface NavigationButtonsProps {
	statement?: Statement;
	parentStatement?: Statement;
	screen: string | undefined;
	handleNavigation: (path: string) => void;
	headerStyle: { color: string; backgroundColor: string };
}

function NavigationButtons({
	screen,
	handleNavigation,
	headerStyle,
	statement,
}: Readonly<NavigationButtonsProps>) {
	const { hasChat } = statement?.statementSettings || { hasChat: false };
	if (!hasChat) return null;

	return (
		<>
			{(() => {
				switch (screen) {
					case 'main':
						return (
							<button onClick={() => handleNavigation('chat')}>
								<Chat color={headerStyle.color} />
							</button>
						);
					case 'chat':
					case 'settings':
					default:
						return (
							<button onClick={() => handleNavigation('main')}>
								<MainIcon color={headerStyle.color} />
							</button>
						);
				}
			})()}
		</>
	);
}

interface NavButtonsProps {
	parentStatement?: Statement;
	screen: string | undefined;
	handleNavigation: (path: string) => void;
	headerStyle: { color: string; backgroundColor: string };
	allowNavigation: boolean;
	statement?: Statement;
}

function NavButtons({
	screen,
	handleNavigation,
	headerStyle,
	allowNavigation,
	statement,
	parentStatement,
}: Readonly<NavButtonsProps>) {
	return (
		<>
			{allowNavigation && (
				<NavigationButtons
					statement={parentStatement || statement}
					screen={screen}
					handleNavigation={handleNavigation}
					headerStyle={headerStyle}
				/>
			)}
			<button>
				<View color={headerStyle.color} />
			</button>
			{allowNavigation && (
				<button className={styles.home}>
					<HomeButton headerColor={headerStyle} />
				</button>
			)}
			{allowNavigation && (
				<Back statement={statement} headerColor={headerStyle} />
			)}
		</>
	);
}

function HeaderMenu({
	setIsHeaderMenuOpen,
	isHeaderMenuOpen,
	headerStyle,
	handleShare,
	handleLogout,
	handleFollowMe,
	handleInvitePanel,
	handleNavigation,
	isAdmin,
	menuIconStyle,
	t,
}: Readonly<{
	setIsHeaderMenuOpen: (value: boolean) => void;
	isHeaderMenuOpen: boolean;
	headerStyle: { color: string; backgroundColor: string };
	handleShare: () => void;
	handleLogout: () => void;
	handleFollowMe: () => void;
	handleInvitePanel: () => void;
	handleNavigation: (path: string) => void;
	isAdmin: boolean;
	menuIconStyle: { color: string; width: string };
	t: (key: string) => string;
}>) {
	return (
		<div className={styles.button}>
			<Menu
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
		</div>
	);
}
