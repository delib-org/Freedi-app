import { FC, useState, useEffect, useCallback } from 'react';
import { Statement, StatementType, Screen } from '@freedi/shared-types';

// Hooks
import { useTranslation } from '@/controllers/hooks/useTranslation';
import useClickOutside from '@/controllers/hooks/useClickOutside';

// Icons
import TriangleIcon from '@/assets/icons/triangle.svg?react';
import QuestionIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import GroupIcon from '@/assets/icons/group.svg?react';
import View from '@/assets/icons/view.svg?react';
import MapIcon from '@/assets/icons/navMainPageIcon.svg?react';

// Components
import MenuOption from '@/view/components/menu/MenuOption';

// Styles
import styles from './ViewsDropdown.module.scss';

interface ViewsDropdownProps {
	statement: Statement;
	screen: string | undefined;
	headerStyle: { color: string; backgroundColor: string };
	onNavigate: (screen: Screen) => void;
}

const ViewsDropdown: FC<ViewsDropdownProps> = ({ statement, screen, headerStyle, onNavigate }) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		setIsOpen(false);
	}, [screen]);

	useEffect(() => {
		if (screen === 'view') {
			setIsOpen(true);
		}
	}, [screen]);

	const handleClickOutside = useCallback(() => {
		if (isOpen) setIsOpen(false);
	}, [isOpen]);

	const dropdownRef = useClickOutside(handleClickOutside);

	const handleToggle = () => {
		if (
			screen === Screen.settings ||
			screen === Screen.chat ||
			screen === Screen.agreementMap ||
			screen === Screen.mindMap ||
			screen === Screen.polarizationIndex ||
			screen === Screen.subQuestionsMap
		) {
			onNavigate('view' as Screen);
		} else {
			setIsOpen(!isOpen);
		}
	};

	const handleOptionClick = (targetScreen: Screen) => {
		onNavigate(targetScreen);
		setIsOpen(false);
	};

	return (
		<div className={styles.viewsDropdown}>
			<button
				className={styles.viewsDropdown__trigger}
				onClick={handleToggle}
				aria-label={t('View options')}
			>
				<NavIcon statement={statement} screen={screen} headerStyle={headerStyle} />
			</button>

			{isOpen && (
				<div
					ref={(node) => {
						if (dropdownRef) dropdownRef.current = node;
					}}
					className={styles.viewsDropdown__menu}
				>
					<MenuOption
						label={t('Agreement Map')}
						icon={<TriangleIcon style={{ color: '#4E88C7' }} />}
						onOptionClick={() => handleOptionClick(Screen.agreementMap)}
					/>
					<MenuOption
						label={t('Collaboration Index')}
						icon={<TriangleIcon style={{ color: '#4E88C7' }} />}
						onOptionClick={() => handleOptionClick(Screen.polarizationIndex)}
					/>
					<MenuOption
						label={t('Mind Map')}
						icon={<MapIcon style={{ color: '#4E88C7' }} />}
						onOptionClick={() => handleOptionClick(Screen.mindMap)}
					/>
					{statement.statementSettings?.enableSubQuestionsMap !== false && (
						<MenuOption
							label={t('Statement Map')}
							icon={<MapIcon style={{ color: '#4E88C7' }} />}
							onOptionClick={() => handleOptionClick(Screen.subQuestionsMap)}
						/>
					)}
				</div>
			)}
		</div>
	);
};

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

export default ViewsDropdown;
