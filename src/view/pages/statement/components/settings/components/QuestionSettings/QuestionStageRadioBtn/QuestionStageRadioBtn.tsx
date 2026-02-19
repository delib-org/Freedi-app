import { FC } from 'react';
import styles from './QuestionStageRadioBtn.module.scss';
import LightBulbIcon from '@/assets/icons/lightBulbIcon.svg?react';
import { setQuestionStage } from '@/controllers/db/statements/statementMetaData/setStatementMetaData';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { statementMetaDataSelector } from '@/redux/statements/statementsMetaSlice';
import { QuestionStep, Statement } from '@freedi/shared-types';
import { getStepInfo, getStepsInfo } from './helpers';

interface Props {
	step: QuestionStep;
	statement: Statement;
}

const QuestionStageRadioBtn: FC<Props> = ({ step, statement }) => {
	const { t } = useTranslation();
	const isSelected = statement.questionSettings?.currentStep === step;
	const { backgroundColor, btnBackgroundColor } = getStepInfo(step, isSelected);
	const stepInfo = getStepsInfo(step);
	const numberOfEvaluators =
		useAppSelector(statementMetaDataSelector(statement.statementId))?.numberOfEvaluators || 0;

	return (
		<div
			className={styles.questionStageRadioBtn}
			style={{ transform: isSelected ? 'scale(1.04)' : 'scale(1)' }}
		>
			<div
				className="question-stage-radio-btn__top"
				style={{
					backgroundColor: backgroundColor,
					opacity: isSelected ? 1 : 0.5,
				}}
			>
				{stepInfo ? stepInfo.icon : <LightBulbIcon className={styles.img} />}
				{step === QuestionStep.suggestion && (
					<div className={styles.number}>{numberOfEvaluators}</div>
				)}
			</div>
			<button
				className="question-stage-radio-btn__radio"
				onClick={() => {
					setQuestionStage({
						statementId: statement.statementId,
						step,
					});
				}}
			>
				<div className={styles.radioButton} style={{ backgroundColor: btnBackgroundColor }}>
					<input type="radio" name="question-stage" id={`question-stage-${step}`} />
					<div className="radio-button__inner"></div>
				</div>
				{t(stepInfo ? stepInfo.name : step)}
			</button>
		</div>
	);
};

export default QuestionStageRadioBtn;
