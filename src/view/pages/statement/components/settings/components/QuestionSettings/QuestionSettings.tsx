import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import SectionTitle from '../sectionTitle/SectionTitle';
import './QuestionSettings.scss';
import { setQuestionTypeToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { EvaluationUI, QuestionType, StatementType } from 'delib-npm';
import DocumentIcon from '@/assets/icons/paper.svg?react';
import SimpleIcon from '@/assets/icons/navQuestionsIcon.svg?react';
import ConsentIcon from '@/assets/icons/doubleCheckIcon.svg?react';
import SuggestionsIcon from '@/assets/icons/smile.svg?react';
import VotingIcon from '@/assets/icons/votingIcon.svg?react';
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import { setEvaluationUIType } from '@/controllers/db/evaluation/setEvaluation';

const QuestionSettings: FC<StatementSettingsProps> = ({
	statement,
	// setStatementToEdit,
}) => {
	const { t } = useUserConfig();
	try {
		const { questionSettings } = statement;
		if (statement.statementType !== StatementType.question) return null;

		function handleQuestionType(isDocument: boolean) {
			setQuestionTypeToDB({
				statement,
				questionType: isDocument
					? QuestionType.multiStage
					: QuestionType.massConsensus,
			});
		}

		return (
			<div className='question-settings'>
				<SectionTitle title={t('Evaluation Type')} />
				<MultiSwitch
					options={[
						{ label: t('Agreement'), value: EvaluationUI.suggestions, icon: <SuggestionsIcon />, toolTip: t('Consensus') },
						{ label: t('Voting'), value: EvaluationUI.voting, icon: <VotingIcon />, toolTip: t('Voting') },
						{ label: t('Approval'), value: EvaluationUI.checkbox, icon: <ConsentIcon />, toolTip: t('Consent') },
						{ label: t('Cluster'), value: EvaluationUI.clustering, icon: <ClusterIcon />, toolTip: t('Clustering') },
					]}
					onClick={(value) => { setEvaluationUIType(statement.statementId, value as EvaluationUI); }}
					currentValue={statement.evaluationSettings?.evaluationUI}
				/>

				<SectionTitle title='Question Settings' />

				<CustomSwitchSmall
					label='Document Question'
					checked={
						questionSettings?.questionType ===
						QuestionType.multiStage || false
					}
					setChecked={handleQuestionType}
					textChecked={t('Document Question')}
					imageChecked={<DocumentIcon />}
					imageUnchecked={<SimpleIcon />}
					textUnchecked={t('Simple Question')}
				/>
			</div>
		);
	} catch (error: unknown) {
		console.error(error);

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
