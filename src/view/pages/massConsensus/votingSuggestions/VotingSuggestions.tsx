import { useState } from 'react';
import { VotingSuggestionsMV } from './VotingSuggestionsMV';
import { Statement } from '@/types/statement/statementTypes';
import VotingArea from '../../statement/components/vote/components/votingArea/VotingArea';
import Modal from '@/view/components/modal/Modal';
import StatementInfo from '../../statement/components/vote/components/info/StatementInfo';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { MassConsensusPageUrls } from '@/types/enums';
import styles from './VotingSuggestion.module.scss';
import { Link, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector } from '@/redux/statements/statementsSlice';

const VotingSuggestions = () => {
	const { subStatements } = VotingSuggestionsMV();
	const { statementId } = useParams();
	const statement = useSelector(statementSelector(statementId));
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] =
		useState(false);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(
		undefined
	);

	if (!subStatements) {
		if (subStatements.length === 0) return <p>no suggestions available.</p>;

		return <p>Loading</p>;
	}

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.topSuggestions}
			/>
			<h2 className={styles.title}>
				please vote for the best suggestion
			</h2>
			<div className={styles.voteGraph}>
				<VotingArea
					totalVotes={statement.totalEvaluators}
					setShowInfo={setIsStatementInfoModalOpen}
					subStatements={subStatements}
					setStatementInfo={setStatementInfo}
					isMassConsensus={true}
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
			<div className={styles.linkBtn}>
				<Link
					className='btn'
					to={`/mass-consensus/${statementId}/${MassConsensusPageUrls.voting}`}
				>
					back
				</Link>
				<Link
					className='btn'
					to={`/mass-consensus/${statementId}/${MassConsensusPageUrls.leaveFeedback}`}
				>
					finish
				</Link>
			</div>
		</>
	);
};

export default VotingSuggestions;
