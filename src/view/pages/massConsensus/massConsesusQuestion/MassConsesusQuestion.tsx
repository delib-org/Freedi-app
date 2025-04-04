import Loader from '@/view/components/loaders/Loader';
import InitialQuestion from "./initialQuestion/InitialQuestion";
import useMassConsensusQuestion from "./MassConsesusQuestionVM"
import SimilarSuggestions from "./similarSuggestions/SimilarSuggestions";
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';

const MassConsensusQuestion = () => {
    const { stage, updateStage, handleNext, ifButtonEnabled, setIfButtonEnabled } = useMassConsensusQuestion();
    
    return (
        <>
            { (stage === "question" || (stage === "loading"))?
             <InitialQuestion stage={stage} updateStage={updateStage} setIfButtonEnabled={setIfButtonEnabled} /> 
             : <SimilarSuggestions stage={stage} setIfButtonEnabled={setIfButtonEnabled}/> }

            { (stage === "loading" || stage === "submitting")? <Loader/> : null }
             
            <FooterMassConsensus
				onNext={handleNext}
				isNextActive={ifButtonEnabled}
                blockNavigation={true}
			/>
        </>
    )
}

export default MassConsensusQuestion