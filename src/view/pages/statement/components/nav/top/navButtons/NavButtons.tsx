import NavigationButtons from '../navigationButtons/NavigationButtons';
import HomeButton from '../../../header/HomeButton';
import { useCallback, useEffect, useState } from 'react';
import MenuOption from '@/view/components/menu/MenuOption';
import Back from '../../../header/Back';
import TriangleIcon from '@/assets/icons/triangle.svg?react';
import QuestionIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';
import View from '@/assets/icons/view.svg?react';
import MapIcon from '@/assets/icons/navMainPageIcon.svg?react';

import styles from '../StatementTopNav.module.scss';
import { StatementType, Statement, Screen } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import NotificationSubscriptionButton from '@/view/components/notifications/NotificationSubscriptionButton';
import ApproveMembers from '@/view/components/approveMemebers/WaitingList';
import useClickOutside from '@/controllers/hooks/useClickOutside';

interface NavButtonsProps {
	parentStatement?: Statement;
	screen: string | undefined;
	handleNavigation: (path: string, screen?: "screen") => void;
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
	const { t } = useUserConfig();
	const [openViews, setOpenViews] = useState(true);

	useEffect(() => {
		setOpenViews(false);
	}, [screen]);

	useEffect(() => {
		if (screen === 'view') {
			setOpenViews(true);
		}
	}, [screen]);

	const handleClickOutside = useCallback(() => {
			if (openViews) setOpenViews(false);
		}, [openViews, setOpenViews]);
		
	const btnRef = useClickOutside(handleClickOutside);

	function handleAgreementMap() {
		handleNavigation(Screen.agreementMap);
	}

	function handleMindMap() {
		handleNavigation(Screen.mindMap);
	}

	function handleView() {
		if (screen === Screen.settings || screen === Screen.chat || screen === Screen.agreementMap || screen === Screen.mindMap) {
			handleNavigation('view');
		} else {
			setOpenViews(!openViews);
		}
	}

	return (
		<>
			{allowNavigation && (
				<NavigationButtons
					statement={parentStatement || statement}
					handleNavigation={handleNavigation}
					headerStyle={headerStyle}
				/>
			)}
			{statement && (
				<NotificationSubscriptionButton
					statementId={statement.statementId}
				/>
			)}
			<ApproveMembers />
			<div
				className={`${styles.views} ${styles.button}`}
				onClick={handleView}
				role='button'
			>
				<NavIcon
					statement={statement}
					screen={screen}
					headerStyle={headerStyle}
				/>
				{openViews && (
					<div ref={(node) => {
						if (btnRef) btnRef.current = node;}} className={styles.views__dropdown}>
						<MenuOption
							label={t('Agreement Map')}
							icon={<TriangleIcon style={{ color: '#4E88C7' }} />}
							onOptionClick={handleAgreementMap}
						/>
						<MenuOption
							label={t('Mind Map')}
							icon={<MapIcon style={{ color: '#4E88C7' }} />}
							onOptionClick={handleMindMap}
						/>
					</div>
				)}
			</div>
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

export default NavButtons;

function NavIcon({
	statement,
	screen,
	headerStyle,
}: {
	readonly statement: Statement;
	readonly screen: string | undefined;
	readonly headerStyle: {
		readonly color: string;
		readonly backgroundColor: string;
	};
}) {
	if (screen === 'view' || screen === undefined) {
		return <View color={headerStyle.color} />;
	} else if (statement.statementType === StatementType.question) {
		return <QuestionIcon color={headerStyle.color} />;
	} else if (statement.statementType === StatementType.group) {
		return <GroupIcon color={headerStyle.color} />;
	} else {
		return <View color={headerStyle.color} />;
	}
}
