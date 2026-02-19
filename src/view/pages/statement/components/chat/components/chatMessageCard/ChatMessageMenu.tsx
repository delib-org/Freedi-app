import { FC, RefObject } from 'react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import QuestionMarkIcon from '@/assets/icons/questionIcon.svg?react';
import UploadImageIcon from '@/assets/icons/updateIcon.svg?react';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { validateStatementTypeHierarchy } from '@/controllers/general/helpers';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import { Statement, StatementType } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

interface ChatMessageMenuProps {
	statement: Statement;
	parentStatement?: Statement;
	isCardMenuOpen: boolean;
	setIsCardMenuOpen: (isOpen: boolean) => void;
	isAuthorized: boolean;
	setIsEdit: (isEdit: boolean) => void;
	fileInputRef: RefObject<HTMLInputElement>;
}

const ChatMessageMenu: FC<ChatMessageMenuProps> = ({
	statement,
	parentStatement,
	isCardMenuOpen,
	setIsCardMenuOpen,
	isAuthorized,
	setIsEdit,
	fileInputRef,
}) => {
	const { t } = useTranslation();
	const isQuestion = statement.statementType === StatementType.question;
	const isOption = statement.statementType === StatementType.option;

	// Check if we can create/convert to option under the parent statement
	const canCreateOption = parentStatement
		? validateStatementTypeHierarchy(parentStatement, StatementType.option).allowed
		: true;

	async function handleSetOption() {
		try {
			if (statement.statementType === StatementType.option) {
				const cancelOption = window.confirm('Are you sure you want to cancel this option?');
				if (!cancelOption) return;
			}

			const newType =
				statement.statementType === StatementType.option
					? StatementType.statement
					: StatementType.option;

			const result = await changeStatementType(statement, newType, isAuthorized);
			if (!result.success && result.error) {
				alert(result.error);
			}
		} catch (error) {
			logError(error, { operation: 'chatMessageCard.ChatMessageMenu.handleSetOption' });
		}
	}

	return (
		<Menu
			setIsOpen={setIsCardMenuOpen}
			isMenuOpen={isCardMenuOpen}
			iconColor="var(--icon-blue)"
			isCardMenu={true}
			isChatMenu={true}
		>
			{isAuthorized && (
				<MenuOption
					label={t('Edit Text')}
					icon={<EditIcon />}
					onOptionClick={() => {
						setIsEdit(true);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAuthorized && (
				<MenuOption
					label={t('Upload Image')}
					icon={<UploadImageIcon />}
					onOptionClick={() => fileInputRef.current?.click()}
				/>
			)}
			{isAuthorized && canCreateOption && (
				<MenuOption
					isOptionSelected={isOption}
					icon={<LightBulbIcon />}
					label={isOption ? t('Unmark as a Solution') : t('Mark as a Solution')}
					onOptionClick={() => {
						handleSetOption();
						setIsCardMenuOpen(false);
					}}
				/>
			)}

			{!isOption && (
				<MenuOption
					isOptionSelected={isQuestion}
					label={isQuestion ? t('Unmark as a Question') : t('Mark as a Question')}
					icon={<QuestionMarkIcon />}
					onOptionClick={async () => {
						const newType =
							statement.statementType === StatementType.question
								? StatementType.statement
								: StatementType.question;
						const result = await changeStatementType(statement, newType, isAuthorized);
						if (!result.success && result.error) {
							alert(result.error);
						}
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAuthorized && (
				<MenuOption
					label={t('Delete')}
					icon={<DeleteIcon />}
					onOptionClick={() => {
						deleteStatementFromDB(statement, !!isAuthorized, t);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
		</Menu>
	);
};

export default ChatMessageMenu;
