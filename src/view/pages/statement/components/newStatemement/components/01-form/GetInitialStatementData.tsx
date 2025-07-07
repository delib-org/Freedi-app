import { FormEvent, useContext, useState } from 'react';
import { NewStatementContext } from '../../newStatementCont';
import styles from './GetInitialStatementData.module.scss';
import {
	createStatement,
	setStatementToDB,
} from '@/controllers/db/statements/setStatements';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Input from '@/view/components/input/Input';
import Textarea from '@/view/components/textarea/Textarea';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { StatementType, Statement, QuestionType } from 'delib-npm';
import { LanguagesEnum } from '@/context/UserConfigContext';

export default function GetInitialStatementData() {
	const { t, currentLanguage } = useUserConfig();
	const { description, setTitle, setDescription } =
		useContext(NewStatementContext);
	const {
		newStatementType,
		newQuestionType,
		handleSetNewStatement,
		statement,
	} = useContext(StatementContext);
	const [inputValue, setInputValue] = useState<string>("");

	const _title = ((newStatementType: StatementType) => {
		switch (newStatementType) {
			case StatementType.group:
				return t('Create a group');
			case StatementType.question:
				return t('Create a question');
			default:
				return t('Create a statement');
		}
	})(newStatementType);

	const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
		ev.preventDefault();
		try {
			const form = new FormData(ev.target as HTMLFormElement);
			const title = form.get('title') as string;
			const description = (form.get('description') as string) || '';
			setTitle(inputValue.toString());
			setDescription(description);

			if (!statement) throw new Error('Statement is not defined');
			const lang =
				newQuestionType === QuestionType.massConsensus
					? (currentLanguage as LanguagesEnum)
					: '';

			const newStatement: Statement | undefined = createStatement({
				parentStatement: statement,
				text: title,
				description,
				defaultLanguage: lang,
				statementType: newStatementType,
				questionType: newQuestionType,
			});
			if (!newStatement) throw new Error('newStatement is not defined');

			setStatementToDB({
				parentStatement: statement,
				statement: newStatement,
			});

			handleSetNewStatement(false);
			setInputValue("");
		} catch (error) {
			console.error(error);
		}
	};

	const { title: titleLabel, description: descriptionLabel } =
		getTexts(newStatementType);

	return (
		<>
			<h4>{_title}</h4>
			<form className={styles.form} onSubmit={handleSubmit}>
				<Input
					label={t(titleLabel)}
					value={inputValue}
					name='title'
					autoFocus={true}
					placeholder=''
					onChange={(value) => setInputValue(value)}
				/>
				<Textarea
					label={t(descriptionLabel)}
					value={description}
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
						onClick={() => handleSetNewStatement(false)}
					/>
				</div>
			</form>
		</>
	);
}

function getTexts(statementType: StatementType): {
	title: string;
	description: string;
	placeholder: string;
} {
	try {
		switch (statementType) {
			case StatementType.group:
				return {
					title: 'Group Title',
					description: 'Group Description',
					placeholder: 'Describe the group',
				};
			case StatementType.question:
				return {
					title: 'Question Title',
					description: 'Question Description',
					placeholder: 'Describe the question',
				};
			default:
				return {
					title: 'Title',
					description: 'Description',
					placeholder: 'Description',
				};
		}
	} catch (error) {
		console.error(error);

		return {
			title: 'Title',
			description: 'Description',
			placeholder: 'Description',
		};
	}
}
