import { Statement } from '@freedi/shared-types';
import { FC } from 'react';

// Components
import ApproveMembers from '@/view/components/approveMembers/WaitingList';
import NotificationSettingsButton from '@/view/components/notifications/NotificationSettingsButton';
import NotificationBtn from '@/view/components/notificationBtn/NotificationBtn';
import Back from '../../../header/Back';
import HomeButton from '../../../header/HomeButton';

// Styles
import styles from './NavButtons.module.scss';

interface NavButtonsProps {
	parentStatement?: Statement;
	screen: string | undefined;
	headerStyle: { color: string; backgroundColor: string };
	allowNavigation: boolean;
	statement?: Statement;
}

const NavButtons: FC<NavButtonsProps> = ({ headerStyle, allowNavigation, statement }) => {
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
					<NotificationBtn />
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
