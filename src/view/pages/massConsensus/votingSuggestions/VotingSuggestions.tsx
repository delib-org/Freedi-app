import { useState } from 'react';
import { VotingSuggestionsMV } from './VotingSuggestionsMV';
import VotingArea from '../../statement/components/vote/components/votingArea/VotingArea';
import Modal from '@/view/components/modal/Modal';
import StatementInfo from '../../statement/components/vote/components/info/StatementInfo';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import styles from './VotingSuggestion.module.scss';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import { Statement } from '@/types/statement/Statement';
import { getTotalVoters } from '../../statement/components/vote/statementVoteCont';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsesus/FooterMassConsesus';

const VotingSuggestions = () => {
	const { subStatements } = VotingSuggestionsMV();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] =
		useState(false);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(
		undefined
	);
	const totalVotes = getTotalVoters(statement);
	const { t } = useLanguage();

	return (
		<>
			<HeaderMassConsensus
				title={t('Voting')}
				backTo={MassConsensusPageUrls.topSuggestions}
			/>
			 <TitleMassConsensus title={t("please vote for the best suggestion")} />

			<div className={styles.voteGraph}>
				<VotingArea
					totalVotes={totalVotes}
					setShowInfo={setIsStatementInfoModalOpen}
					subStatements={subStatements}
					setStatementInfo={setStatementInfo}
				></VotingArea>
			</div>

			{isStatementInfoModalOpen && (
				<Modal>
					<StatementInfo
						statement={statementInfo}
						setShowInfo={setIsStatementInfoModalOpen}
					/>
				</Modal>
			)}
			
			<FooterMassConsensus
				goTo={MassConsensusPageUrls.leaveFeedback}
			></FooterMassConsensus>
		</>
	);
};

export default VotingSuggestions;
