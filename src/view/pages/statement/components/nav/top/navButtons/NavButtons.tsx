import { Screen, Statement } from '@freedi/shared-types';
import { FC } from 'react';

// Components
import ApproveMembers from '@/view/components/approveMemebers/WaitingList';
import NotificationSettingsButton from '@/view/components/notifications/NotificationSettingsButton';
import Back from '../../../header/Back';
import HomeButton from '../../../header/HomeButton';
import ViewsDropdown from '../viewsDropdown/ViewsDropdown';

// Styles
import styles from './NavButtons.module.scss';

interface NavButtonsProps {
	parentStatement?: Statement;
	screen: string | undefined;
	handleNavigation: (path: string, screen?: 'screen') => void;
	headerStyle: { color: string; backgroundColor: string };
	allowNavigation: boolean;
	statement?: Statement;
}

const NavButtons: FC<NavButtonsProps> = ({
	screen,
	handleNavigation,
	headerStyle,
	allowNavigation,
	statement,
}) => {
	const handleNavigateToScreen = (targetScreen: Screen) => {
		handleNavigation(targetScreen);
	};

	return (
		<div className={styles.navRow}>
			{allowNavigation && (
				<div className={styles.padWrap}>
					<HomeButton headerColor={headerStyle} />
				</div>
			)}

			<ApproveMembers />

			{statement && (
				<>
					<ViewsDropdown
						statement={statement}
						screen={screen}
						headerStyle={headerStyle}
						onNavigate={handleNavigateToScreen}
					/>
					<NotificationSettingsButton
						statementId={statement.statementId}
						headerStyle={headerStyle}
					/>
				</>
			)}

			{allowNavigation && (
				<div className={`${styles.back} ${styles.padWrap}`}>
					<Back statement={statement} headerColor={headerStyle} />
				</div>
			)}
		</div>
	);
};

export default NavButtons;
