import { FormEvent, useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import styles from './GetInitialStatementData.module.scss';
import {
	createStatement,
	setStatementToDB,
} from '@/controllers/db/statements/setStatements';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Input from '@/view/components/input/Input';
import Textarea from '@/view/components/textarea/Textarea';
import { StatementType, Statement, QuestionType, Role, getStatementSubscriptionId } from 'delib-npm';
import { LanguagesEnum } from '@/context/UserConfigContext';
import { useDispatch, useSelector } from 'react-redux';
import { clearNewStatement, selectNewStatement, selectParentStatementForNewStatement, setShowNewStatementModal } from '@/redux/statements/newStatementSlice';
import { setStatement, setStatementSubscription } from '@/redux/statements/statementsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { NewStatementContext, SimilaritySteps } from '../../NewStatementCont';
import { getSimilarOptions } from './GetInitialStatementDataCont';

export default function GetInitialStatementData() {
	const { lookingForSimilarStatements, setLookingForSimilarStatements, setSimilarStatements, setCurrentStep } = useContext(NewStatementContext);
	const { t, currentLanguage } = useUserConfig();
	const location = useLocation();
	const navigate = useNavigate();
	const isHomePage = location.pathname === '/home';
	const dispatch = useDispatch();
	const newStatementParent = useSelector(selectParentStatementForNewStatement);
	const newStatement = useSelector(selectNewStatement);
	const newStatementType = newStatement?.statementType || StatementType.group;
	const newStatementQuestionType =
		newStatement?.questionSettings?.questionType || QuestionType.multiStage;
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

			if (lookingForSimilarStatements && typeof newStatementParent === 'object' && newStatementParent?.statementId !== 'top') {
				setLoading(true);
				console.log('Looking for similar statements');
				//get api to find similar statements
				const { similarStatements } = await getSimilarOptions(
					newStatementParent.statementId,
					title,
					user.uid,
					setError
				);
				setLoading(false);
				if (similarStatements) {
					console.log("similarStatements", similarStatements);
					setSimilarStatements(similarStatements);
					setCurrentStep(SimilaritySteps.SIMILARITIES);

					return;
				}
			}

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

			const { statementId } = await setStatementToDB({
				parentStatement: newStatementParent,
				statement: _newStatement,
			});

			dispatch(setStatement(_newStatement));
			const now = new Date().getTime();
			dispatch(setStatementSubscription({
				role: Role.admin,
				statement: _newStatement,
				statementsSubscribeId: getStatementSubscriptionId(statementId, user),
				statementId: statementId,
				user: user,
				lastUpdate: now,
				createdAt: now,
				userId: user?.uid || '',
			}))
			dispatch(setShowNewStatementModal(false));
			dispatch(clearNewStatement());
			if (isHomePage) {
				navigate(`/statement/${statementId}`);
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
