import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import { MassConsensusPageUrls } from '@/types/enums'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { SelectionFunction } from '@/types/evaluation/evaluationTypes'
import { useRandomSuggestions } from './RandomSuggestionsVM'
import { Link, useParams } from 'react-router'

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
