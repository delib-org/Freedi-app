import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { useRandomSuggestions } from './RandomSuggestionsVM';
import FooterMassConsensus from '../footerMassConsesus/footerMassConsesus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';

const RandomSuggestions = () => {
	useRandomSuggestions();

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.initialQuestion}
				title='random suggestions'
			/>
			<TitleMassConsensus title="please rate the random suggestions" />
			<SuggestionCards selectionFunction={SelectionFunction.random} />
			<FooterMassConsensus goTo={MassConsensusPageUrls.topSuggestions} />
		</>
	);
};

export default RandomSuggestions;
