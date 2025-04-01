import { useEffect, useState } from 'react';
import { VotingSuggestionsMV } from './VotingSuggestionsMV';
import VotingArea from '../../statement/components/vote/components/votingArea/VotingArea';
import Modal from '@/view/components/modal/Modal';
import StatementInfo from '../../statement/components/vote/components/info/StatementInfo';
import styles from './VotingSuggestion.module.scss';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { MassConsensusPageUrls, Statement } from 'delib-npm';
import { getTotalVoters } from '../../statement/components/vote/statementVoteCont';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';

const VotingSuggestions = () => {
	const { subStatements, navigateToFeedback } = VotingSuggestionsMV();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] =
		useState(false);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(
		undefined
	);
	const totalVotes = getTotalVoters(statement);
	const { t } = useUserConfig();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('Voting'),
			backTo: MassConsensusPageUrls.topSuggestions,
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	return (
		<>
			<TitleMassConsensus
				title={t('Please vote for the best suggestion')}
			/>

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
				isNextActive={true}
				onNext={navigateToFeedback}
			/>
		</>
	);
};

export default VotingSuggestions;
