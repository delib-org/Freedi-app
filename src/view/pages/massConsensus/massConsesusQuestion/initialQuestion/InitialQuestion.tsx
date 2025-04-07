import { useParams } from 'react-router';
import TitleMassConsensus from '../../TitleMassConsensus/TitleMassConsensus';
import { useDispatch, useSelector } from 'react-redux';
import {
	setStatement,
	statementSelector,
} from '@/redux/statements/statementsSlice';
import { useEffect, useState } from 'react';
import { useInitialQuestion } from './InitialQuestionVM';
import { Role } from 'delib-npm';
import styles from './InitialQuestion.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Textarea from '@/view/components/textarea/Textarea';
import { updateStatementText } from '@/controllers/db/statements/setStatements';

const InitialQuestion = ({stage, updateStage, setIfButtonEnabled}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const [description, setDescription] = useState('');
	const dispatch = useDispatch(); // Dispatch to update the redux state
	const {
		handleSetInitialSuggestion,
		ready,
		subscription,
	} = useInitialQuestion(description);
	const { t } = useUserConfig();
	const [edit, setEdit] = useState(false);
	const [title, setTitle] = useState(statement ? statement.statement : '');
	
	const isAdmin = subscription?.role === Role.admin;
	
	useEffect(() => {
		if ( stage === "loading" ) handleSetInitialSuggestion();
	}, [stage])

	useEffect(() => {
		if (ready) updateStage("suggestions");
	}, [ready]);

	useEffect(() => {
		setIfButtonEnabled(description !== null)
	}, [description])

	async function handleSubmitInitialQuestionText(e) {
		e.preventDefault();

		if (title.trim().length < 5) {
			alert(
				'Title must be at least 5 characters long and cannot be just spaces'
			);

			return;
		}
		await updateStatementText(statement, title);

		dispatch(setStatement({ ...statement, statement: title }));

		setEdit(false);
	}

	return (
		<>
			{!edit ? (
				<TitleMassConsensus
					title={statement ? statement.statement : ''}
				></TitleMassConsensus>
			) : (
				<form onSubmit={handleSubmitInitialQuestionText}>
					<textarea
						className={styles.textarea}
						placeholder={statement ? statement.statement : ''}
						onChange={(e) => setTitle(e.target.value)}
						onKeyUp={(e) => {
							if (e.key === 'Enter') {
								handleSubmitInitialQuestionText(e);
							}
						}}
					/>
					<div className='btns'>
						<button className='btn btn--primary' type='submit'>
							{t('submit')}
						</button>
					</div>
				</form>
			)}
			{isAdmin && !edit && (
				<div className='btns'>
					<button
						className='btn btn--secondary'
						onClick={() => setEdit(true)}
						onKeyUp={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								setEdit(true);
							}
						}}
						tabIndex={0}
					>
						Edit
					</button>
				</div>
			)}
			<Textarea
				name='your-description'
				label={t('Your suggestion')}
				placeholder=''
				backgroundColor='var(--bg-screen)'
				maxLength={120}
				onChange={setDescription}
				value={description}
				onKeyUp={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						handleSetInitialSuggestion();
					}
				}}
			/>
		</>
	);
};

export default InitialQuestion;
