import { FC, useContext, useMemo } from 'react';
import { CompoundPhase } from '@freedi/shared-types';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useCompoundSubQuestions } from '@/controllers/hooks/compoundQuestion/useCompoundSubQuestions';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import CompoundPhaseStepper from './components/CompoundPhaseStepper';
import PhaseAdminControls from './components/PhaseAdminControls';
import PhaseSection from './components/PhaseSection';
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
	const { t } = useTranslation();
	const { statement } = useContext(StatementContext);
	const { currentPhase } = useCompoundPhase(statement);
	const { subQuestions } = useCompoundSubQuestions(statement);

	const currentIndex = PHASE_ORDER.indexOf(currentPhase);

	const phaseSummaries = useMemo((): Record<CompoundPhase, string> => {
		const lockedTitle = statement?.questionSettings?.compoundSettings?.lockedTitle?.lockedText;
		const subCount = subQuestions.length;

		return {
			[CompoundPhase.defineQuestion]: lockedTitle
				? `${t('Define Question')}: ${lockedTitle}`
				: t('Define Question'),
			[CompoundPhase.subQuestions]: subCount > 0
				? `${t('Sub-Questions')}: ${subCount} ${t('defined')}`
				: t('Sub-Questions'),
			[CompoundPhase.findSolutions]: t('Find Solutions'),
			[CompoundPhase.resolution]: t('Resolution'),
		};
	}, [statement, subQuestions.length, t]);

	if (!statement) return null;

	return (
		<div className={styles.compoundWrapper}>
			<CompoundPhaseStepper currentPhase={currentPhase} />
			<PhaseAdminControls statement={statement} />
			{PHASE_ORDER.map((phase, index) => {
				if (index > currentIndex) return null;

				const PhaseComponent = PHASE_COMPONENTS[phase];
				const isCompleted = index < currentIndex;

				return (
					<PhaseSection
						key={phase}
						summary={phaseSummaries[phase]}
						isCompleted={isCompleted}
					>
						<PhaseComponent />
					</PhaseSection>
				);
			})}
		</div>
	);
};

export default CompoundQuestion;
