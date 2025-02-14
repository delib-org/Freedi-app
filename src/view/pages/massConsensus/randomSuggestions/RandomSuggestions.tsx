import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { Link, useParams } from 'react-router'
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';

const RandomSuggestions = () => {
	const { statementId } = useParams()

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.initialQuestion}
			/>
			<div>RandomSuggestions</div>
			<SuggestionCards selectionFunction={SelectionFunction.random} />
			<Link className={"btn"} to={`/mass-consensus/${statementId}/${MassConsensusPageUrls.voting}`}>Next</Link>
		</>
	);
};

export default RandomSuggestions;
