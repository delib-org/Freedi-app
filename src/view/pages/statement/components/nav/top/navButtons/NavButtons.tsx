import { Statement } from "@/types/statement/StatementTypes";
import NavigationButtons from "../navigationButtons/NavigationButtons";
import HomeButton from '../../../header/HomeButton';
import { useEffect, useState } from "react";
import { useLanguage } from "@/controllers/hooks/useLanguages";
import MenuOption from "@/view/components/menu/MenuOption";
import Back from "../../../header/Back";
import TriangleIcon from '@/assets/icons/triangle.svg?react';
import QuestionIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';
import View from '@/assets/icons/view.svg?react';
import MapIcon from '@/assets/icons/navMainPageIcon.svg?react';

import styles from '../StatementTopNav.module.scss';
import { StatementType } from "@/types/TypeEnums";

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

	const { t } = useLanguage();
	const [openViews, setOpenViews] = useState(true);

	useEffect(() => {
		setOpenViews(false);
	}, [screen])

	function handleAgreementMap() {
		handleNavigation('agreement-map');

	}

	function handleMindMap() {
		handleNavigation('mind-map');
	}

	function handleView() {

		if (screen !== 'view' || screen === undefined) {
			handleNavigation('view');
		} else {
			setOpenViews(!openViews)
		}

	}

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
			<button className={styles.views} onClick={handleView}>
				<NavIcon statement={statement} screen={screen} headerStyle={headerStyle} />
				{openViews &&
					<div className={styles.views__dropdown}>
						<MenuOption
							label={t("Agreement Map")}
							icon={<TriangleIcon style={{ color: '#4E88C7' }} />}
							onOptionClick={handleAgreementMap}
						/>
						<MenuOption
							label={t("Mind Map")}
							icon={<MapIcon style={{ color: '#4E88C7' }} />}
							onOptionClick={handleMindMap}
						/>
					</div>}

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

export default NavButtons;

function NavIcon({ statement, screen, headerStyle }: { readonly statement: Statement; readonly screen: string | undefined; readonly headerStyle: { readonly color: string; readonly backgroundColor: string } }) {

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