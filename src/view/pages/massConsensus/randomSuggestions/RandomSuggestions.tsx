import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import { MassConsensusPageUrls } from '@/types/enums'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { SelectionFunction } from '@/types/evaluation/evaluationTypes'
import { useRandomSuggestions } from './RandomSuggestionsVM'

const RandomSuggestions = () => {

	useRandomSuggestions()

	return (
		<>
			<HeaderMassConsensus backTo={MassConsensusPageUrls.initialQuestion} />
			<div>RandomSuggestions</div>
			<SuggestionCards selectionFunction={SelectionFunction.random} />
		</>

	)
}

export default RandomSuggestions