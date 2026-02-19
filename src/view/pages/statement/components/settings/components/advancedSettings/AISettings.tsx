import { FC } from 'react';
import { Statement, StatementSettings, StatementType } from '@freedi/shared-types';
import { Sparkles, Search, Target, Database, Scissors } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EnhancedAdvancedSettings.module.scss';
import ToggleSwitch from './ToggleSwitch';

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

	return (
		<>
			<ToggleSwitch
				isChecked={settings.enableAIImprovement ?? false}
				onChange={(checked) => handleSettingChange('enableAIImprovement', checked)}
				label={t('AI Suggestion Enhancement')}
				description={t('Use AI to improve and refine user suggestions')}
				icon={Sparkles}
				badge="premium"
			/>
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
			{statement.statementType === StatementType.question && (
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
				</>
			)}
		</>
	);
};

export default AISettings;
