import { FC, useEffect } from 'react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import QuestionMarkIcon from '@/assets/icons/questionIcon.svg?react';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { updateIsQuestion } from '@/controllers/db/statements/setStatements';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import { Statement } from '@/types/statement/Statement';
import { StatementType } from '@/types/TypeEnums';

interface Props {
	statement: Statement;
	isAuthorized: boolean;
	isCardMenuOpen: boolean;
	setIsCardMenuOpen: (isOpen: boolean) => void;
	isEdit: boolean;
	setIsEdit: (isEdit: boolean) => void;
	handleSetOption: () => void;
}

const SolutionMenu: FC<Props> = ({
	statement,
	isAuthorized,
	isCardMenuOpen,
	setIsCardMenuOpen,
	isEdit,
	setIsEdit,
	handleSetOption,
}) => {
	const { t } = useLanguage();

	const isOption = statement.statementType === StatementType.option;
	const isResearch = statement.statementType === StatementType.question;

	useEffect(() => {
		if (isCardMenuOpen) {
			const timer = setTimeout(() => {
				setIsCardMenuOpen(false);
			}, 35000);

			return () => clearTimeout(timer);
		}
	}, [isCardMenuOpen]);

	if (!isAuthorized) return null;

	return (
		<Menu
			setIsOpen={setIsCardMenuOpen}
			isMenuOpen={isCardMenuOpen}
			iconColor='#5899E0'
			isCardMenu={true}
		>
			{isAuthorized && (
				<MenuOption
					label={t('Edit Text')}
					icon={<EditIcon />}
					onOptionClick={() => {
						setIsEdit(!isEdit);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAuthorized && (
				<MenuOption
					isOptionSelected={isOption}
					icon={<LightBulbIcon />}
					label={
						isOption
							? t('Unmark as a Solution')
							: t('Mark as a Solution')
					}
					onOptionClick={() => {
						handleSetOption();
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAuthorized && (
				<MenuOption
					isOptionSelected={isResearch}
					icon={<QuestionMarkIcon />}
					label={
						isResearch
							? t('Unmark as a Question')
							: t('Mark as a Question')
					}
					onOptionClick={() => {
						updateIsQuestion(statement);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAuthorized && (
				<MenuOption
					label={t('Delete')}
					icon={<DeleteIcon />}
					onOptionClick={() => {
						deleteStatementFromDB(statement, isAuthorized);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
		</Menu>
	);
};

export default SolutionMenu;
