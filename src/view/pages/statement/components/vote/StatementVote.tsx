import { FC, useContext, useEffect, useState } from 'react';
import StatementBottomNav from '../nav/bottom/StatementBottomNav';
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
import './StatementVote.scss';

// Helpers
import Toast from '@/view/components/toast/Toast';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { StatementContext } from '../../StatementCont';
import { Statement } from '@/types/statement/StatementTypes';
import { QuestionStep } from '@/types/TypeEnums';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useSelector } from 'react-redux';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { setVoteToStore } from '@/redux/vote/votesSlice';

let getVoteFromDB = false;

const StatementVote: FC = () => {
	// * Hooks * //
	const dispatch = useAppDispatch();
	const { t } = useUserConfig();
	const { user } = useAuthentication();
	const { statement } = useContext(StatementContext);
	const subStatements = useSelector(
		statementSubsSelector(statement?.statementId)
	);

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
		if (!getVoteFromDB) {
			getToVoteOnParent(
				statement?.statementId,
				user.uid,
				(option: Statement) => dispatch(setVoteToStore(option))
			);
			getVoteFromDB = true;
		}
	}, [statement?.statementId, dispatch]);

	return (
		<>
			<div className='statement-vote'>
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
				<div className='number-of-votes-mark'>
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

			<div className='page__footer'>
				<StatementBottomNav />
			</div>
		</>
	);
};

export default StatementVote;
