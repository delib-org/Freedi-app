import Loader from '@/view/components/loaders/Loader';
import InitialQuestion from './initialQuestion/InitialQuestion';
import useMassConsensusQuestion from './MassConsensusQuestionVM';
import SimilarSuggestions from './similarSuggestions/SimilarSuggestions';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';

const MassConsensusQuestion = () => {
	const {
		stage,
		updateStage,
		handleNext,
		ifButtonEnabled,
		setIfButtonEnabled,
		reachedLimit,
		setReachedLimit,
	} = useMassConsensusQuestion();

	return (
		<>
			{stage === 'question' || stage === 'loading' ? (
				<InitialQuestion
					setReachedLimit={setReachedLimit}
					stage={stage}
					updateStage={updateStage}
					setIfButtonEnabled={setIfButtonEnabled}
				/>
			) : (
				<SimilarSuggestions
					stage={stage}
					setIfButtonEnabled={setIfButtonEnabled}
				/>
			)}

			{stage === 'loading' || (stage === 'submitting' && <Loader />)}
			{reachedLimit ? (
				<FooterMassConsensus
					onNext={() => {}}
					isNextActive={false}
					blockNavigation={false}
				/>
			) : (
				<FooterMassConsensus
					onNext={handleNext}
					isNextActive={ifButtonEnabled}
					blockNavigation={true}
				/>
			)}
		</>
	);
};

export default MassConsensusQuestion;
