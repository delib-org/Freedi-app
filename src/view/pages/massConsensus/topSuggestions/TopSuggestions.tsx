import { MassConsensusPageUrls, SortType, SelectionFunction } from 'delib-npm';
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';
import useTopSuggestions from './TopSuggestionVM';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useEffect } from 'react';

const TopSuggestions = () => {
	const { t } = useUserConfig();
	const { navigateToVoting } = useTopSuggestions();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('Leading suggestion evaluation'),
			backTo: MassConsensusPageUrls.randomSuggestions,
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	return (
		<div>
			<TitleMassConsensus
				title={t('Please rate the following suggestions')}
			/>
			<SuggestionCards
				selectionFunction={SelectionFunction.top}
				propSort={SortType.random}
			/>
			<FooterMassConsensus
				isNextActive={true}
				onNext={navigateToVoting}
				goTo={MassConsensusPageUrls.voting}
			/>
		</div>
	);
};

export default TopSuggestions;
