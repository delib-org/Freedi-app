import { FC, ReactNode } from 'react';
import './QuestionStageRadioBtn.scss';
import ArrowUp from '@/assets/icons/arrowUpIcon.svg?react';
import EvaluationsIcon from '@/assets/icons/evaluations2Icon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import { setQuestionStage } from '@/controllers/db/statements/statementMetaData/setStatementMetaData';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useLanguage } from '@/controllers/hooks/useLanguages';
import { statementMetaDataSelector } from '@/redux/statements/statementsMetaSlice';
import { Statement } from '@/types/statement/Statement';
import { getStepInfo } from './helpers';
import { QuestionStep } from '@/types/TypeEnums';

interface Props {
	step: QuestionStep;
	statement: Statement;
}

const QuestionStageRadioBtn: FC<Props> = ({ step, statement }) => {
	const { t } = useLanguage();
	const isSelected = statement.questionSettings?.currentStep === step;
	const { backgroundColor, btnBackgroundColor } = getStepInfo(
		step,
		isSelected
	);
	const stepInfo = getStepsInfo(step);
	const numberOfEvaluators =
		useAppSelector(statementMetaDataSelector(statement.statementId))
			?.numberOfEvaluators || 0;

	return (
		<div
			className='question-stage-radio-btn'
			style={{ transform: isSelected ? 'scale(1.04)' : 'scale(1)' }}
		>
			<div
				className='question-stage-radio-btn__top'
				style={{
					backgroundColor: backgroundColor,
					opacity: isSelected ? 1 : 0.5,
				}}
			>
				{stepInfo ? stepInfo.icon : <LightBulbIcon className='img' />}
				{step === QuestionStep.suggestion && (
					<div className='number'>{numberOfEvaluators}</div>
				)}
			</div>
			<button
				className='question-stage-radio-btn__radio'
				onClick={() => {
					setQuestionStage({
						statementId: statement.statementId,
						step,
					});
				}}
			>
				<div
					className='radio-button'
					style={{ backgroundColor: btnBackgroundColor }}
				>
					<input
						type='radio'
						name='question-stage'
						id={`question-stage-${step}`}
					/>
					<div className='radio-button__inner'></div>
				</div>
				{t(stepInfo ? stepInfo.name : step)}
			</button>
		</div>
	);
};

export default QuestionStageRadioBtn;

export interface StepInfo {
	name: string;
	icon: ReactNode;
	color: string;
	message: string | undefined;
}

export function getStepsInfo(
	questionStep?: QuestionStep
): StepInfo | undefined {
	try {
		if (!questionStep) {
			return undefined;
		}

		switch (questionStep) {
			case QuestionStep.explanation:
				return {
					name: 'Explanation',
					icon: <LightBulbIcon className='img' />,
					color: '--green',
					message: undefined,
				};

			case QuestionStep.suggestion:
				return {
					name: 'Suggestions',
					icon: <LightBulbIcon className='img' />,
					color: '--settings-suggestions',
					message: 'Please suggest a solution to the question',
				};

			case QuestionStep.randomEvaluation:
				return {
					name: 'Random options',
					icon: <EvaluationsIcon className='img' />,
					color: '--settings-first-evaluation',
					message: `Please evaluate each solution in the next set of solutions. For each solution, indicate your rating using the smiley (positive) or frown (negative) icons`,
				};

			case QuestionStep.topEvaluation:
				return {
					name: 'Top options',
					icon: <ArrowUp className='img' />,
					color: '--settings-second-evaluation',
					message: 'Please evaluate the top solutions',
				};

			case QuestionStep.voting:
				return {
					name: 'Voting',
					icon: <HandIcon className='img' />,
					color: '--settings-voting',
					message: 'Please chose your preferred solution',
				};

			case QuestionStep.finished:
				return {
					name: 'Finished',
					icon: <FlagIcon className='img' />,
					color: '--settings-finished',
					message:
						'The voting process for this question has concluded',
				};

			default:
				return undefined;
		}
	} catch (error) {
		console.error(error);

		return undefined;
	}
}
