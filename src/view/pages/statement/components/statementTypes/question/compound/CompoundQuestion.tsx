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

const PHASE_ORDER = [
	CompoundPhase.defineQuestion,
	CompoundPhase.subQuestions,
	CompoundPhase.findSolutions,
	CompoundPhase.resolution,
] as const;

const PHASE_COMPONENTS: Record<CompoundPhase, FC> = {
	[CompoundPhase.defineQuestion]: DefineQuestionPhase,
	[CompoundPhase.subQuestions]: SubQuestionsPhase,
	[CompoundPhase.findSolutions]: FindSolutionsPhase,
	[CompoundPhase.resolution]: ResolutionPhase,
};

const CompoundQuestion: FC = () => {
	const { statement } = useContext(StatementContext);
	const { currentPhase } = useCompoundPhase(statement);

	if (!statement) return null;

	const currentIndex = PHASE_ORDER.indexOf(currentPhase);

	return (
		<div className={styles.compoundWrapper}>
			<CompoundPhaseStepper currentPhase={currentPhase} />
			<PhaseAdminControls statement={statement} />
			{PHASE_ORDER.map((phase, index) => {
				if (index > currentIndex) return null;

				const PhaseComponent = PHASE_COMPONENTS[phase];

				return (
					<div key={phase} className="compound-question__phase-content">
						<PhaseComponent />
					</div>
				);
			})}
		</div>
	);
};

export default CompoundQuestion;
