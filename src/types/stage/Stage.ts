import { StatementType } from '../TypeEnums';
import { Statement } from '../statement/Statement';
import { createBasicStatement } from '../statement/StatementUtils';

export enum StageType {
	explanation = 'explanation',
	questions = 'questions',
	needs = 'needs',
	suggestions = 'suggestions',
	hypothesis = 'hypothesis',
	voting = 'voting',
	conclusion = 'conclusion',
	summary = 'summary',
	other = 'other',
}

export class StageClass {
	private readonly basicStagesTypes = [
		StageType.explanation,
		StageType.needs,
		StageType.questions,
		StageType.summary,
	];

	createBasicStages(statement: Statement): Statement[] {
		try {
			const stages: Statement[] = [];
			this.basicStagesTypes.forEach((stageType) => {
				const newStage = this.createStage(statement, stageType);
				if (!newStage) throw new Error('Could not create stage');
				stages.push(newStage);
			});

			return stages;
		} catch (error) {
			console.error(error);

			return [];
		}
	}

	private createStage(
		statement: Statement,
		stageType: StageType
	): Statement | undefined {
		try {
			const newStage = createBasicStatement({
				parentStatement: statement,
				user: statement.creator,
				stageType: stageType,
				statementType: StatementType.stage,
				statement: this.convertToStageTitle(stageType),
				description: '',
			});
			if (!newStage) throw new Error('Could not create stage');

			return newStage;
		} catch (error) {
			console.error(error);

			return undefined;
		}
	}

	convertToStageTitle(stageType: StageType | undefined): string {
		if (!stageType) return 'Unknown';
		switch (stageType) {
			case StageType.explanation:
				return 'Explanation';
			case StageType.needs:
				return 'Needs';
			case StageType.questions:
				return 'Questions';
			case StageType.suggestions:
				return 'Suggestions';
			case StageType.summary:
				return 'Summary';
			default:
				return 'Unknown';
		}
	}

	basicStages(statement: Statement): Statement[] {
		return this.createBasicStages(statement);
	}

	get getBasicStagesTypes(): StageType[] {
		return this.basicStagesTypes;
	}
}
