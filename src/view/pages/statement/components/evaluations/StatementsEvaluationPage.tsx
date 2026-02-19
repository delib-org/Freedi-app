import { FC, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import CreateStatementModalSwitch from '../createStatementModalSwitch/CreateStatementModalSwitch';
import StatementBottomNav from '../nav/bottom/StatementBottomNav';
import StatementInfo from '../vote/components/info/StatementInfo';
import EditableDescription from './components/description/EditableDescription';
import SuggestionCards from './components/suggestionCards/SuggestionCards';
import styles from './statementEvaluationsPage.module.scss';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import X from '@/assets/icons/x.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Button from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import Toast from '@/view/components/toast/Toast';
import { QuestionStep, StatementType, Statement } from '@freedi/shared-types';
import { useEvaluationGuard } from '@/controllers/hooks/useEvaluationGuard';
import AddSolutionPrompt from '@/view/components/evaluation/AddSolutionPrompt';
import { logError } from '@/utils/errorHandling';

interface StatementEvaluationPageProps {
	statement: Statement;
	showNav?: boolean;
	questions?: boolean;
	currentPage?: string;
}

const StatementEvaluationPage: FC<StatementEvaluationPageProps> = ({
	statement,
	questions = false,
}) => {
	// Hooks

	const navigate = useNavigate();
	const { t } = useTranslation();
	const isMultiStage = false;
	const { canEvaluate, requiresSolution } = useEvaluationGuard(statement);

	const currentStep = statement.questionSettings?.currentStep;
	const useSearchForSimilarStatements =
		statement.statementSettings?.enableSimilaritiesSearch || false;

	// Use States
	const [showModal, setShowModal] = useState(false);
	const [showToast, setShowToast] = useState(false);
	const [showExplanation, setShowExplanation] = useState<boolean>(
		currentStep === QuestionStep.explanation && isMultiStage && !questions,
	);
	const [showSolutionPrompt, setShowSolutionPrompt] = useState(false);

	useEffect(() => {
		if (questions) {
			setShowToast(false);
		}
	}, [questions]);

	// Show solution prompt on page load if required and user hasn't submitted
	useEffect(() => {
		if (requiresSolution && !canEvaluate) {
			setShowSolutionPrompt(true);
		}
	}, [requiresSolution, canEvaluate]);

	useEffect(() => {
		if (!showToast && !questions) {
			setShowToast(true);
		}
		if (currentStep === QuestionStep.explanation && isMultiStage && !questions) {
			setShowExplanation(true);
		}
		if (currentStep === QuestionStep.voting && !questions) {
			//redirect us react router dom to voting page
			navigate(`/statement/${statement.statementId}/vote`);
		}
	}, [statement.questionSettings?.currentStep, questions]);
	try {
		const message = currentStep || false;

		return (
			<>
				<div className="page__main">
					<div className={`wrapper ${styles.wrapper}`}>
						{isMultiStage && message && (
							<Toast
								text={`${t(message)}${currentStep === QuestionStep.suggestion ? statement.statement : ''}`}
								type="message"
								show={showToast}
								setShow={setShowToast}
							>
								{getToastButtons(currentStep)}
							</Toast>
						)}
						<EditableDescription />
						<SuggestionCards />
					</div>
				</div>
				<div className="page__footer">
					<StatementBottomNav />
				</div>
				{showExplanation && (
					<Modal>
						<StatementInfo statement={statement} setShowInfo={setShowExplanation} />
					</Modal>
				)}
				{showModal && (
					<CreateStatementModalSwitch
						allowedTypes={[StatementType.option]}
						parentStatement={statement}
						isQuestion={questions}
						isMultiStage={isMultiStage}
						setShowModal={setShowModal}
						useSimilarStatements={useSearchForSimilarStatements}
					/>
				)}
				<AddSolutionPrompt
					show={showSolutionPrompt}
					onClose={() => setShowSolutionPrompt(false)}
					statement={statement}
				/>
			</>
		);

		function getToastButtons(questionStage: QuestionStep | undefined) {
			try {
				switch (questionStage) {
					case QuestionStep.suggestion:
						return (
							<>
								<Button
									text={t('Close')}
									iconOnRight={false}
									onClick={() => {
										setShowToast(false);
									}}
									icon={<X />}
								/>
								<Button
									text={t('Add an answer')}
									iconOnRight={true}
									onClick={() => {
										setShowToast(false);
										setShowModal(true);
									}}
									icon={<LightBulbIcon />}
								/>
							</>
						);
					case QuestionStep.voting:
					case QuestionStep.finished:
					case QuestionStep.explanation:
					default:
						return (
							<Button
								text={t('Close')}
								iconOnRight={false}
								onClick={() => {
									setShowToast(false);
								}}
								icon={<X />}
							/>
						);
				}
			} catch (error) {
				logError(error, { operation: 'evaluations.StatementsEvaluationPage.unknown' });

				return null;
			}
		}
	} catch (error) {
		logError(error, { operation: 'evaluations.StatementsEvaluationPage.unknown' });

		return null;
	}
};

export default StatementEvaluationPage;
