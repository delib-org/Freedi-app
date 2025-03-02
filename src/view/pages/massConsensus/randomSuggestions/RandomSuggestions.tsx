import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useRandomSuggestions } from './RandomSuggestionsVM';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import MassConsensusFooter from '../MassConsensusFooter/MassConsensusFooter';

const RandomSuggestions = () => {
	useRandomSuggestions();
	const { t } = useUserConfig();

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.initialQuestion}
				title={t('General suggestion evaluation')}
			/>
			<TitleMassConsensus
				title={t('please rate the following suggestions')}
			/>
			<SuggestionCards selectionFunction={SelectionFunction.random} />
			<MassConsensusFooter goTo={MassConsensusPageUrls.topSuggestions} />
		</>
	);
};

export default RandomSuggestions;
