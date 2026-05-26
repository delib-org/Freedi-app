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
	PenLine,
	GitMerge,
	LayoutGrid,
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

	// Live-synth per-question gate (Ship 3b.5). Field not yet on typed schema;
	// read via cast as the backend trigger does.
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
			{/* 1. Finding similar ideas — foundation: detection + threshold (everyone) */}
			<Subsection
				icon={Search}
				title={t('Finding similar ideas')}
				description={t(
					'Detects when two submissions express the same idea. The threshold here tunes how strict "similar" means for every feature below.',
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

			{/* 2. When people submit — what happens at submission time (questions only) */}
			{isQuestion && (
				<Subsection
					icon={PenLine}
					title={t('When people submit')}
					description={t(
						'What happens at the moment a user submits a suggestion — in submission order.',
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

			{/* 3. Merging duplicates — soft → continuous → on-demand (questions only) */}
			{isQuestion && (
				<Subsection
					icon={GitMerge}
					title={t('Merging duplicates')}
					description={t(
						'Three escalating ways to consolidate near-duplicates after they have been submitted: soft grouping, continuous background merging, and on-demand AI-verified merging.',
					)}
				>
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
						</>
					)}
				</Subsection>
			)}

			{/* 4. Thematic clustering — admin diagnostics for theme-based grouping (admin only) */}
			{isQuestion && isAdminOrCreator && (
				<Subsection
					icon={LayoutGrid}
					title={t('Thematic clustering (advanced)')}
					description={t('Groups ideas by theme rather than duplication. Output drives framings.')}
				>
					<ClusteringAdmin statement={statement} />
				</Subsection>
			)}
		</div>
	);
};

export default AISettings;
