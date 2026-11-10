import { FC, useContext, useState } from 'react';
import { getStepsInfo } from '../settings/components/QuestionSettings/QuestionStageRadioBtn/helpers';
import StatementInfo from './components/info/StatementInfo';
import VotingArea from './components/votingArea/VotingArea';
import { NO_VOTE, useOptimisticVotes } from './useOptimisticVotes';
import { useQuestionScoreAccess } from '../questionScreen/useAnswerScoreGate';
import { canSeeVoteTallies } from '../questionScreen/canSeeScore';
import { areResultsOffForEveryone } from '../questionScreen/resultsLogic';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import X from '@/assets/icons/x.svg?react';

// Custom components
import Button from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import styles from './StatementVote.module.scss';

// Helpers
import Toast from '@/view/components/toast/Toast';
import ActionToast from '@/view/components/atomic/molecules/ActionToast';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { StatementContext } from '../../StatementCont';
import { Statement, QuestionStep } from '@freedi/shared-types';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { useSelector } from 'react-redux';
import { filterVotingOptions, topVotingOptions } from './votingOptionsFilter';

const StatementVote: FC = () => {
	// * Hooks * //
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const inVotingGetOnlyResults = statement?.statementSettings?.inVotingGetOnlyResults;
	const topOptionsCount = statement?.resultsSettings?.numberOfResults ?? 3;

	const _allSubStatements = useSelector(statementSubsSelector(statement?.statementId));
	const _subStatements = filterVotingOptions(
		_allSubStatements,
		statement?.statementSettings?.votingOptionsSource,
	);

	const { facts: scoreFacts } = useQuestionScoreAccess(statement);
	const subStatements = inVotingGetOnlyResults
		? topVotingOptions(_subStatements, topOptionsCount, areResultsOffForEveryone(scoreFacts))
		: _subStatements;

	const currentStep = statement?.questionSettings?.currentStep;
	const isCurrentStepVoting = currentStep === QuestionStep.voting;
	const stageInfo = getStepsInfo(currentStep);
	const toastMessage = stageInfo ? stageInfo.message : '';

	// * Use State * //
	const [showMultiStageMessage, setShowMultiStageMessage] = useState(isCurrentStepVoting);
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] = useState(false);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(undefined);

	// * Variables * //
	const { selectionsById, totalVotes, votedOptionId, castVote, voteCountedId, dismissVoteCounted } =
		useOptimisticVotes(statement);
	const showTallies = canSeeVoteTallies(scoreFacts, votedOptionId !== NO_VOTE);

	return (
		<>
			<div className={styles.statementVote}>
				{showMultiStageMessage && (
					<Toast
						text={t(`${toastMessage}`)}
						type="message"
						show={showMultiStageMessage}
						setShow={setShowMultiStageMessage}
					>
						<Button
							text={t('Got it')}
							iconOnRight={true}
							icon={<X />}
							onClick={() => setShowMultiStageMessage(false)}
						/>
					</Toast>
				)}
				{showTallies && (
					<div className={styles.numberOfVotesMark}>
						<HandIcon /> {totalVotes}
					</div>
				)}
				<VotingArea
					totalVotes={totalVotes}
					showTallies={showTallies}
					selectionsById={selectionsById}
					votedOptionId={votedOptionId}
					castVote={castVote}
					setShowInfo={setIsStatementInfoModalOpen}
					subStatements={subStatements}
					setStatementInfo={setStatementInfo}
				/>
			</div>
			{isStatementInfoModalOpen && (
				<Modal>
					<StatementInfo statement={statementInfo} setShowInfo={setIsStatementInfoModalOpen} />
				</Modal>
			)}
			{voteCountedId > 0 && (
				<ActionToast
					key={voteCountedId}
					message={t('question.voteCounted')}
					variant="success"
					onDismiss={dismissVoteCounted}
				/>
			)}
		</>
	);
};

export default StatementVote;
