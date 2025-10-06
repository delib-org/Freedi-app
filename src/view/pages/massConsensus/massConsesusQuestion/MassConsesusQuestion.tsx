import { useEffect, useRef, useState } from 'react';
import Loader from '@/view/components/loaders/Loader';
import InitialQuestion from './initialQuestion/InitialQuestion';
import useMassConsensusQuestion from './MassConsensusQuestionVM';
import SimilarSuggestions from './similarSuggestions/SimilarSuggestions';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';
import StageExplanation from '@/view/components/massConsensus/StageExplanation/StageExplanation';
import ActionFeedback from '@/view/components/massConsensus/ActionFeedback/ActionFeedback';
import { useNavigate, useParams } from 'react-router';
import { ExplanationConfig, PostActionConfig, MassConsensusStageType } from 'delib-npm';

import styles from './MassConsesusQuestion.module.scss'
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

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
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();

	// State for showing feedback after submission
	const [showFeedback, setShowFeedback] = useState(false);
	const [userSuggestionsCount, setUserSuggestionsCount] = useState(0);

	// Default explanation for question stage
	const questionExplanation: ExplanationConfig = {
		enabled: true,
		title: t('Share Your Suggestion'),
		content: t('Submit your idea for this question. Your suggestion will be randomly shown to other participants for evaluation. Similar ideas will be grouped together.'),
		displayMode: 'card',
		showOnlyFirstTime: true,
		dismissible: true
	};

	// Default post-action feedback
	const submissionFeedback: PostActionConfig = {
		enabled: true,
		content: t('Your suggestion has been successfully added!'),
		successMessage: t('It will now be randomly shown to other participants for evaluation.'),
		buttons: [
			{ label: t('View My Suggestions'), action: 'viewMySuggestions' as const, primary: false },
			{ label: t('Add Another'), action: 'addAnother' as const, primary: false },
			{ label: t('Continue'), action: 'continue' as const, primary: true }
		],
		displayMode: 'modal'
	};

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
		// Don't show feedback immediately after submission
		// The feedback should only show after the user completes the similar suggestions stage
	}, [stage, trackSubmission]);

  const handleNextWithTracking = () => {
    if (stage === "suggestions") {
      trackStageCompleted("question");
      // Show feedback after user completes the similar suggestions selection
      setShowFeedback(true);
      setUserSuggestionsCount(prev => prev + 1);
    } else {
      handleNext();
    }
  };

  const handleSkipWithTracking = () => {
    trackStageSkipped("question");
  };

	const nextActive = !isBusy && ifButtonEnabled;

	// Handlers for feedback actions
	const handleFeedbackContinue = () => {
		setShowFeedback(false);
		handleNext();
	};

	const handleFeedbackAddAnother = () => {
		setShowFeedback(false);
		setStage('question');
		// Reset the form (this will be handled in InitialQuestion)
	};

	return (
		<>
			{/* Show explanation at the beginning */}
			{stage === 'question' && (
				<StageExplanation
					stageId="question"
					explanation={questionExplanation}
				/>
			)}

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

			{/* Show feedback after successful submission */}
			{showFeedback && (
				<ActionFeedback
					stageId="question"
					config={submissionFeedback}
					suggestionCount={userSuggestionsCount}
					onContinue={handleFeedbackContinue}
					onAddAnother={handleFeedbackAddAnother}
					onDismiss={() => setShowFeedback(false)}
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
