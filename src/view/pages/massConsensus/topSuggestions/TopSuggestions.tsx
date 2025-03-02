import { MassConsensusPageUrls, SortType } from '@/types/TypeEnums';
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';
import HeaderMassConsensus from '../headerMassConsensus/HeaderMassConsensus';
import useTopSuggestions from './TopSuggestionVM';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { SelectionFunction } from '@/types/evaluation/Evaluation';
import MassConsensusFooter from '../MassConsensusFooter/MassConsensusFooter';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

const TopSuggestions = () => {
	const { t } = useUserConfig();
	useTopSuggestions();

	return (
		<div>
			<HeaderMassConsensus
				title={t('leading suggestion evaluation')}
				backTo={MassConsensusPageUrls.randomSuggestions}
			/>
			<TitleMassConsensus
				title={t('please rate the following suggestions')}
			/>
			<div className='wrapper'>
				<SuggestionCards
					selectionFunction={SelectionFunction.top}
					propSort={SortType.random}
				/>
			</div>
			<MassConsensusFooter goTo={MassConsensusPageUrls.voting} />
		</div>
	);
};

export default TopSuggestions;
