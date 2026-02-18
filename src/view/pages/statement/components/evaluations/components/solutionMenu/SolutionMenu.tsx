import { FC, useEffect } from 'react';
import DeleteIcon from '@/assets/icons/delete.svg?react';
import DocumentIcon from '@/assets/icons/document.svg?react';
import EditIcon from '@/assets/icons/editIcon.svg?react';
import EyeIcon from '@/assets/icons/eye.svg?react';
import EyeCrossIcon from '@/assets/icons/eyeCross.svg?react';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import QuestionMarkIcon from '@/assets/icons/questionIcon.svg?react';
import NetworkIcon from '@/assets/icons/networkIcon.svg?react';
import { deleteStatementFromDB } from '@/controllers/db/statements/deleteStatements';
import { toggleIsDocument } from '@/controllers/db/statements/setIsDocument';
import { toggleStatementHide } from '@/controllers/db/statements/setStatements';
import { changeStatementType } from '@/controllers/db/statements/changeStatementType';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Menu from '@/view/components/menu/Menu';
import MenuOption from '@/view/components/menu/MenuOption';
import { Statement, StatementType } from '@freedi/shared-types';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';

interface Props {
	statement: Statement;
	isAuthorized: boolean;
	isAdmin: boolean;
	isCardMenuOpen: boolean;
	setIsCardMenuOpen: (isOpen: boolean) => void;
	isEdit: boolean;
	setIsEdit: (isEdit: boolean) => void;
	handleSetOption: () => void;
	onIntegrate?: () => void;
}

const SolutionMenu: FC<Props> = ({
	statement,
	isAdmin,
	isAuthorized,
	isCardMenuOpen,
	setIsCardMenuOpen,
	isEdit,
	setIsEdit,
	handleSetOption,
	onIntegrate,
}) => {
	const { t } = useTranslation();
	const user = useSelector(creatorSelector);
	const isCreator = statement.creatorId === user?.uid;
	const isCreatorOrAdmin = isCreator || isAdmin;
	const isOption = statement.statementType === StatementType.option;
	const isDocumentMarked = statement.isDocument === true;
	const isHide = statement.hide ? true : false;
	const isResearch = statement.statementType === StatementType.question;

	useEffect(() => {
		if (isCardMenuOpen) {
			const timer = setTimeout(() => {
				setIsCardMenuOpen(false);
			}, 35000);

			return () => clearTimeout(timer);
		}
	}, [isCardMenuOpen]);

	function handleToggleHideStatement() {
		toggleStatementHide(statement.statementId);
	}

	if (!isAuthorized) return null;
	if (!isCreatorOrAdmin && statement.statementType !== StatementType.statement) return null;

	return (
		<Menu
			setIsOpen={setIsCardMenuOpen}
			isMenuOpen={isCardMenuOpen}
			iconColor="#5899E0"
			isCardMenu={true}
			isNavMenu={false}
		>
			{isAuthorized && isCreatorOrAdmin && (
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
					label={isOption ? t('Unmark as a Solution') : t('Mark as a Solution')}
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
					label={isResearch ? t('Unmark as a Question') : t('Mark as a Question')}
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
					isOptionSelected={isHide}
					icon={isHide ? <EyeIcon /> : <EyeCrossIcon />}
					label={isHide ? t('Unhide') : t('Hide')}
					onOptionClick={() => {
						handleToggleHideStatement();
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAdmin && isOption && (
				<MenuOption
					isOptionSelected={isDocumentMarked}
					icon={<DocumentIcon />}
					label={isDocumentMarked ? t('Unmark as a Document') : t('Mark as a Document')}
					onOptionClick={() => {
						toggleIsDocument(statement.statementId);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAdmin && onIntegrate && (
				<MenuOption
					label={t('Integrate Similar')}
					icon={<NetworkIcon />}
					onOptionClick={() => {
						onIntegrate();
						setIsCardMenuOpen(false);
					}}
				/>
			)}
			{isAuthorized && isCreatorOrAdmin && (
				<MenuOption
					label={t('Delete')}
					icon={<DeleteIcon />}
					onOptionClick={() => {
						deleteStatementFromDB(statement, isAuthorized, t);
						setIsCardMenuOpen(false);
					}}
				/>
			)}
		</Menu>
	);
};

export default SolutionMenu;
