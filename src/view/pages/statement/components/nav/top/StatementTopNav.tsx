import { FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { Role, Screen, Statement } from '@freedi/shared-types';

// Hooks
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import useStatementColor from '@/controllers/hooks/useStatementColor.ts';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';

// Redux
import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';

// Components
import NavButtons from './navButtons/NavButtons';
import HeaderMenu from './headerMenu/HeaderMenu';

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
	const { t, dir, currentLanguage } = useTranslation();
	const { user } = useAuthentication();
	const navigate = useNavigate();
	const { screen } = useParams();
	const role = useSelector(statementSubscriptionSelector(statement?.statementId))?.role;
	const headerStyle = useStatementColor({ statement });
	const topParentStatement = useAppSelector(statementSelector(statement?.topParentId));
	const isFollowMeActive = !!topParentStatement?.followMe && topParentStatement.followMe !== '';

	if (!statement) return null;

	const isAdmin = role === Role.admin || user?.uid === statement?.creatorId;

	function handleNavigation(path: string | Screen) {
		if (!statement?.statementId) return;
		if (Object.values(Screen).includes(path as Screen)) {
			setIsHeaderMenuOpen(false);
			navigate(`/statement-screen/${statement.statementId}/${path}`);

			return;
		}

		navigate(`/statement/${statement.statementId}/${path}`);
		setIsHeaderMenuOpen(false);
	}

	function handleNavigateToSettings() {
		handleNavigation('settings');
	}

	function handleNavigateToScreen(targetScreen: Screen) {
		handleNavigation(targetScreen);
	}

	function handleNavigateToClusterMap() {
		if (!statement?.statementId) return;
		setIsHeaderMenuOpen(false);
		navigate(`/map/${statement.statementId}`);
	}

	return (
		<nav
			className="app-header app-header--sticky"
			dir={dir}
			data-cy="statement-nav"
			style={{ backgroundColor: headerStyle.backgroundColor }}
		>
			<div className="app-header-wrapper">
				{statement && (
					<HeaderMenu
						statement={statement}
						isMenuOpen={isHeaderMenuOpen}
						setIsMenuOpen={setIsHeaderMenuOpen}
						headerStyle={headerStyle}
						isAdmin={isAdmin}
						currentLanguage={currentLanguage}
						t={t}
						onShare={handleShare}
						onLogout={handleLogout}
						onFollowMe={handleFollowMe}
						onInvitePanel={handleInvitePanel}
						onNavigateToSettings={handleNavigateToSettings}
						onNavigateToScreen={handleNavigateToScreen}
						onNavigateToClusterMap={handleNavigateToClusterMap}
						isFollowMeActive={isFollowMeActive}
					/>
				)}
				<NavButtons
					statement={statement}
					parentStatement={parentStatement}
					screen={screen}
					headerStyle={headerStyle}
					allowNavigation={true}
				/>
			</div>
		</nav>
	);
};

export default StatementTopNav;
