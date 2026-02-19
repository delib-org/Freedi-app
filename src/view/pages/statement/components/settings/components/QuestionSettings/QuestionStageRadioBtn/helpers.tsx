import { ReactNode } from 'react';
import { QuestionStep } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import ArrowUp from '@/assets/icons/arrowUpIcon.svg?react';
import EvaluationsIcon from '@/assets/icons/evaluations2Icon.svg?react';
import FlagIcon from '@/assets/icons/flagIcon.svg?react';
import HandIcon from '@/assets/icons/handIcon.svg?react';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import styles from './QuestionStageRadioBtn.module.scss';

export interface StepInfo {
	name: string;
	icon: ReactNode;
	color: string;
	message: string | undefined;
}

export function getStepsInfo(questionStep?: QuestionStep): StepInfo | undefined {
	try {
		if (!questionStep) {
			return undefined;
		}

		switch (questionStep) {
			case QuestionStep.explanation:
				return {
					name: 'Explanation',
					icon: <LightBulbIcon className={styles.img} />,
					color: '--green',
					message: undefined,
				};

			case QuestionStep.suggestion:
				return {
					name: 'Suggestions',
					icon: <LightBulbIcon className={styles.img} />,
					color: '--settings-suggestions',
					message: 'Please suggest a solution to the question',
				};

			case QuestionStep.randomEvaluation:
				return {
					name: 'Random options',
					icon: <EvaluationsIcon className={styles.img} />,
					color: '--settings-first-evaluation',
					message: `Please evaluate each solution in the next set of solutions. For each solution, indicate your rating using the smiley (positive) or frown (negative) icons`,
				};

			case QuestionStep.topEvaluation:
				return {
					name: 'Top options',
					icon: <ArrowUp className={styles.img} />,
					color: '--settings-second-evaluation',
					message: 'Please evaluate the top solutions',
				};

			case QuestionStep.voting:
				return {
					name: 'Voting',
					icon: <HandIcon className={styles.img} />,
					color: '--settings-voting',
					message: 'Please chose your preferred solution',
				};

			case QuestionStep.finished:
				return {
					name: 'Finished',
					icon: <FlagIcon className={styles.img} />,
					color: '--settings-finished',
					message: 'The voting process for this question has concluded',
				};

			default:
				return undefined;
		}
	} catch (error) {
		logError(error, { operation: 'QuestionStageRadioBtn.helpers.getStepsInfo' });

		return undefined;
	}
}

export function getStepInfo(
	step: QuestionStep,
	isSelected = true,
): {
	backgroundColor: string;
	btnBackgroundColor: string;
	stageInfo: StepInfo | undefined;
	error?: boolean;
} {
	try {
		const stageInfo: StepInfo | undefined = getStepsInfo(step);
		if (!stageInfo) throw new Error('Stage info not found');

		const backgroundColor = stageInfo ? `var(${stageInfo.color})` : 'var(--green)';
		let btnBackgroundColor = '#DCE7FF';

		if (stageInfo) {
			btnBackgroundColor = isSelected ? `var(${stageInfo.color})` : '#DCE7FF';
		}

		return { backgroundColor, btnBackgroundColor, stageInfo };
	} catch (error) {
		logError(error, { operation: 'QuestionStageRadioBtn.helpers.getStepInfo' });

		return {
			backgroundColor: 'var(--green)',
			btnBackgroundColor: '#DCE7FF',
			stageInfo: undefined,
			error: true,
		};
	}
}
