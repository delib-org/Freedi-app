import { useEffect, useRef, useState } from 'react';
import Loader from '@/view/components/loaders/Loader';
import InitialQuestion from './initialQuestion/InitialQuestion';
import useMassConsensusQuestion from './MassConsensusQuestionVM';
import SimilarSuggestions from './similarSuggestions/SimilarSuggestions';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';

import styles from './MassConsesusQuestion.module.scss'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import BouncingLoader from '@/view/components/loaders/BouncingLoader';

const MassConsensusQuestion = () => {
  const {
    stage,
    setStage,
    handleNext,
    ifButtonEnabled,
    setIfButtonEnabled,
    reachedLimit,
    setReachedLimit,
  } = useMassConsensusQuestion();
  const { trackStageCompleted, trackSubmission, trackStageSkipped } =
    useMassConsensusAnalytics();

	const isBusy = stage === 'loading' || stage === 'submitting';
	const { t } = useUserConfig();
	const [showLoader, setShowLoader] = useState(false);
	const loaderStartRef = useRef<number | null>(null);

	useEffect(() => {
		if (isBusy) {
			loaderStartRef.current = Date.now();
			const showId = window.setTimeout(() => setShowLoader(true), 250);

			return () => window.clearTimeout(showId);
		} else {
			if (loaderStartRef.current !== null) {
				const elapsed = Date.now() - loaderStartRef.current;
				const wait = Math.max(0, 500 - elapsed);
				const hideId = window.setTimeout(() => setShowLoader(false), wait);
				loaderStartRef.current = null;

				return () => window.clearTimeout(hideId);
			}
			setShowLoader(false);
		}
	}, [isBusy]);
	// Track submission when stage changes from question to loading
	useEffect(() => {
		if (stage === 'loading') {
			trackSubmission('answer');
		}
	}, [stage, trackSubmission]);

  const handleNextWithTracking = () => {
    if (stage === "suggestions") {
      trackStageCompleted("question");
    }
    handleNext();
  };

  const handleSkipWithTracking = () => {
    trackStageSkipped("question");
  };

	const nextActive = !isBusy && ifButtonEnabled;

	return (
		<>
			{(stage === 'question' || stage === 'loading') ? (
				<InitialQuestion
					setReachedLimit={setReachedLimit}
					stage={stage}
					setStage={setStage}
					setIfButtonEnabled={setIfButtonEnabled}
				/>
			) : (
				<SimilarSuggestions
					stage={stage}
					setIfButtonEnabled={setIfButtonEnabled}
				/>
			)}

			{showLoader && (
				<div
					className={styles.loaderOverlay}
					role="status"
					aria-live="polite"
					aria-busy="true"
				>
					<h2 className={styles.loaderText}>
						{t('Looking for similar suggestions... please wait.')}
					</h2>
					<Loader />
				</div>
			)}

			{reachedLimit ? (
				<FooterMassConsensus
					onNext={() => { }}
					isNextActive={false}
					blockNavigation={false}
				/>
			) : (
				<FooterMassConsensus
					onNext={handleNextWithTracking}
					isNextActive={nextActive}
					blockNavigation={true}
					onSkip={handleSkipWithTracking}
				/>
			)}
		</>
	);
};

export default MassConsensusQuestion;
