import React, { FC } from 'react';
import {
	QuestionType,
	Role,
	Statement,
	StatementSettings,
	StatementType,
} from '@freedi/shared-types';
import {
	Search,
	Target,
	Database,
	Scissors,
	Zap,
	SearchCheck,
	Sparkles,
	Layers,
	Settings2,
} from 'lucide-react';
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

interface SubsectionProps {
	icon: React.ElementType;
	title: string;
	description: string;
	children: React.ReactNode;
}

const Subsection: FC<SubsectionProps> = ({ icon: Icon, title, description, children }) => (
	<section className={styles.aiSubsection}>
		<header className={styles.aiSubsectionHeader}>
			<div className={styles.aiSubsectionIcon}>
				<Icon size={18} />
			</div>
			<div className={styles.aiSubsectionTitleGroup}>
				<h4 className={styles.aiSubsectionTitle}>{title}</h4>
				<p className={styles.aiSubsectionDescription}>{description}</p>
			</div>
		</header>
		<div className={styles.aiSubsectionBody}>{children}</div>
	</section>
);

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

	const thresholdPercent = Math.round((settings.similarityThreshold ?? 0.75) * 100);

	return (
		<div className={styles.aiSettings}>
			{/* 1. Detection — "What is similar?" */}
			<Subsection
				icon={SearchCheck}
				title={t('Similarity detection')}
				description={t(
					'Teach the AI when two suggestions count as the same idea. Everything else here builds on this.',
				)}
			>
				<ToggleSwitch
					isChecked={settings.enableSimilaritiesSearch ?? false}
					onChange={(checked) => handleSettingChange('enableSimilaritiesSearch', checked)}
					label={t('Enable similarity detection')}
					description={t('Automatically detect and group similar suggestions')}
					icon={Search}
				/>
				{settings.enableSimilaritiesSearch && (
					<div className={styles.sliderSection}>
						<div className={styles.sliderHeader}>
							<Target size={18} />
							<span className={styles.sliderLabel}>{t('Similarity threshold')}</span>
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
								value={thresholdPercent}
								onChange={(e) =>
									handleSettingChange('similarityThreshold', Number(e.target.value) / 100)
								}
								className={styles.slider}
								style={
									{
										'--slider-progress': `${((thresholdPercent - 50) / 45) * 100}%`,
									} as React.CSSProperties
								}
								aria-label={t('Similarity threshold')}
								aria-valuetext={`${thresholdPercent}%`}
							/>
							<span className={styles.sliderValue}>{thresholdPercent}%</span>
						</div>
					</div>
				)}
			</Subsection>

			{/* 2. Input hygiene — "Catch problems while typing" (questions only) */}
			{isQuestion && (
				<Subsection
					icon={Scissors}
					title={t('Input hygiene')}
					description={t(
						'Help submitters write cleaner suggestions before they ever hit the list.',
					)}
				>
					<ToggleSwitch
						isChecked={settings.defaultLookForSimilarities ?? false}
						onChange={(checked) => handleSettingChange('defaultLookForSimilarities', checked)}
						label={t('Auto-check for similar entries')}
						description={t(
							'When a user types a new suggestion, show them similar existing ones so they can vote rather than duplicate.',
						)}
						icon={Database}
					/>
					<ToggleSwitch
						isChecked={settings.enableMultiSuggestionDetection ?? false}
						onChange={(checked) => handleSettingChange('enableMultiSuggestionDetection', checked)}
						label={t('Detect multi-idea submissions')}
						description={t(
							'Detect when users submit multiple ideas in one entry and offer to split them.',
						)}
						icon={Scissors}
						badge="new"
					/>
				</Subsection>
			)}

			{/* 3. Smart grouping — "Merge similar options into clusters" (questions only) */}
			{isQuestion && (
				<Subsection
					icon={Layers}
					title={t('Smart grouping')}
					description={t(
						'Combine similar suggestions into a representative group. Evaluations roll up; originals stay accessible.',
					)}
				>
					<GroupingSettings statement={statement} settings={settings} />
				</Subsection>
			)}

			{/* 4. Automated synthesis — "Keep cleaning up as new options arrive" (admin only) */}
			{isQuestion && isAdminOrCreator && (
				<Subsection
					icon={Sparkles}
					title={t('Continuous synthesis')}
					description={t(
						'Let the AI maintain clusters in the background so the list stays organized as new suggestions come in.',
					)}
				>
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
				</Subsection>
			)}

			{/* 5. Cluster pipeline — advanced/diagnostic tools (admin only) */}
			{isQuestion && isAdminOrCreator && (
				<Subsection
					icon={Settings2}
					title={t('Cluster pipeline (advanced)')}
					description={t(
						'Diagnostics and manual controls for the semantic & topic clustering pipelines.',
					)}
				>
					<ClusteringAdmin statement={statement} />
				</Subsection>
			)}
		</div>
	);
};

export default AISettings;
