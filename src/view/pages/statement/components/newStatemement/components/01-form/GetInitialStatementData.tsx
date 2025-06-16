import { FormEvent } from 'react';
import styles from './GetInitialStatementData.module.scss';
import {
	createStatement,
	setStatementToDB,
} from '@/controllers/db/statements/setStatements';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Input from '@/view/components/input/Input';
import Textarea from '@/view/components/textarea/Textarea';
import { StatementType, Statement, QuestionType } from 'delib-npm';
import { LanguagesEnum } from '@/context/UserConfigContext';
import { useDispatch, useSelector } from 'react-redux';
import { clearNewStatement, selectNewStatement, selectParentStatementForNewStatement, setShowNewStatementModal } from '@/redux/statements/newStatementSlice';

export default function GetInitialStatementData() {
	const { t, currentLanguage } = useUserConfig();
	const dispatch = useDispatch();
	const newStatementParent = useSelector(selectParentStatementForNewStatement);
	const newStatement = useSelector(selectNewStatement);
	const newStatementType = newStatement?.statementType || StatementType.group;
	const newStatementQuestionType =
		newStatement?.questionSettings?.questionType || QuestionType.multiStage;

	const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
		ev.preventDefault();
		try {
			const form = new FormData(ev.target as HTMLFormElement);
			const title = form.get('title') as string;
			const description = (form.get('description') as string) || '';

			if (!newStatementParent) throw new Error('Statement is not defined');
			const lang =
				newStatementQuestionType === QuestionType.massConsensus
					? (currentLanguage as LanguagesEnum)
					: '';

			const _newStatement: Statement | undefined = createStatement({
				parentStatement: newStatementParent,
				text: title,
				description,
				defaultLanguage: lang,
				statementType: newStatement?.statementType || StatementType.group,
				questionType: newStatementQuestionType,
			});
			if (!_newStatement) throw new Error('newStatement is not defined');

			setStatementToDB({
				parentStatement: newStatementParent,
				statement: _newStatement,
			});

			dispatch(setShowNewStatementModal(false));
			dispatch(clearNewStatement());
		} catch (error) {
			console.error(error);
		}
	};

	const { header, title: titleLabel, description: descriptionLabel } =
		getTexts(newStatementType);

	return (
		<>
			<h4>{t(header)}</h4>
			<form className={styles.form} onSubmit={handleSubmit}>
				<Input
					label={t(titleLabel)}
					name='title'
					autoFocus={true}
				/>
				<Textarea
					label={t(descriptionLabel)}
					name='description'
				/>
				<div className='btns'>
					<Button
						type='submit'
						text={t('Create')}
						buttonType={ButtonType.PRIMARY}
					/>
					<Button
						text={t('Cancel')}
						buttonType={ButtonType.SECONDARY}
						onClick={() => {
							dispatch(setShowNewStatementModal(false));
							dispatch(clearNewStatement());
						}}
					/>
				</div>
			</form>
		</>
	);
}

function getTexts(statementType: StatementType): {
	header: string;
	title: string;
	description: string;
	placeholder: string;
} {
	try {
		switch (statementType) {
			case StatementType.group:
				return {
					header: 'Create a group',
					title: 'Group Title',
					description: 'Group Description',
					placeholder: 'Describe the group',
				};
			case StatementType.question:
				return {
					header: 'Create a question',
					title: 'Question Title',
					description: 'Question Description',
					placeholder: 'Describe the question',
				};
			default:
				return {
					header: 'Create a statement',
					title: 'Title',
					description: 'Description',
					placeholder: 'Description',
				};
		}
	} catch (error) {
		console.error(error);

		return {
			header: 'Create a statement',
			title: 'Title',
			description: 'Description',
			placeholder: 'Description',
		};
	}
}
