import useTopSuggestions from './TopSuggestionVM';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import { useEffect } from 'react';
import Loader from '@/view/components/loaders/Loader';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';
import SuggestionCard from '../../statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard';
import styles from './TopSuggestions.module.scss';

const TopSuggestions = () => {
	const { t } = useUserConfig();
	const { navigateToVoting, loadingStatements, topStatements, statement } = useTopSuggestions();
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
		<>
			<h1>{t("Question")}: {statement?.statement}</h1>
			<h3>{t('Please rate the following leading suggestions')}</h3>
			{loadingStatements ? (
				<div style={{ margin: "0 auto", padding: "1rem" }}>
					<Loader />
				</div>
			) : (
				<div className={styles['suggestions-container']}>
					{topStatements.map((statement) => (
						<div key={statement.statementId} className={styles['suggestion-wrapper']}>
							<SuggestionCard
								statement={statement}
								parentStatement={statement}
								siblingStatements={topStatements}
								positionAbsolute={false}
							/>
						</div>
					))}
				</div>
			)}

			<FooterMassConsensus
				isNextActive={true}
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
