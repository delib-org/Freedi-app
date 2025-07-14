import React, { useContext } from 'react';
import { DisplayStatement } from '../NewStatement';
import SendIcon from '@/assets/icons/send-icon-pointing-up-and-right.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { NewStatementContext, SimilaritySteps } from '../NewStatementCont';
import styles from './SimilarStatements.module.scss';
import { useDispatch } from 'react-redux';
import { clearNewStatement, setShowNewStatementModal } from '@/redux/statements/newStatementSlice';

export default function SimilarStatements() {

	const dispatch = useDispatch();
	const { t } = useUserConfig();
	const { similarStatements, setCurrentStep, title } = useContext(NewStatementContext);

	const handleViewSimilarStatement = (statement: DisplayStatement) => {
		const anchor = document.getElementById(statement.statementId);

		if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });

		setShowModal(false);
	};

	const handleSubmit = () => {
		console.log("first submit");
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
				<button className={styles.statement}>
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
						onClick={() => handleViewSimilarStatement(statement)}
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
