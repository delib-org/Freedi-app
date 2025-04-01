import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';
import { MassConsensusPageUrls, SelectionFunction } from 'delib-npm';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import { useRandomSuggestions } from './RandomSuggestionsVM';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useEffect } from 'react';
import Loader from '@/view/components/loaders/Loader';

const RandomSuggestions = () => {
	const { navigateToTop, loadingStatements } = useRandomSuggestions();
	const { t } = useUserConfig();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('General suggestion evaluation'),
			backTo: MassConsensusPageUrls.similarSuggestions,
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

	return (
		<>
			<TitleMassConsensus
				title={t('Please rate the following suggestions')}
			/>
			{loadingStatements ? (
				<Loader />
			) : (
				<SuggestionCards selectionFunction={SelectionFunction.random} />
			)}
			<FooterMassConsensus
				isNextActive={true}
				onNext={navigateToTop}
				goTo={MassConsensusPageUrls.topSuggestions}
			/>
		</>
	);
};

export default RandomSuggestions;
