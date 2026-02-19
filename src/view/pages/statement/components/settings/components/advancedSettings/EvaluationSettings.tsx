import React, { FC, useState, useEffect } from 'react';
import { Statement, StatementSettings, evaluationType } from '@freedi/shared-types';
import {
	Target,
	BarChart3,
	ThumbsUp,
	Lock,
	PieChart,
	Vote,
	Award,
	Send,
	RefreshCw,
} from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { setMaxVotesPerUser } from '@/controllers/db/evaluation/setEvaluation';
import { requestRecalculateEvaluations } from '@/controllers/db/evaluation/recalculateEvaluations';
import { logError } from '@/utils/errorHandling';
import styles from './EnhancedAdvancedSettings.module.scss';
import ToggleSwitch from './ToggleSwitch';
import EvaluationCard from './EvaluationCard';

interface EvaluationSettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
}

const EvaluationSettings: FC<EvaluationSettingsProps> = ({
	statement,
	settings,
	handleSettingChange,
}) => {
	const { t } = useTranslation();

	const [isVoteLimitEnabled, setIsVoteLimitEnabled] = useState<boolean>(
		!!statement.evaluationSettings?.maxVotesPerUser,
	);
	const [maxVotes, setMaxVotes] = useState<number>(
		statement.evaluationSettings?.maxVotesPerUser || 3,
	);

	const [isRecalculating, setIsRecalculating] = useState(false);
	const [recalculateResult, setRecalculateResult] = useState<{
		success: boolean;
		statementsProcessed: number;
		statementsFixed: number;
	} | null>(null);

	useEffect(() => {
		setIsVoteLimitEnabled(!!statement.evaluationSettings?.maxVotesPerUser);
		setMaxVotes(statement.evaluationSettings?.maxVotesPerUser || 3);
	}, [statement.statementId, statement.evaluationSettings?.maxVotesPerUser]);

	function handleVoteLimitToggle(enabled: boolean) {
		setIsVoteLimitEnabled(enabled);
		if (enabled) {
			setMaxVotesPerUser(statement.statementId, maxVotes);
		} else {
			setMaxVotesPerUser(statement.statementId, undefined);
		}
	}

	function handleMaxVotesChange(e: React.ChangeEvent<HTMLInputElement>) {
		const value = Number(e.target.value);
		if (value >= 1 && value <= 100) {
			setMaxVotes(value);
			if (isVoteLimitEnabled) {
				setMaxVotesPerUser(statement.statementId, value);
			}
		}
	}

	async function handleRecalculateEvaluations() {
		setIsRecalculating(true);
		setRecalculateResult(null);
		try {
			const result = await requestRecalculateEvaluations(statement.statementId);
			setRecalculateResult({
				success: result.success,
				statementsProcessed: result.statementsProcessed,
				statementsFixed: result.statementsFixed,
			});
		} catch (error) {
			logError(error, {
				operation: 'EvaluationSettings.handleRecalculateEvaluations',
				statementId: statement.statementId,
			});
			setRecalculateResult({
				success: false,
				statementsProcessed: 0,
				statementsFixed: 0,
			});
		} finally {
			setIsRecalculating(false);
		}
	}

	return (
		<>
			<div className={styles.evaluationTypeSection}>
				<h4 className={styles.sectionTitle}>
					<Target size={18} />
					{t('Evaluation Method')}
				</h4>
				<div className={styles.evaluationCards}>
					<EvaluationCard
						type={evaluationType.range}
						title={t('Range Voting')}
						description={t('Rate options on a scale')}
						icon={BarChart3}
						isSelected={(settings.evaluationType ?? evaluationType.range) === evaluationType.range}
						onClick={() => handleSettingChange('evaluationType', evaluationType.range)}
					/>
					<EvaluationCard
						type={evaluationType.singleLike}
						title={t('Single Choice')}
						description={t('Vote for preferred options')}
						icon={ThumbsUp}
						isSelected={
							(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike
						}
						onClick={() => handleSettingChange('evaluationType', evaluationType.singleLike)}
					/>
				</div>
			</div>

			{/* Vote Limiting */}
			{(settings.evaluationType ?? evaluationType.range) === evaluationType.singleLike && (
				<div className={styles.voteLimitSection}>
					<ToggleSwitch
						isChecked={isVoteLimitEnabled}
						onChange={handleVoteLimitToggle}
						label={t('Limit votes per user')}
						description={t('Restrict the number of options users can vote for')}
						icon={Lock}
					/>
					{isVoteLimitEnabled && (
						<div className={styles.voteLimitConfig}>
							<label className={styles.inputGroup}>
								<span>{t('Maximum votes')}</span>
								<input
									type="number"
									min="1"
									max="100"
									value={maxVotes}
									onChange={handleMaxVotesChange}
									className={styles.numberInput}
								/>
								<span className={styles.helperText}>
									{t('Users can vote for up to {{count}} options').replace(
										'{{count}}',
										String(maxVotes),
									)}
								</span>
							</label>
						</div>
					)}
				</div>
			)}

			<ToggleSwitch
				isChecked={settings.showEvaluation ?? false}
				onChange={(checked) => handleSettingChange('showEvaluation', checked)}
				label={t('Show Results')}
				description={t('Display evaluation results to participants')}
				icon={PieChart}
			/>
			<ToggleSwitch
				isChecked={settings.enableEvaluation ?? true}
				onChange={(checked) => handleSettingChange('enableEvaluation', checked)}
				label={t('Enable Voting')}
				description={t('Allow users to vote and evaluate options')}
				icon={Vote}
				badge="recommended"
			/>
			<ToggleSwitch
				isChecked={settings.inVotingGetOnlyResults ?? false}
				onChange={(checked) => handleSettingChange('inVotingGetOnlyResults', checked)}
				label={t('Show Top Results Only')}
				description={t('Display only highest-rated options in voting view')}
				icon={Award}
			/>
			<ToggleSwitch
				isChecked={settings.isSubmitMode ?? false}
				onChange={(checked) => handleSettingChange('isSubmitMode', checked)}
				label={t('Submit Mode')}
				description={t('Users submit final choices rather than continuous voting')}
				icon={Send}
			/>

			{/* Recalculate Evaluation Data */}
			<div className={styles.exportDivider} />
			<h4 className={styles.sectionTitle}>
				<RefreshCw size={18} />
				{t('Recalculate Evaluation Data')}
			</h4>
			<p className={styles.sectionDescription}>
				{t(
					'Fix any inconsistencies in evaluation counts by recalculating from actual evaluation data. Use this if you notice incorrect vote counts.',
				)}
			</p>
			<div className={styles.exportButtons}>
				<button
					className={`${styles.exportButton} ${styles['exportButton--warning']}`}
					onClick={handleRecalculateEvaluations}
					disabled={isRecalculating}
				>
					<RefreshCw size={18} className={isRecalculating ? styles.spinning : ''} />
					{isRecalculating ? t('Recalculating...') : t('Recalculate')}
				</button>
			</div>
			{recalculateResult && (
				<p
					className={`${styles.exportInfo} ${recalculateResult.success ? styles['exportInfo--success'] : styles['exportInfo--error']}`}
				>
					{recalculateResult.success
						? t('Processed {{processed}} options, fixed {{fixed}} inconsistencies')
								.replace('{{processed}}', String(recalculateResult.statementsProcessed))
								.replace('{{fixed}}', String(recalculateResult.statementsFixed))
						: t('Recalculation failed. Please try again.')}
				</p>
			)}
		</>
	);
};

export default EvaluationSettings;
