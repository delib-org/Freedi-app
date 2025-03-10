import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';

import { MassConsensusPageUrls, SelectionFunction } from 'delib-npm';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useRandomSuggestions } from './RandomSuggestionsVM';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const RandomSuggestions = () => {
	const { navigateToTop } = useRandomSuggestions();
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
			<div className='wrapper'>
				<SuggestionCards selectionFunction={SelectionFunction.random} />
			</div>
			<FooterMassConsensus
				isNextActive={true}
				onNext={navigateToTop}
				goTo={MassConsensusPageUrls.topSuggestions}
			/>
		</>
	);
};

export default RandomSuggestions;
