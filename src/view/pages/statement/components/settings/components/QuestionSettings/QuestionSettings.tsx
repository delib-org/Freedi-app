/**
 * NAMING CLARIFICATION:
 * - EvaluationUI (evaluationSettings.evaluationUI) = Evaluation MODE (how users participate: suggestions, voting, checkbox, clustering)
 * - evaluationType (statementSettings.evaluationType) = Rating SCALE (what input UI they see: range/5-point, likeDislike/simple, singleLike/like-only)
 */
import { FC } from 'react';
import { StatementSettingsProps } from '../../settingsTypeHelpers';
import SectionTitle from '../sectionTitle/SectionTitle';
import styles from './QuestionSettings.module.scss';
import { setStatementSettingToDB } from '@/controllers/db/statementSettings/setStatementSettings';
import { EvaluationUI, StatementType, evaluationType } from '@freedi/shared-types';
import ConsentIcon from '@/assets/icons/doubleCheckIcon.svg?react';
import SuggestionsIcon from '@/assets/icons/smile.svg?react';
import VotingIcon from '@/assets/icons/votingIcon.svg?react';
import ClusterIcon from '@/assets/icons/networkIcon.svg?react';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import LikeIcon from '@/assets/icons/likeIcon.svg?react';
import EvaluationsIcon from '@/assets/icons/evaluationsIcon.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import MultiSwitch from '@/view/components/switch/multiSwitch/MultiSwitch';
import RatingScaleButtons from './RatingScaleButtons/RatingScaleButtons';
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import { setEvaluationUIType } from '@/controllers/db/evaluation/setEvaluation';
import VotingSettings from './votingSettings/VotingSettings';
import { logError } from '@/utils/errorHandling';

// Sub-components
import QuestionLinkSection from './QuestionLinkSection';
import AnchoredSettings from './AnchoredSettings';

const QuestionSettings: FC<StatementSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();

	try {
		const { questionSettings } = statement;
		if (statement.statementType !== StatementType.question) return null;
		const isVoting = statement.evaluationSettings?.evaluationUI === EvaluationUI.voting;

		function handleRequireSolutionToggle(enabled: boolean) {
			setStatementSettingToDB({
				statement,
				property: 'askUserForASolutionBeforeEvaluation',
				newValue: enabled,
				settingsSection: 'questionSettings',
			});
		}

		/**
		 * Handle evaluation type change - sets both evaluationSettings.evaluationUI
		 * and statementSettings.evaluationType for main app compatibility
		 */
		function handleEvaluationTypeChange(value: EvaluationUI) {
			setEvaluationUIType(statement.statementId, value);

			let evalType: evaluationType;
			switch (value) {
				case EvaluationUI.voting:
				case EvaluationUI.checkbox:
					evalType = evaluationType.singleLike;
					break;
				case EvaluationUI.suggestions:
				case EvaluationUI.clustering:
				default:
					evalType = evaluationType.range;
					break;
			}

			setStatementSettingToDB({
				statement,
				property: 'evaluationType',
				newValue: evalType,
				settingsSection: 'statementSettings',
			});

			setStatementSettingToDB({
				statement,
				property: 'enhancedEvaluation',
				newValue: evalType === evaluationType.range,
				settingsSection: 'statementSettings',
			});
		}

		/**
		 * Handle rating scale change - sets statementSettings.evaluationType
		 */
		function handleRatingScaleChange(scale: evaluationType) {
			setStatementSettingToDB({
				statement,
				property: 'evaluationType',
				newValue: scale,
				settingsSection: 'statementSettings',
			});

			setStatementSettingToDB({
				statement,
				property: 'enhancedEvaluation',
				newValue: scale === evaluationType.range,
				settingsSection: 'statementSettings',
			});
		}

		return (
			<div className={styles.questionSettings}>
				<SectionTitle title={t('Evaluation Mode')} />
				<MultiSwitch
					options={[
						{
							label: t('Agreement'),
							value: EvaluationUI.suggestions,
							icon: <SuggestionsIcon />,
							toolTip: t('Consensus'),
						},
						{
							label: t('Voting'),
							value: EvaluationUI.voting,
							icon: <VotingIcon />,
							toolTip: t('Voting'),
						},
						{
							label: t('Approval'),
							value: EvaluationUI.checkbox,
							icon: <ConsentIcon />,
							toolTip: t('Consent'),
						},
						{
							label: t('Cluster'),
							value: EvaluationUI.clustering,
							icon: <ClusterIcon />,
							toolTip: t('Clustering'),
						},
					]}
					onClick={(value) => {
						handleEvaluationTypeChange(value as EvaluationUI);
					}}
					currentValue={statement.evaluationSettings?.evaluationUI}
				/>
				{isVoting && <VotingSettings />}

				<SectionTitle title={t('Rating Scale')} />
				<RatingScaleButtons
					options={[
						{
							label: t('5-Point Scale'),
							value: evaluationType.range,
							icon: <SuggestionsIcon />,
							toolTip: t('5 emoji faces from negative to positive'),
							score: 0,
						},
						{
							label: t('Simple Scale'),
							value: evaluationType.likeDislike,
							icon: <EvaluationsIcon />,
							toolTip: t('Thumbs up or down'),
							score: 1,
						},
						{
							label: t('Like Only'),
							value: evaluationType.singleLike,
							icon: <LikeIcon />,
							toolTip: t('Only positive feedback'),
							score: 2,
						},
						{
							label: t('Community Voice'),
							value: evaluationType.communityVoice,
							icon: <UsersIcon />,
							toolTip: t('Respectful 4-level resonance scale'),
							score: 3,
						},
					]}
					onClick={(value) => {
						handleRatingScaleChange(value as evaluationType);
					}}
					currentValue={statement.statementSettings?.evaluationType || evaluationType.range}
				/>

				<SectionTitle title={t('Question Settings')} />

				<QuestionLinkSection statementId={statement.statementId} />

				<SectionTitle title={t('Mass Consensus Settings')} />
				<p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
					{t('These settings control the new Mass Consensus app behavior')}
				</p>

				<h3 className="title">{t('Require original input before viewing others')}</h3>
				<CustomSwitchSmall
					label={t('Request solution at start')}
					checked={questionSettings?.askUserForASolutionBeforeEvaluation || false}
					setChecked={handleRequireSolutionToggle}
					textChecked={t('Request solution at start')}
					textUnchecked={t("Don't ask")}
					imageChecked={<SuggestionsIcon />}
					imageUnchecked={<SuggestionsIcon />}
					colorChecked="var(--question)"
					colorUnchecked="var(--question)"
				/>

				<AnchoredSettings statement={statement} />
			</div>
		);
	} catch (error: unknown) {
		logError(error, { operation: 'QuestionSettings.QuestionSettings' });

		return <p>{(error as Error).message}</p>;
	}
};

export default QuestionSettings;
