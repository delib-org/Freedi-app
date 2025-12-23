import { FormEvent, useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import styles from './GetInitialStatementData.module.scss';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { closePanels } from '@/controllers/hooks/panelUtils';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import Input from '@/view/components/input/Input';
import Textarea from '@/view/components/textarea/Textarea';
import { StatementType, ParagraphType } from '@freedi/shared-types';
import { useDispatch, useSelector } from 'react-redux';
import { clearNewStatement, selectNewStatement, selectParentStatementForNewStatement, setShowNewStatementModal } from '@/redux/statements/newStatementSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import Checkbox from '@/view/components/checkbox/Checkbox';
import { NewStatementContext, SimilaritySteps } from '../../NewStatementCont';
import { getSimilarOptions } from './GetInitialStatementDataCont';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';
import { generateParagraphId } from '@/utils/paragraphUtils';
import SuggestionLoader from '@/view/components/loaders/SuggestionLoader';

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

			// Close chat panel and map container so user can see the main page
			closePanels();

			// Convert description text to paragraphs array
			const paragraphs = description.trim() ? description.split('\n').filter(line => line.trim()).map((line, index) => ({
				paragraphId: generateParagraphId(),
				type: ParagraphType.paragraph,
				content: line,
				order: index,
			})) : undefined;

			const statementIdPromise = createStatementWithSubscription({
				newStatementParent,
				title,
				paragraphs,
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

	if (loading) {
		return (
			<SuggestionLoader
				show={loading}
				variant="modern"
			/>
		);
	}

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
				<div className={styles.similarityToggle}>
					<Checkbox
						label={t('Search for similar statements')}
						isChecked={lookingForSimilarStatements}
						onChange={setLookingForSimilarStatements}
					/>
					{lookingForSimilarStatements && (
						<p className={styles.similarityHint}>
							{t("We'll help you find similar ideas from the community")}
						</p>
					)}
				</div>

				{error && <p className={styles.error}>{t(error)}</p>}
				<div className='btns'>
					<Button
						type='submit'
						text={lookingForSimilarStatements ? t('Continue') : t('Create')}
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
