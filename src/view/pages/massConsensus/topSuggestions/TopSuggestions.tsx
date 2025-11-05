import useTopSuggestions from './TopSuggestionVM';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useEffect, useState } from 'react';
import Loader from '@/view/components/loaders/Loader';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';
import SimpleSuggestionCards from '../../statement/components/evaluations/components/simpleSuggestionCards/SimpleSuggestionCards';
import StageExplanationScreen from '@/view/components/massConsensus/StageExplanationScreen/StageExplanationScreen';
import { useExplanations } from '@/contexts/massConsensus/ExplanationProvider';
import { useParams } from 'react-router';

const TopSuggestions = () => {
	const { t } = useTranslation();
	const { statementId } = useParams<{ statementId: string }>();
	const { navigateToVoting, loadingStatements, topStatements, statement } = useTopSuggestions();
	const { trackStageCompleted, trackStageSkipped } = useMassConsensusAnalytics();
	const [showExplanation, setShowExplanation] = useState(true);
	const { hasSeenExplanation, getDontShowExplanations } = useExplanations();

	const { setHeader } = useHeader();

	useEffect(() => {
		setHeader({
			title: t('Leading suggestion evaluation'),
			backToApp: false,
			isIntro: false,
		});
	}, []);

	// Check if we should show explanation
	useEffect(() => {
		if (hasSeenExplanation('topSuggestions') || getDontShowExplanations()) {
			setShowExplanation(false);
		}
	}, []);

	// Show full-screen explanation if needed
	if (showExplanation) {
		return (
			<StageExplanationScreen
				stageId="topSuggestions"
				onContinue={() => setShowExplanation(false)}
				previousStageUrl={`/mass-consensus/${statementId}/random-suggestions`}
			/>
		);
	}

	return (
		<>
			<h1>{t("Question")}: {statement?.statement}</h1>
			<h3>{t('Please rate the following leading suggestions')}</h3>
			{loadingStatements ? (
				<div style={{ margin: "0 auto", padding: "1rem" }}>
					<Loader />
				</div>
			) : (
				<SimpleSuggestionCards
					subStatements={topStatements}
				/>
			)}

			<FooterMassConsensus
				isNextActive={true}
				canSkip={false}
				onNext={() => {
					trackStageCompleted('top_suggestions');
					navigateToVoting();
				}}
				onSkip={() => trackStageSkipped('top_suggestions')}
			/>
		</>
	);
};

export default TopSuggestions;
