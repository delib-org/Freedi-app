import { FC, useContext, useEffect, useState } from 'react';
import StatementBottomNav from '../nav/bottom/StatementBottomNav';
import { getStagesInfo } from '../settings/components/QuestionSettings/QuestionStageRadioBtn/QuestionStageRadioBtn';
import StatementInfo from './components/info/StatementInfo';
import VotingArea from './components/votingArea/VotingArea';
import { getTotalVoters } from './statementVoteCont';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import X from '@/assets/icons/x.svg?react';
import { getToVoteOnParent } from '@/controllers/db/vote/getVotes';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { setVoteToStore } from '@/model/vote/votesSlice';

// Custom components
import Button from '@/view/components/buttons/button/Button';
import Modal from '@/view/components/modal/Modal';
import './StatementVote.scss';

// Helpers
import Toast from '@/view/components/toast/Toast';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { StatementContext } from '../../StatementCont';
import { Statement } from '@/types/statement';
import { QuestionStage } from '@/types/enums';

let getVoteFromDB = false;

const StatementVote: FC = () => {
	// * Hooks * //
	const dispatch = useAppDispatch();
	const { t } = useLanguage();
	const { statement } = useContext(StatementContext);
	const subStatements: Statement[] = [];

	const currentStage = statement?.questionSettings?.currentStage;
	const isCurrentStageVoting = currentStage === QuestionStage.voting;
	const stageInfo = getStagesInfo(currentStage);
	const toastMessage = stageInfo ? stageInfo.message : '';

	// * Use State * //
	const [showMultiStageMessage, setShowMultiStageMessage] =
		useState(isCurrentStageVoting);
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] =
		useState(false);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(
		undefined
	);

	// * Variables * //
	const totalVotes = getTotalVoters(statement);

	useEffect(() => {
		if (!getVoteFromDB) {
			getToVoteOnParent(statement?.statementId, (option: Statement) =>
				dispatch(setVoteToStore(option))
			);
			getVoteFromDB = true;
		}
	}, [statement?.statementId, dispatch]);

	return (
		<>
			<div className='page__main'>
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
								bckColor='var(--crimson)'
								color='var(--white)'
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
			</div>
			<div className='page__footer'>
				<StatementBottomNav />
			</div>
		</>
	);
};

export default StatementVote;
