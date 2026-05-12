import { FC } from 'react';
import {
	QuestionType,
	Role,
	Statement,
	StatementSettings,
	StatementType,
} from '@freedi/shared-types';
import { Search, Target, Database, Scissors, Zap } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import styles from './EnhancedAdvancedSettings.module.scss';
import ToggleSwitch from './ToggleSwitch';
import GroupingSettings from './GroupingSettings';
import { ClusteringAdmin } from '../ClusteringAdmin';

interface AISettingsProps {
	statement: Statement;
	settings: StatementSettings;
	handleSettingChange: (
		property: keyof StatementSettings,
		newValue: boolean | string | number,
	) => void;
}

const AISettings: FC<AISettingsProps> = ({ statement, settings, handleSettingChange }) => {
	const { t } = useTranslation();
	const subscription = useAppSelector(statementSubscriptionSelector(statement.statementId));
	const isAdminOrCreator = subscription?.role === Role.admin || subscription?.role === Role.creator;
	const isQuestion = statement.statementType === StatementType.question;

	// Live-synth per-question gate (Ship 3b.5). The field isn't on the typed
	// `StatementSettings` schema yet (the codebase ships `@freedi/shared-types`
	// as a packaged .tgz and adding a field would force a coordinated rebuild
	// + reinstall). We read it via a typed cast — same pattern the backend
	// trigger uses when reading the override. Default state shown to admins
	// matches the backend gate: explicit override wins; otherwise ON for MC,
	// OFF for everything else.
	const liveSynthOverride = (settings as unknown as Record<string, unknown>)['liveSynthEnabled'];
	const isMcQuestion = statement.questionSettings?.questionType === QuestionType.massConsensus;
	const liveSynthEffective =
		typeof liveSynthOverride === 'boolean' ? liveSynthOverride : isMcQuestion;
	const handleLiveSynthToggle = (checked: boolean) => {
		handleSettingChange('liveSynthEnabled' as keyof StatementSettings, checked);
	};

	return (
		<>
			<ToggleSwitch
				isChecked={settings.enableSimilaritiesSearch ?? false}
				onChange={(checked) => handleSettingChange('enableSimilaritiesSearch', checked)}
				label={t('Similarity Detection')}
				description={t('Automatically detect and group similar suggestions')}
				icon={Search}
			/>
			{settings.enableSimilaritiesSearch && (
				<div className={styles.sliderSection}>
					<div className={styles.sliderHeader}>
						<Target size={18} />
						<span className={styles.sliderLabel}>{t('Similarity Threshold')}</span>
					</div>
					<p className={styles.sliderDescription}>
						{t('Higher values require stronger similarity (recommended: 75-85%)')}
					</p>
					<div className={styles.sliderContainer}>
						<input
							type="range"
							min="50"
							max="95"
							step="5"
							value={Math.round((settings.similarityThreshold ?? 0.75) * 100)}
							onChange={(e) =>
								handleSettingChange('similarityThreshold', Number(e.target.value) / 100)
							}
							className={styles.slider}
						/>
						<span className={styles.sliderValue}>
							{Math.round((settings.similarityThreshold ?? 0.75) * 100)}%
						</span>
					</div>
				</div>
			)}
			{isQuestion && (
				<>
					<ToggleSwitch
						isChecked={settings.defaultLookForSimilarities ?? false}
						onChange={(checked) => handleSettingChange('defaultLookForSimilarities', checked)}
						label={t('Auto-Check Similarities')}
						description={t('Check for similar statements by default')}
						icon={Database}
					/>
					<ToggleSwitch
						isChecked={settings.enableMultiSuggestionDetection ?? false}
						onChange={(checked) => handleSettingChange('enableMultiSuggestionDetection', checked)}
						label={t('Multi-Suggestion Detection')}
						description={t('Detect when users submit multiple ideas and offer to split them')}
						icon={Scissors}
						badge="new"
					/>
					<GroupingSettings statement={statement} settings={settings} />
					{isAdminOrCreator && (
						<>
							<ToggleSwitch
								isChecked={liveSynthEffective}
								onChange={handleLiveSynthToggle}
								label={t('Live synthesis')}
								description={
									isMcQuestion
										? t(
												'Background trigger merges similar new options into clusters automatically. ON by default for Mass-Consensus questions; toggle off to require manual synthesis.',
											)
										: t(
												'Background trigger merges similar new options into clusters automatically. OFF by default outside Mass-Consensus; toggle on to enable for this question.',
											)
								}
								icon={Zap}
								badge="new"
							/>
							<ClusteringAdmin statement={statement} />
						</>
					)}
				</>
			)}
		</>
	);
};

export default AISettings;
