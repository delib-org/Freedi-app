import { FormEvent, useContext, useEffect, useState } from 'react';
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
import { useDispatch, useSelector } from 'react-redux';
import { clearNewStatement, selectNewQuestionType, selectNewStatementType, selectParentStatementForNewStatement, setNewStatementType } from '@/redux/statements/newStatementSlice';

export default function GetInitialStatementData() {
	const dispatch = useDispatch();
	const { t, currentLanguage } = useUserConfig();

	const newStatementType = useSelector(selectNewStatementType);
	const newStatementQuestionType = useSelector(selectNewQuestionType);
	const parentStatement = useSelector(selectParentStatementForNewStatement)

	useEffect(() => {
		console.log("statement in GetInitialStatementData", parentStatement);
		if (!parentStatement) {
			dispatch(setNewStatementType(StatementType.question));
		}
	}, [parentStatement]);

	console.log(newStatementType, 'newStatementType in GetInitialStatementData');

	const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
		ev.preventDefault();
		try {
			const form = new FormData(ev.target as HTMLFormElement);
			const title = form.get('title') as string;
			const description = (form.get('description') as string) || '';

			const lang =
				newStatementQuestionType === QuestionType.massConsensus
					? (currentLanguage as LanguagesEnum)
					: '';

			const newStatement: Statement | undefined = createStatement({
				parentStatement,
				text: title,
				description,
				defaultLanguage: lang,
				statementType: newStatementType,
				questionType: newStatementQuestionType,
			});
			if (!newStatement) throw new Error('newStatement is not defined');

			setStatementToDB({
				parentStatement: parentStatement || "top",
				statement: newStatement,
			});

			dispatch(clearNewStatement())

		} catch (error) {
			console.error(error);
		}
	};

	const { headerTitle, title: titleLabel, description: descriptionLabel } =
		getTexts(newStatementType);

	return (
		<>
			<h4>{headerTitle}</h4>
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
						onClick={() => handleSetNewStatement(false)}
					/>
				</div>
			</form>
		</>
	);
}

function getTexts(statementType: StatementType): {
	headerTitle: string;
	title: string;
	description: string;
	placeholder: string;
} {
	try {
		switch (statementType) {
			case StatementType.group:
				return {
					headerTitle: 'Create a group',
					title: 'Group Title',
					description: 'Group Description',
					placeholder: 'Describe the group',
				};
			case StatementType.question:
				return {
					headerTitle: 'Create a question',
					title: 'Question Title',
					description: 'Question Description',
					placeholder: 'Describe the question',
				};
			default:
				return {
					headerTitle: 'Create a statement',
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
