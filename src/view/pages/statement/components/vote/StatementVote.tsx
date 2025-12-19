import { FC, useContext, useEffect, useState } from 'react';
import { getStepsInfo } from '../settings/components/QuestionSettings/QuestionStageRadioBtn/QuestionStageRadioBtn';
import StatementInfo from './components/info/StatementInfo';
import VotingArea from './components/votingArea/VotingArea';
import { getTotalVoters } from './statementVoteCont';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import X from '@/assets/icons/x.svg?react';
import { getToVoteOnParent } from '@/controllers/db/vote/getVotes';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';

// Custom components
import Button from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import styles from './StatementVote.module.scss';

// Helpers
import Toast from '@/view/components/toast/Toast';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { StatementContext } from '../../StatementCont';
import { Statement, QuestionStep } from '@freedi/shared-types';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { useSelector } from 'react-redux';
import { setVoteToStore } from '@/redux/vote/votesSlice';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

let getVoteFromDB = false;

const StatementVote: FC = () => {
	// * Hooks * //
	const dispatch = useAppDispatch();
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const { statement } = useContext(StatementContext);
	const inVotingGetOnlyResults = statement?.statementSettings?.inVotingGetOnlyResults;
	const topOptionsCount = statement?.resultsSettings?.numberOfResults ?? 3;

	const _subStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	);

	const subStatements = inVotingGetOnlyResults ? _subStatements.sort((b, a) => (a.consensus || 0) - (b.consensus || 0)).slice(0, topOptionsCount) : _subStatements;

	const currentStep = statement?.questionSettings?.currentStep;
	const isCurrentStepVoting = currentStep === QuestionStep.voting;
	const stageInfo = getStepsInfo(currentStep);
	const toastMessage = stageInfo ? stageInfo.message : '';

	// * Use State * //
	const [showMultiStageMessage, setShowMultiStageMessage] =
		useState(isCurrentStepVoting);
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] =
		useState(false);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(
		undefined
	);

	// * Variables * //
	const totalVotes = getTotalVoters(statement);

	useEffect(() => {
		if (!getVoteFromDB && user?.uid) {
			getToVoteOnParent(
				statement?.statementId,
				user.uid,
				(option: Statement) => dispatch(setVoteToStore(option))
			);
			getVoteFromDB = true;
		}
	}, [statement?.statementId, dispatch, user?.uid]);

	return (
		<>
			<div className={styles.statementVote}>
				{showMultiStageMessage && (
					<Toast
						text={t(`${toastMessage}`)}
						type='message'
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
				<div className={styles.numberOfVotesMark}>
					<HandIcon /> {totalVotes}
				</div>
				<VotingArea
					totalVotes={totalVotes}
					setShowInfo={setIsStatementInfoModalOpen}
					subStatements={subStatements}
					setStatementInfo={setStatementInfo}
				/>
			</div>
			{isStatementInfoModalOpen && (
				<Modal>
					<StatementInfo
						statement={statementInfo}
						setShowInfo={setIsStatementInfoModalOpen}
					/>
				</Modal>
			)}
		</>
	);
};

export default StatementVote;
