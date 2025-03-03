import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus'
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards'
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useRandomSuggestions } from './RandomSuggestionsVM';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { selectMassConsensusTexts } from '@/redux/massConsensus/massConsensusSlice';
import { useSelector } from 'react-redux';
import { useParams } from 'react-router';

const RandomSuggestions = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const { navigateToTop } = useRandomSuggestions();
	const { t } = useLanguage();
	const massConsensusTexts = useSelector(selectMassConsensusTexts(statementId));

	return (
		<>
			<HeaderMassConsensus
				backTo={MassConsensusPageUrls.initialQuestion}
				title={t("General suggestion evaluation")}
			/>
			<TitleMassConsensus title={massConsensusTexts ? massConsensusTexts.texts?.randomSuggestions : t("please rate the following suggestions")} />
			<div className="wrapper">
				<SuggestionCards selectionFunction={SelectionFunction.random} />
			</div>
			<FooterMassConsensus isNextActive={true} onNext={navigateToTop} goTo={MassConsensusPageUrls.topSuggestions} />
		</>
	);
};

export default RandomSuggestions;
