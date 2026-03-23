import { FC, useContext } from 'react';
import { CompoundPhase } from '@freedi/shared-types';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import CompoundPhaseStepper from './components/CompoundPhaseStepper';
import PhaseAdminControls from './components/PhaseAdminControls';
import DefineQuestionPhase from './phases/DefineQuestionPhase';
import SubQuestionsPhase from './phases/SubQuestionsPhase';
import FindSolutionsPhase from './phases/FindSolutionsPhase';
import ResolutionPhase from './phases/ResolutionPhase';
import styles from './CompoundQuestion.module.scss';

const CompoundQuestion: FC = () => {
	const { statement } = useContext(StatementContext);
	const { currentPhase } = useCompoundPhase(statement);

	if (!statement) return null;

	const renderPhase = () => {
		switch (currentPhase) {
			case CompoundPhase.defineQuestion:
				return <DefineQuestionPhase />;
			case CompoundPhase.subQuestions:
				return <SubQuestionsPhase />;
			case CompoundPhase.findSolutions:
				return <FindSolutionsPhase />;
			case CompoundPhase.resolution:
				return <ResolutionPhase />;
			default:
				return <DefineQuestionPhase />;
		}
	};

	return (
		<div className={styles.compoundWrapper}>
			<CompoundPhaseStepper currentPhase={currentPhase} />
			<PhaseAdminControls statement={statement} />
			<div className="compound-question__phase-content">{renderPhase()}</div>
		</div>
	);
};

export default CompoundQuestion;
