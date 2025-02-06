import { QuestionStage } from '@/types/enums';
import { StageInfo, getStagesInfo } from './QuestionStageRadioBtn';

export function getStageInfo(
	stage: QuestionStage,
	isSelected = true
): {
	backgroundColor: string;
	btnBackgroundColor: string;
	stageInfo: StageInfo | undefined;
	error?: boolean;
} {
	try {
		const stageInfo: StageInfo | undefined = getStagesInfo(stage);
		if (!stageInfo) throw new Error('Stage info not found');

		const backgroundColor = stageInfo
			? `var(${stageInfo.color})`
			: 'var(--green)';
		let btnBackgroundColor = '#DCE7FF';

		if (stageInfo) {
			btnBackgroundColor = isSelected ? `var(${stageInfo.color})` : '#DCE7FF';
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
