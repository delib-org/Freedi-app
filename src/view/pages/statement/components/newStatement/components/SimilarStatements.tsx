import React, { useContext } from 'react';
import { DisplayStatement } from '../NewStatement';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NewStatementContext, SimilaritySteps } from '../NewStatementCont';
import styles from './SimilarStatements.module.scss';
import { useDispatch, useSelector } from 'react-redux';
import { clearNewStatement, setShowNewStatementModal, selectNewStatement, selectParentStatementForNewStatement } from '@/redux/statements/newStatementSlice';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useLocation, useNavigate } from 'react-router';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';

export default function SimilarStatements() {

	const dispatch = useDispatch();
	const { t, currentLanguage } = useTranslation();
	const { similarStatements, setCurrentStep, title, description } = useContext(NewStatementContext);
	const newStatementParent = useSelector(selectParentStatementForNewStatement);
	const newStatement = useSelector(selectNewStatement);
	const newStatementQuestionType =
		newStatement?.questionSettings?.questionType || getDefaultQuestionType();
	const user = useSelector(creatorSelector);
	const location = useLocation();
	const navigate = useNavigate();
	const isHomePage = location.pathname === '/home';

	const handleViewSimilarStatement = (statement: DisplayStatement) => {
		const anchor = document.getElementById(statement.statementId);

		if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });

		dispatch(setShowNewStatementModal(false));
	};

	const handleSubmit = async () => {
		try {
			if (!user) throw new Error('User is not defined');
			if (!newStatementParent) throw new Error('Statement is not defined');
			if (!title) throw new Error('Title is required');

			const statementId = await createStatementWithSubscription({
				newStatementParent,
				title,
				description: description || '',
				newStatement,
				newStatementQuestionType,
				currentLanguage,
				user,
				dispatch,
			});

			dispatch(setShowNewStatementModal(false));
			dispatch(clearNewStatement());
			if (isHomePage) {
				navigate(`/statement/${statementId}`);
			}
		} catch (error) {
			console.error(error);
		}
	};

	function handleClose() {
		dispatch(setShowNewStatementModal(false));
		dispatch(clearNewStatement());
		setCurrentStep(SimilaritySteps.FORM);
	}

	return (
		<>
			<h1 className='similarities__title'>{t('Similar suggestions')}</h1>
			<h4>{t("Your suggestion")}</h4>
			<div className={styles.similarStatements}>
				<button className={styles.statement} onClick={handleSubmit}>
					{title}
				</button>
			</div>
			<h4 className='alertText'>
				{t('Here are several results that were found in the following topic')}
			</h4>
			<div className={styles.similarStatements}>
				{similarStatements.map((statement, index) => (
					<button
						key={index}
						className={styles.statement}
						onClick={() => handleViewSimilarStatement({
							title: statement.statement,
							description: statement.description || '',
							statementId: statement.statementId
						})}
					>
						<p className='suggestion__title'>{statement.statement}</p>
						<p className='suggestion__description'>
							{statement.description}
						</p>

					</button>
				))}
				<div className={styles.instructions}>
					{t("Choose one of the suggestions above or select your own suggestion")}
				</div>
				<div className='btns'>
					<button
						onClick={() => setCurrentStep(SimilaritySteps.FORM)}
						className='btn'

					>
						{t('Back')}
					</button>
					<button
						className='btn btn--cancel'
						onClick={handleClose}
					>
						{t('Close')}
					</button>
				</div>
			</div>
		</>
	);
}
