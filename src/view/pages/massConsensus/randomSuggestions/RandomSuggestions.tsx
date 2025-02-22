import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../footerMassConsesus/footerMassConsesus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useRandomSuggestions } from './RandomSuggestionsVM';

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
