import React, { useContext } from 'react';
import { DisplayStatement } from '../NewStatement';
import SendIcon from '@/assets/icons/send-icon-pointing-up-and-right.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import { NewStatementContext, SimilaritySteps } from '../NewStatementCont';
import styles from './SimilarStatements.module.scss';

export default function SimilarStatements() {
	const { t } = useUserConfig();
	const { similarStatements, setCurrentStep } = useContext(NewStatementContext);

	console.log(similarStatements, "similarStatements");

	const handleViewSimilarStatement = (statement: DisplayStatement) => {
		const anchor = document.getElementById(statement.statementId);

		if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });

		setShowModal(false);
	};

	const handleSubmit = () => {
		console.log("first submit");
	};

	return (
		<>
			<h1 className='similarities__title'>{t('Similar suggestions')}</h1>
			<h4 className='alertText'>
				{t(
					'Here are several results that were found in the following topic'
				)}
				:
			</h4>
			<section className={styles.similarStatements}>
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
				<div className='btns'>
					<Button
						text={t('Back')}
						onClick={() => setCurrentStep(SimilaritySteps.FORM)}
						buttonType={ButtonType.SECONDARY}
					/>
					<Button
						icon={<SendIcon />}
						text={t('Continue with your original suggestion')}
						onClick={handleSubmit}
					/>
				</div>
			</section>
		</>
	);
}
