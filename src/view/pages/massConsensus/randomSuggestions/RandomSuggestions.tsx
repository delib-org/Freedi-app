import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../footerMassConsesus/footerMassConsesus';

const RandomSuggestions = () => {

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.initialQuestion}
			/>
			<div>RandomSuggestions</div>
			<SuggestionCards selectionFunction={SelectionFunction.random} />
			<FooterMassConsensus goTo={MassConsensusPageUrls.topSuggestions}/>
		</>
	);
};

export default RandomSuggestions;
