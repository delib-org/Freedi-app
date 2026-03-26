import { FC, Fragment } from 'react';
import { CompoundPhase } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface PhaseStep {
	phase: CompoundPhase;
	labelKey: string;
}

const PHASES: PhaseStep[] = [
	{ phase: CompoundPhase.defineQuestion, labelKey: 'Define Question' },
	{ phase: CompoundPhase.subQuestions, labelKey: 'Sub-Questions' },
	{ phase: CompoundPhase.findSolutions, labelKey: 'Find Solutions' },
	{ phase: CompoundPhase.resolution, labelKey: 'Resolution' },
];

interface CompoundPhaseStepperProps {
	currentPhase: CompoundPhase;
	onPhaseClick?: (phase: CompoundPhase) => void;
}

const CompoundPhaseStepper: FC<CompoundPhaseStepperProps> = ({ currentPhase, onPhaseClick }) => {
	const { t } = useTranslation();

	const currentIndex = PHASES.findIndex((p) => p.phase === currentPhase);

	return (
		<div className="compound-stepper" role="navigation" aria-label={t('Compound question phases')}>
			{PHASES.map((step, index) => {
				const isCompleted = index < currentIndex;
				const isActive = index === currentIndex;

				const circleClass = [
					'compound-stepper__circle',
					isActive && 'compound-stepper__circle--active',
					isCompleted && 'compound-stepper__circle--completed',
				]
					.filter(Boolean)
					.join(' ');

				const labelClass = [
					'compound-stepper__label',
					isActive && 'compound-stepper__label--active',
					isCompleted && 'compound-stepper__label--completed',
				]
					.filter(Boolean)
					.join(' ');

				return (
					<Fragment key={step.phase}>
						{index > 0 && (
							<div
								className={`compound-stepper__connector${
									isCompleted ? ' compound-stepper__connector--completed' : ''
								}`}
							/>
						)}
						<div
							className={`compound-stepper__step${
								onPhaseClick ? ' compound-stepper__step--clickable' : ''
							}`}
							onClick={() => onPhaseClick?.(step.phase)}
							role={onPhaseClick ? 'button' : undefined}
							tabIndex={onPhaseClick ? 0 : undefined}
							onKeyDown={(e) => {
								if (onPhaseClick && (e.key === 'Enter' || e.key === ' ')) {
									e.preventDefault();
									onPhaseClick(step.phase);
								}
							}}
						>
							<div className={circleClass}>{isCompleted ? '✓' : index + 1}</div>
							<span className={labelClass}>{t(step.labelKey)}</span>
						</div>
					</Fragment>
				);
			})}
		</div>
	);
};

export default CompoundPhaseStepper;
