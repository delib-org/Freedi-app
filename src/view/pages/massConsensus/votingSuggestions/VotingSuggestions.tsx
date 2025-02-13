import { useState } from 'react';
import { VotingSuggestionsMV } from './VotingSuggestionsMV';
import { Statement } from '@/types/statement/statementTypes';
import VotingArea from '../../statement/components/vote/components/votingArea/VotingArea';
import Modal from '@/view/components/modal/Modal';
import StatementInfo from '../../statement/components/vote/components/info/StatementInfo';

const VotingSuggestions = () => {
	const { subStatements } = VotingSuggestionsMV();
	const [isStatementInfoModalOpen, setIsStatementInfoModalOpen] =
		useState(true);
	const [statementInfo, setStatementInfo] = useState<Statement | undefined>(
		undefined
	);

	return (
		<>
			<h1>voting</h1>

			<VotingArea
				totalVotes={5}
				setShowInfo={setIsStatementInfoModalOpen}
				subStatements={subStatements}
				setStatementInfo={setStatementInfo}
				isMassConsensus={true}
			></VotingArea>

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

export default VotingSuggestions;
