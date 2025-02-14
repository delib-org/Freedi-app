import { QuestionStep } from '@/types/TypeEnums';
import { StepInfo, getStepsInfo } from './QuestionStageRadioBtn';

export function getStepInfo(
	step: QuestionStep,
	isSelected = true
): {
	backgroundColor: string;
	btnBackgroundColor: string;
	stageInfo: StepInfo | undefined;
	error?: boolean;
} {
	try {
		const stageInfo: StepInfo | undefined = getStepsInfo(step);
		if (!stageInfo) throw new Error('Stage info not found');

		const backgroundColor = stageInfo
			? `var(${stageInfo.color})`
			: 'var(--green)';
		let btnBackgroundColor = '#DCE7FF';

		if (stageInfo) {
			btnBackgroundColor = isSelected
				? `var(${stageInfo.color})`
				: '#DCE7FF';
		}

		return { backgroundColor, btnBackgroundColor, stageInfo };
	} catch (error) {
		console.error(error);

		return {
			backgroundColor: 'var(--green)',
			btnBackgroundColor: '#DCE7FF',
			stageInfo: undefined,
			error: true,
		};
	}
}
