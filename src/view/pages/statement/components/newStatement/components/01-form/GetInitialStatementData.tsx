import { FormEvent, useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import styles from './GetInitialStatementData.module.scss';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Input from '@/view/components/input/Input';
import Textarea from '@/view/components/textarea/Textarea';
import { StatementType } from '@freedi/shared-types';
import { useDispatch, useSelector } from 'react-redux';
import { clearNewStatement, selectNewStatement, selectParentStatementForNewStatement, setShowNewStatementModal } from '@/redux/statements/newStatementSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { NewStatementContext, SimilaritySteps } from '../../NewStatementCont';
import { getSimilarOptions } from './GetInitialStatementDataCont';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';

export default function GetInitialStatementData() {
	const { lookingForSimilarStatements, setLookingForSimilarStatements, setSimilarStatements, setCurrentStep, setTitle } = useContext(NewStatementContext);
	const { t, currentLanguage } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();
	const isHomePage = location.pathname === '/home';
	const dispatch = useDispatch();
	const newStatementParent = useSelector(selectParentStatementForNewStatement);
	const newStatement = useSelector(selectNewStatement);
	const newStatementType = newStatement?.statementType || StatementType.group;
	const newStatementQuestionType =
		newStatement?.questionSettings?.questionType || getDefaultQuestionType();
	const user = useSelector(creatorSelector);

	const [error, setError] = useState<string>('');
	const [loading, setLoading] = useState<boolean>(false);

	const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
		ev.preventDefault();
		try {
			if (!user) throw new Error('User is not defined');

			const form = new FormData(ev.target as HTMLFormElement);
			const title = form.get('title') as string;
			const description = (form.get('description') as string) || '';

			if (!newStatementParent) throw new Error('Statement is not defined');

			if (!title) throw new Error('Title is required');
			setTitle(title);

			if (lookingForSimilarStatements && typeof newStatementParent === 'object' && newStatementParent?.statementId !== 'top') {
				setLoading(true);

				//get api to find similar statements
				const result = await getSimilarOptions(
					newStatementParent.statementId,
					title,
					user.uid,
					setError
				);
				setLoading(false);
				
				if (result && result.similarStatements && result.similarStatements.length > 0) {
					setSimilarStatements(result.similarStatements);
					setCurrentStep(SimilaritySteps.SIMILARITIES);
					
return;
				}
			}

			dispatch(setShowNewStatementModal(false));
			dispatch(clearNewStatement());
			
			const statementIdPromise = createStatementWithSubscription({
				newStatementParent,
				title,
				description,
				newStatement,
				newStatementQuestionType,
				currentLanguage,
				user,
				dispatch,
			});

			if (isHomePage) {
				statementIdPromise.then(statementId => {
					navigate(`/statement/${statementId}`);
				});
			}
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
				{!loading ?
					<><Input
						label={t(titleLabel)}
						name='title'
						autoFocus={true}
					/>
						<Textarea
							label={t(descriptionLabel)}
							name='description'
						/>
						<Checkbox
							label={t('Search for similar statements')}
							isChecked={lookingForSimilarStatements}
							onChange={setLookingForSimilarStatements}
						/>
					</>
					: <p>{t('Searching for similar statements')}...</p>}

				{error && <p className={styles.error}>{t(error)}</p>}
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
