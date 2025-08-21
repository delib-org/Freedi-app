import { SortType, SelectionFunction } from 'delib-npm';
import SuggestionCards from '../../statement/components/evaluations/components/suggestionCards/SuggestionCards';
import useTopSuggestions from './TopSuggestionVM';
import TitleMassConsensus from '../TitleMassConsensus/TitleMassConsensus';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useEffect } from 'react';
import Loader from '@/view/components/loaders/Loader';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';

const TopSuggestions = () => {
	const { t } = useUserConfig();
	const { navigateToVoting, loadingStatements } = useTopSuggestions();
	const { trackStageCompleted, trackStageSkipped } = useMassConsensusAnalytics();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('Leading suggestion evaluation'),
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
			{loadingStatements ? (
				<Loader />
			) : (
				<SuggestionCards
					selectionFunction={SelectionFunction.top}
					propSort={SortType.random}
				/>
			)}

			<FooterMassConsensus
				isNextActive={true}
				onNext={() => {
					trackStageCompleted('top_suggestions');
					navigateToVoting();
				}}
				onSkip={() => trackStageSkipped('top_suggestions')}
			/>
		</div>
	);
};

export default TopSuggestions;
