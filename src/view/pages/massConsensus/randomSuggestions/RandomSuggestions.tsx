import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../footerMassConsesus/FooterMassConsesus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useRandomSuggestions } from './RandomSuggestionsVM';
import { useLanguage } from '@/controllers/hooks/useLanguages';

const RandomSuggestions = () => {
	useRandomSuggestions();
	const { t } = useLanguage();

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.initialQuestion}
				title={t("General suggestion evaluation")}
			/>
			<TitleMassConsensus title={t("please rate the following suggestions")} />
			<SuggestionCards selectionFunction={SelectionFunction.random} />
			<FooterMassConsensus goTo={MassConsensusPageUrls.topSuggestions} />
		</>
	);
};

export default RandomSuggestions;
