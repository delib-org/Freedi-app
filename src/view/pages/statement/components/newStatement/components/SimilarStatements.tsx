import { useContext } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { NewStatementContext, SimilaritySteps } from '../NewStatementCont';
import styles from './SimilarStatements.module.scss';
import { useDispatch, useSelector } from 'react-redux';
import {
	clearNewStatement,
	setShowNewStatementModal,
	selectNewStatement,
	selectParentStatementForNewStatement,
} from '@/redux/statements/newStatementSlice';
import { createStatementWithSubscription } from '@/controllers/db/statements/createStatementWithSubscription';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useLocation, useNavigate } from 'react-router';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';
import { getParagraphsText } from '@/utils/paragraphUtils';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { closePanels } from '@/controllers/hooks/panelUtils';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { Statement } from '@freedi/shared-types';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';

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

	const handleSelectSimilarStatement = async (statement: Statement) => {
		try {
			// Add evaluation of 1 for the selected statement
			if (user) {
				await setEvaluationToDB(statement, user, 1);
			}

			// Delay scroll to allow modal to close first
			setTimeout(() => {
				const anchor = document.getElementById(statement.statementId);

				if (anchor) {
					// Get the element's position and scroll with offset to show title
					const headerOffset = 100; // Account for fixed headers
					const elementPosition = anchor.getBoundingClientRect().top;
					const offsetPosition = elementPosition + window.scrollY - headerOffset;

					window.scrollTo({
						top: offsetPosition,
						behavior: 'smooth',
					});
				}
			}, 100);

			dispatch(setShowNewStatementModal(false));
			dispatch(clearNewStatement());
			closePanels();
		} catch (error) {
			console.error('Failed to set evaluation:', error);
		}
	};

	const handleCreateNewStatement = async () => {
		try {
			if (!user) throw new Error('User is not defined');
			if (!newStatementParent) throw new Error('Statement is not defined');
			if (!title) throw new Error('Title is required');

			const statementId = await createStatementWithSubscription({
				newStatementParent,
				title,
				paragraphs: undefined,
				newStatement,
				newStatementQuestionType,
				currentLanguage,
				user,
				dispatch,
			});

			dispatch(setShowNewStatementModal(false));
			dispatch(clearNewStatement());
			closePanels();

			if (isHomePage) {
				navigate(`/statement/${statementId}`);
			}
		} catch (error) {
			console.error(error);
		}
	};

	const handleClose = () => {
		dispatch(setShowNewStatementModal(false));
		dispatch(clearNewStatement());
		setCurrentStep(SimilaritySteps.FORM);
	};

	const handleBack = () => {
		setCurrentStep(SimilaritySteps.FORM);
	};

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h2 className={styles.title}>{t('Similar ideas found!')}</h2>
				<p className={styles.subtitle}>
					{t(
						'We found existing ideas similar to yours. Consider joining an existing discussion for greater impact.',
					)}
				</p>
			</div>

			<div className={styles.cardsContainer}>
				{/* User's own suggestion */}
				<div className={styles.section}>
					<div className={styles.sectionHeader}>
						<span className={styles.sectionIcon}>💡</span>
						<h4>{t('Your suggestion')}</h4>
					</div>
					<div
						className={`similarity-card similarity-card--user-own similarity-card--animate`}
						onClick={handleCreateNewStatement}
					>
						<div className="similarity-card__badge similarity-card__badge--user">
							{t('Your idea')}
						</div>
						<h3 className="similarity-card__title">{title}</h3>
						{description && <p className="similarity-card__description">{description}</p>}
						<button className="similarity-card__action">{t('Create as new')}</button>
					</div>
				</div>

				{/* Divider */}
				<div className={styles.divider}>
					<span>{t('or join an existing idea')}</span>
				</div>

				{/* Similar suggestions */}
				<div className={styles.section}>
					<div className={styles.sectionHeader}>
						<span className={styles.sectionIcon}>👥</span>
						<h4>{t('Similar from the community')}</h4>
					</div>
					<p className={styles.sectionSubtitle}>
						{t('Join forces with others for a stronger voice')}
					</p>

					<div className={styles.similarCards}>
						{similarStatements.map((statement, index) => {
							const descriptionText = getParagraphsText(statement.paragraphs);
							const isBestMatch = index === 0;
							const supportersCount = statement.totalEvaluators || 0;

							return (
								<div
									key={statement.statementId}
									className={`similarity-card similarity-card--animate ${isBestMatch ? 'similarity-card--best-match' : ''}`}
									onClick={() => handleSelectSimilarStatement(statement)}
								>
									{isBestMatch && (
										<div className="similarity-card__badge similarity-card__badge--best">
											{t('Best match')}
										</div>
									)}
									<h3 className="similarity-card__title">
										{renderInlineMarkdown(statement.statement)}
									</h3>
									{descriptionText && (
										<p className="similarity-card__description">{descriptionText}</p>
									)}
									<div className="similarity-card__meta">
										{supportersCount > 0 && (
											<span className="similarity-card__supporters">
												👥 {supportersCount} {t('supporters')}
											</span>
										)}
									</div>
									<button className="similarity-card__action">{t('View & join')}</button>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className={styles.actions}>
				<Button text={t('Back to edit')} buttonType={ButtonType.SECONDARY} onClick={handleBack} />
				<Button text={t('Close')} buttonType={ButtonType.SECONDARY} onClick={handleClose} />
			</div>
		</div>
	);
}
